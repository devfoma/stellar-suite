/**
 * eventSubscriber.ts
 *
 * Real-time Soroban contract event streaming via cursor-based polling against
 * the Stellar RPC `getEvents` endpoint.
 *
 * The Stellar RPC does not expose a native SSE push channel; the idiomatic
 * approach is to poll `getEvents` with an advancing `cursor` (paging token),
 * which gives the same "stream" semantics with full control over back-pressure
 * and cleanup.
 *
 * Usage:
 *   const sub = createEventSubscriber({
 *     rpcUrl:     "https://soroban-testnet.stellar.org",
 *     contractId: "C...",
 *     onEvent:    (evt) => console.log("[event]", evt),
 *     onError:    (err) => console.error("[event error]", err),
 *   });
 *
 *   sub.start();
 *   // later…
 *   sub.stop();
 */

import { Server } from "@stellar/stellar-sdk/rpc";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Normalised shape returned for every contract event. */
export interface ContractEvent {
  /** ISO-8601 timestamp from the ledger that emitted this event. */
  timestamp: string;
  /**
   * Human-readable topic string.  The first topic segment is decoded as a
   * Symbol (the most common pattern for Soroban events); remaining segments
   * are kept as raw base-64 XDR so callers can decode them further if needed.
   */
  topic: string;
  /** Full event value serialised to a JSON string. */
  data: string;
  /** Unique event ID (TOID-based, from the RPC response). */
  id: string;
  /** The contract that emitted this event. */
  contractId: string;
  /** Hash of the transaction that triggered this event. */
  txHash: string;
}

export interface EventSubscriberOptions {
  /** Soroban RPC URL (e.g. `customRpcUrl` from the workspace store). */
  rpcUrl: string;
  /** Stellar contract address to filter events for. */
  contractId: string;
  /** Called for every new event received. */
  onEvent: (event: ContractEvent) => void;
  /** Called when a polling cycle fails. Subscriber keeps running unless you call stop(). */
  onError?: (error: Error) => void;
  /** How often to poll for new events, in milliseconds. Defaults to 3 000. */
  pollIntervalMs?: number;
  /** Maximum number of events to keep in the internal ring-buffer. Defaults to 100. */
  bufferSize?: number;
}

export interface EventSubscriber {
  /** Begin polling. Safe to call multiple times (no-op if already running). */
  start: () => void;
  /** Stop polling and release resources. */
  stop: () => void;
  /** Read-only snapshot of the current ring-buffer contents (oldest → newest). */
  getBuffer: () => readonly ContractEvent[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_BUFFER_SIZE = 100;

/**
 * Decode the first XDR topic segment as a Symbol string.
 * Falls back to the raw base-64 value if decoding fails.
 */
function decodeFirstTopic(topics: unknown): string {
  if (!Array.isArray(topics) || !topics.length) return "(no topic)";
  const firstTopic = topics[0];
  const topicStr = typeof firstTopic === "string" ? firstTopic : String(firstTopic);
  // The first segment is almost always a Symbol — try to extract the ASCII
  // payload from the base-64 XDR without pulling in the full XDR decoder.
  try {
    const raw = atob(topicStr);
    // ScVal Symbol: type byte 0x0F followed by a 4-byte length then ASCII
    // We just grab printable ASCII chars from the decoded bytes.
    const printable = Array.from(raw)
      .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f)
      .join("")
      .trim();
    return printable || topicStr;
  } catch {
    return topicStr;
  }
}

/** Append to a fixed-size ring-buffer (mutates in place, returns the array). */
function pushToBuffer<T>(buffer: T[], item: T, maxSize: number): T[] {
  buffer.push(item);
  if (buffer.length > maxSize) {
    buffer.splice(0, buffer.length - maxSize);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEventSubscriber(
  options: EventSubscriberOptions,
): EventSubscriber {
  const {
    rpcUrl,
    contractId,
    onEvent,
    onError,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    bufferSize = DEFAULT_BUFFER_SIZE,
  } = options;

  const allowHttp = rpcUrl.startsWith("http://");
  const server = new Server(rpcUrl, { allowHttp });

  // Ring-buffer — capped at `bufferSize` entries
  const buffer: ContractEvent[] = [];

  // Cursor advances after each successful poll so we never re-process events
  let cursor: string | undefined;

  // Ledger to start from on the very first poll (latest - small lookback)
  let startLedger: number | undefined;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  // ── Core poll function ──────────────────────────────────────────────────

  async function poll(): Promise<void> {
    try {
      // On the first call we need a concrete startLedger; derive it from the
      // latest ledger reported by the RPC so we only see *new* events.
      if (startLedger === undefined && cursor === undefined) {
        const latestLedger = await server.getLatestLedger();
        // Look back a small window so we catch events from the last ~30 s
        startLedger = Math.max(1, latestLedger.sequence - 5);
      }

      const response = await server.getEvents({
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
          },
        ],
        // Use cursor-based paging after the first call
        ...(cursor !== undefined
          ? { cursor }
          : { startLedger: startLedger! }),
        limit: 100,
      });

      for (const raw of response.events) {
        const event: ContractEvent = {
          id: raw.id,
          contractId: typeof raw.contractId === "string" ? raw.contractId : (raw.contractId?.toString() ?? ""),
          txHash: raw.txHash ?? "",
          timestamp: raw.ledgerClosedAt ?? new Date().toISOString(),
          topic: decodeFirstTopic(raw.topic),
          data: (() => {
            try {
              return JSON.stringify(raw.value);
            } catch {
              return String(raw.value);
            }
          })(),
        };

        pushToBuffer(buffer, event, bufferSize);

        // Required verification log — visible in the browser DevTools console
        console.log(
          `[eventSubscriber] contract=${contractId} id=${event.id}`,
          event,
        );

        onEvent(event);

        // Advance cursor to the paging token of the last processed event.
        // Using the per-event pagingToken (rather than the response-level cursor)
        // is the most reliable way to resume exactly where we left off.
        const rawRecord = raw as unknown as Record<string, unknown>;
        if (rawRecord.pagingToken) {
          cursor = String(rawRecord.pagingToken);
        }
      }

      // If no events came back but the response carries a top-level cursor, use it
      if (!response.events.length && response.cursor) {
        cursor = response.cursor;
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      console.warn("[eventSubscriber] poll error:", error.message);
      onError?.(error);
    }
  }

  // ── Scheduler ───────────────────────────────────────────────────────────

  function schedule(): void {
    if (!running) return;
    timerId = setTimeout(async () => {
      await poll();
      schedule(); // re-arm after each cycle completes (avoids overlap)
    }, pollIntervalMs);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    start() {
      if (running) return;
      running = true;
      console.log(
        `[eventSubscriber] started — contract=${contractId} rpc=${rpcUrl} interval=${pollIntervalMs}ms`,
      );
      // Fire the first poll immediately, then schedule subsequent ones
      poll().then(schedule);
    },

    stop() {
      if (!running) return;
      running = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      console.log(`[eventSubscriber] stopped — contract=${contractId}`);
    },

    getBuffer() {
      return buffer as readonly ContractEvent[];
    },
  };
}

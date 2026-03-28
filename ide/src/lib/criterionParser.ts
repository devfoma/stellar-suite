/**
 * criterionParser.ts
 *
 * Parses the stdout/stderr from `cargo bench --message-format=json` into
 * structured benchmark samples.
 *
 * Handles two output formats:
 *   1. Criterion text output: "bench_name  time:   [low est high]"
 *   2. libtest JSON format:   {"type":"bench","name":...,"median":...,"deviation":...}
 */

export interface CriterionSample {
  /** Benchmark name as reported by cargo */
  name: string;
  /** Mean (estimate) execution time in nanoseconds */
  mean: number;
  /** Lower 95% CI bound in nanoseconds */
  low: number;
  /** Upper 95% CI bound in nanoseconds */
  high: number;
  /** Approximate P95 in nanoseconds (mean + 1.645σ) */
  p95: number;
  /** Approximate P99 in nanoseconds (mean + 2.576σ) */
  p99: number;
  /** Human-readable unit as reported (ns, µs, ms, s) */
  unit: string;
}

export interface CriterionParseResult {
  samples: CriterionSample[];
  buildMessages: string[];
  errors: string[];
  raw: string;
}

// ── Unit conversion ──────────────────────────────────────────────────────────

const UNIT_TO_NS: Record<string, number> = {
  ns: 1,
  "µs": 1_000,
  us: 1_000,
  ms: 1_000_000,
  s: 1_000_000_000,
};

function convertToNs(value: number, unit: string): number {
  return value * (UNIT_TO_NS[unit] ?? 1);
}

function stddevFromCI(low: number, high: number): number {
  // 95% CI spans ±1.96 σ
  return Math.max((high - low) / (2 * 1.96), 0);
}

// ── Criterion text-format regex ───────────────────────────────────────────────
//
// Matches lines like:
//   "amm/swap              time:   [48.234 ns 49.123 ns 50.234 ns]"
//   "bench_counter         time:   [1.2345 µs 1.2500 µs 1.2789 µs]"
//
const CRITERION_TIME_RE =
  /^([\w/\s:.-]+?)\s{2,}time:\s+\[\s*([\d.]+)\s*(\S+)\s+([\d.]+)\s*(\S+)\s+([\d.]+)\s*(\S+)\s*\]/;

// ── libtest JSON bench interface ──────────────────────────────────────────────

interface LibtestBenchMsg {
  type: string;
  name?: string;
  /** Nanoseconds per iteration */
  median?: number;
  deviation?: number;
}

interface CargoJsonMsg {
  reason?: string;
  message?: { rendered?: string };
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseCriterionOutput(raw: string): CriterionParseResult {
  const samples: CriterionSample[] = [];
  const buildMessages: string[] = [];
  const errors: string[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // JSON lines — could be libtest bench or cargo metadata
    if (trimmed.startsWith("{")) {
      try {
        const msg = JSON.parse(trimmed) as LibtestBenchMsg & CargoJsonMsg;

        if (
          msg.type === "bench" &&
          typeof msg.name === "string" &&
          typeof msg.median === "number"
        ) {
          const mean = msg.median; // nanoseconds
          const std =
            typeof msg.deviation === "number"
              ? msg.deviation
              : mean * 0.05;
          const low = Math.max(0, mean - 1.96 * std);
          const high = mean + 1.96 * std;
          samples.push({
            name: msg.name,
            mean,
            low,
            high,
            p95: mean + 1.645 * std,
            p99: mean + 2.576 * std,
            unit: "ns",
          });
        } else if (msg.reason === "compiler-message" && msg.message?.rendered) {
          buildMessages.push(msg.message.rendered);
        } else if (msg.reason === "build-finished") {
          // ignore — expected end-of-build signal
        }
      } catch {
        // not valid JSON — fall through to text parsing
      }
      continue;
    }

    // Criterion text output
    const match = CRITERION_TIME_RE.exec(trimmed);
    if (match) {
      const [, rawName, lowVal, lowUnit, estVal, estUnit, highVal] = match;
      const low = convertToNs(parseFloat(lowVal), lowUnit);
      const mean = convertToNs(parseFloat(estVal), estUnit);
      const high = convertToNs(parseFloat(highVal), lowUnit);
      const std = stddevFromCI(low, high);

      samples.push({
        name: rawName.trim(),
        mean,
        low,
        high,
        p95: mean + 1.645 * std,
        p99: mean + 2.576 * std,
        unit: estUnit,
      });
    }
  }

  return { samples, buildMessages, errors, raw };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format nanoseconds into a human-readable string */
export function formatNs(ns: number): string {
  if (ns >= 1_000_000_000) return `${(ns / 1_000_000_000).toFixed(3)} s`;
  if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(3)} ms`;
  if (ns >= 1_000) return `${(ns / 1_000).toFixed(3)} µs`;
  return `${ns.toFixed(1)} ns`;
}

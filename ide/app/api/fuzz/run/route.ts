import { spawn } from "node:child_process";

import { NextRequest } from "next/server";

import {
  prepareRustWorkspace,
  type PreparedWorkspace,
  type RustWorkspacePayload,
} from "../../_lib/rustTooling";
import { mapPathToVirtualId } from "@/utils/cargoParser";

export const runtime = "nodejs";

interface FuzzRunPayload extends RustWorkspacePayload {
  targetName?: string;
  durationSeconds?: number;
}

const encoder = new TextEncoder();

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const formatSseEvent = (event: string, data: Record<string, unknown>) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const clampDurationSeconds = (value: number | undefined) => {
  if (!Number.isFinite(value)) {
    return 600;
  }
  return Math.max(30, Math.min(1800, Math.floor(value as number)));
};

const parseCrashLocation = (line: string, contractName: string) => {
  const location = line.match(/([^\s:]+\.rs):(\d+)(?::(\d+))?/);
  if (!location) {
    return null;
  }

  const fileId = mapPathToVirtualId(location[1], contractName);
  const lineNumber = Number(location[2]);
  const column = Number(location[3] ?? "1");

  if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) {
    return null;
  }

  return {
    fileId,
    line: lineNumber,
    column,
    endLine: lineNumber,
    endColumn: column + 1,
  };
};

const lineLooksLikeCrash = (line: string) =>
  /ERROR:|AddressSanitizer|artifact_prefix=|crash-|panic|thread '.*' panicked/.test(
    line,
  );

const lineLooksLikeIteration = (line: string) =>
  /^#\d+\s/.test(line) || /exec\/s|cov:|pulse\s/.test(line);

const isCargoFuzzMissing = (message: string) =>
  /no such command: `?fuzz`?/i.test(message) ||
  /install cargo-fuzz/i.test(message) ||
  /not recognized as an internal or external command/i.test(message);

export async function POST(request: NextRequest) {
  let payload: FuzzRunPayload;

  try {
    payload = (await request.json()) as FuzzRunPayload;
  } catch {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            formatSseEvent("error", { message: "Invalid JSON payload." }),
          );
          controller.close();
        },
      }),
      {
        status: 400,
        headers: sseHeaders,
      },
    );
  }

  if (!payload.contractName?.trim()) {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            formatSseEvent("error", { message: "contractName is required." }),
          );
          controller.close();
        },
      }),
      {
        status: 400,
        headers: sseHeaders,
      },
    );
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            formatSseEvent("error", { message: "files[] payload is required." }),
          );
          controller.close();
        },
      }),
      {
        status: 400,
        headers: sseHeaders,
      },
    );
  }

  const targetName =
    payload.targetName?.trim().replace(/[^a-zA-Z0-9_]/g, "_") || "contract_fuzz";
  const durationSeconds = clampDurationSeconds(payload.durationSeconds);

  let workspace: PreparedWorkspace | null = null;

  return new Response(
    new ReadableStream({
      async start(controller) {
        let cleanedUp = false;
        let timedOut = false;
        let iterationCount = 0;
        let lineBufferOut = "";
        let lineBufferErr = "";

        const cleanup = async () => {
          if (!workspace || cleanedUp) {
            return;
          }
          cleanedUp = true;
          await workspace.cleanup();
        };

        try {
          workspace = await prepareRustWorkspace(payload, { mode: "shared" });
        } catch (error) {
          controller.enqueue(
            formatSseEvent("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to prepare Rust workspace.",
            }),
          );
          await cleanup();
          controller.close();
          return;
        }

        controller.enqueue(
          formatSseEvent("meta", {
            command: "cargo fuzz run",
            targetName,
            durationSeconds,
          }),
        );

        const child = spawn(
          "cargo",
          [
            "fuzz",
            "run",
            targetName,
            "--",
            `-max_total_time=${durationSeconds}`,
          ],
          {
            cwd: workspace.contractDir,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        const timeoutId = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, durationSeconds * 1000);

        const emitLine = (source: "stdout" | "stderr", line: string) => {
          const trimmed = line.trimEnd();
          if (!trimmed) {
            return;
          }

          controller.enqueue(
            formatSseEvent("log", {
              source,
              line: trimmed,
            }),
          );

          if (lineLooksLikeIteration(trimmed)) {
            const match = trimmed.match(/^#(\d+)\s/);
            iterationCount = match ? Number(match[1]) : iterationCount + 1;
            controller.enqueue(
              formatSseEvent("iteration", {
                count: iterationCount,
              }),
            );
          }

          if (lineLooksLikeCrash(trimmed)) {
            const location = parseCrashLocation(trimmed, payload.contractName);
            controller.enqueue(
              formatSseEvent("crash", {
                line: trimmed,
                location,
              }),
            );
          }
        };

        const drainBuffer = (source: "stdout" | "stderr", final = false) => {
          if (source === "stdout") {
            const chunks = lineBufferOut.split(/\r?\n/);
            lineBufferOut = chunks.pop() ?? "";
            for (const line of chunks) {
              emitLine(source, line);
            }
            if (final && lineBufferOut.trim()) {
              emitLine(source, lineBufferOut);
              lineBufferOut = "";
            }
            return;
          }

          const chunks = lineBufferErr.split(/\r?\n/);
          lineBufferErr = chunks.pop() ?? "";
          for (const line of chunks) {
            emitLine(source, line);
          }
          if (final && lineBufferErr.trim()) {
            emitLine(source, lineBufferErr);
            lineBufferErr = "";
          }
        };

        child.stdout.on("data", (chunk) => {
          lineBufferOut += String(chunk);
          drainBuffer("stdout");
        });

        child.stderr.on("data", (chunk) => {
          lineBufferErr += String(chunk);
          drainBuffer("stderr");
        });

        child.on("error", async (error) => {
          clearTimeout(timeoutId);
          controller.enqueue(
            formatSseEvent("error", {
              message: isCargoFuzzMissing(error.message)
                ? "cargo-fuzz is missing. Install it with: cargo install cargo-fuzz"
                : error.message,
            }),
          );
          await cleanup();
          controller.close();
        });

        child.on("close", async (code) => {
          clearTimeout(timeoutId);
          drainBuffer("stdout", true);
          drainBuffer("stderr", true);

          controller.enqueue(
            formatSseEvent("done", {
              exitCode: typeof code === "number" ? code : 1,
              timedOut,
              status: timedOut ? "timeout" : code === 0 ? "ok" : "failed",
            }),
          );

          await cleanup();
          controller.close();
        });
      },
      async cancel() {
        if (workspace) {
          await workspace.cleanup();
        }
      },
    }),
    {
      headers: sseHeaders,
    },
  );
}

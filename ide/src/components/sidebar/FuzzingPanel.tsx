"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Bug, Loader2, Play, Shield, Square, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDiagnosticsStore } from "@/store/useDiagnosticsStore";
import {
  flattenWorkspaceFiles,
  useWorkspaceStore,
} from "@/store/workspaceStore";
import type { Diagnostic } from "@/utils/cargoParser";

interface FuzzInitResponse {
  targetName: string;
  files: { path: string; content: string }[];
}

interface FuzzLocation {
  fileId: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface CrashEvent {
  id: string;
  line: string;
  location: FuzzLocation | null;
}

type FuzzBanner = { kind: "info" | "success" | "error"; text: string } | null;

const pathExistsInTree = (pathParts: string[]) => {
  const nodes = useWorkspaceStore.getState().files;
  let currentNodes = nodes;

  for (const segment of pathParts) {
    const found = currentNodes.find((node) => node.name === segment);
    if (!found) {
      return false;
    }
    currentNodes = found.children ?? [];
  }

  return true;
};

const toDiagnostics = (location: FuzzLocation, line: string): Diagnostic => ({
  fileId: location.fileId,
  line: location.line,
  column: location.column,
  endLine: location.endLine,
  endColumn: location.endColumn,
  message: `Fuzz crash candidate: ${line}`,
  severity: "error",
  code: "FUZZ_CRASH",
});

export function FuzzingPanel() {
  const {
    files,
    activeTabPath,
    createFolder,
    createFile,
    addTab,
    setActiveTabPath,
  } = useWorkspaceStore();
  const { setDiagnostics } = useDiagnosticsStore();

  const [durationMinutes, setDurationMinutes] = useState(10);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [crashes, setCrashes] = useState<CrashEvent[]>([]);
  const [iterationCount, setIterationCount] = useState(0);
  const [banner, setBanner] = useState<FuzzBanner>(null);

  const abortRef = useRef<AbortController | null>(null);

  const contractName = useMemo(
    () => activeTabPath[0] ?? files[0]?.name ?? "hello_world",
    [activeTabPath, files],
  );

  const appendLog = (line: string) => {
    setLogs((prev) => {
      const next = [...prev, line];
      return next.slice(-500);
    });
  };

  const ensurePath = (segments: string[]) => {
    if (segments.length <= 1) {
      return;
    }

    const contractRoot = [segments[0]];
    for (let index = 1; index < segments.length; index += 1) {
      const currentPath = [...contractRoot, ...segments.slice(1, index + 1)];
      if (!pathExistsInTree(currentPath)) {
        createFolder([...contractRoot, ...segments.slice(1, index)], segments[index]);
      }
    }
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    setBanner({ kind: "info", text: "Generating fuzz target scaffold..." });

    try {
      const response = await fetch("/api/fuzz/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          files: flattenWorkspaceFiles(files),
        }),
      });

      const payload = (await response.json()) as FuzzInitResponse | { error: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Unable to initialize fuzz target.");
      }

      if (!("files" in payload)) {
        throw new Error("Fuzz initialization response is missing generated files.");
      }

      for (const generatedFile of payload.files) {
        const segments = [contractName, ...generatedFile.path.split("/")];

        ensurePath(segments.slice(0, -1));

        if (!pathExistsInTree(segments)) {
          createFile(segments.slice(0, -1), segments[segments.length - 1], generatedFile.content);
        }
      }

      setBanner({ kind: "success", text: "Fuzz target scaffold created under fuzz/." });
      toast.success("Fuzz target initialized");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Initialization failed.";
      setBanner({ kind: "error", text: message });
      toast.error(message);
    } finally {
      setIsInitializing(false);
    }
  };

  const openCrash = (crash: CrashEvent) => {
    if (!crash.location) {
      return;
    }

    const pathParts = crash.location.fileId.split("/");
    const fileName = pathParts[pathParts.length - 1];
    addTab(pathParts, fileName);
    setActiveTabPath(pathParts);

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("jumpToPosition", {
          detail: {
            line: crash.location?.line,
            column: crash.location?.column,
          },
        }),
      );
    }, 100);
  };

  const stopRun = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    appendLog("[fuzz] Stopped by user.");
    setBanner({ kind: "info", text: "Fuzz run stopped." });
  };

  const handleRun = async () => {
    if (isRunning) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setIterationCount(0);
    setCrashes([]);
    setDiagnostics([]);
    setBanner({ kind: "info", text: "Fuzzing in progress..." });
    appendLog(`[fuzz] Starting run for ${contractName}. Runtime cap: ${durationMinutes} minute(s).`);

    try {
      const response = await fetch("/api/fuzz/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractName,
          files: flattenWorkspaceFiles(files),
          durationSeconds: durationMinutes * 60,
        }),
        signal: controller.signal,
      });

      if (!response.body) {
        throw new Error("No response stream received from fuzz runner.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (block: string) => {
        const lines = block.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) {
          return;
        }

        const eventName = eventLine.slice(6).trim();
        const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;

        if (eventName === "log") {
          appendLog(String(payload.line ?? ""));
          return;
        }

        if (eventName === "iteration") {
          const count = Number(payload.count ?? 0);
          if (Number.isFinite(count)) {
            setIterationCount(count);
          }
          return;
        }

        if (eventName === "crash") {
          const crash: CrashEvent = {
            id: `${Date.now()}-${Math.random()}`,
            line: String(payload.line ?? "unknown crash"),
            location: (payload.location as FuzzLocation | null) ?? null,
          };

          setCrashes((prev) => [crash, ...prev]);

          if (crash.location) {
            const current = useDiagnosticsStore.getState().diagnostics;
            setDiagnostics([...current, toDiagnostics(crash.location, crash.line)]);
          }
          return;
        }

        if (eventName === "error") {
          const message = String(payload.message ?? "Fuzzing failed.");
          setBanner({ kind: "error", text: message });
          appendLog(`[fuzz:error] ${message}`);
          return;
        }

        if (eventName === "done") {
          const status = String(payload.status ?? "unknown");
          if (status === "ok") {
            setBanner({ kind: "success", text: "Fuzzing completed without crashes." });
          } else if (status === "timeout") {
            setBanner({ kind: "info", text: "Fuzzing stopped at runtime limit." });
          } else {
            setBanner({ kind: "error", text: "Fuzzing process exited with failure." });
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          handleEvent(block);
        }
      }

      if (buffer.trim()) {
        handleEvent(buffer);
      }
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        const message =
          error instanceof Error ? error.message : "Unexpected fuzzing failure.";
        setBanner({ kind: "error", text: message });
        appendLog(`[fuzz:error] ${message}`);
      }
    } finally {
      abortRef.current = null;
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center gap-2 text-primary">
          <Bug className="h-4 w-4" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">Fuzzing</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Guided cargo-fuzz setup for edge-case crash discovery in smart contracts.
        </p>
      </div>

      <div className="space-y-3 border-b border-sidebar-border px-3 py-3">
        <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 text-foreground">
            <Shield className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-semibold">Compute Cost Note</span>
          </div>
          Fuzzing can consume high CPU and memory. The run is capped by default to 10 minutes to prevent runaway usage.
        </div>

        <div className="space-y-1.5">
          <label htmlFor="fuzz-duration" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Runtime Limit
          </label>
          <select
            id="fuzz-duration"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            disabled={isRunning}
          >
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleInitialize} disabled={isInitializing || isRunning} className="gap-1.5">
            {isInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Initialize Fuzz Target
          </Button>

          <Button onClick={handleRun} disabled={isRunning || isInitializing} variant="secondary" className="gap-1.5">
            <Play className="h-4 w-4" />
            Run Fuzzing
          </Button>

          <Button onClick={stopRun} disabled={!isRunning} variant="outline" className="gap-1.5">
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded border border-border bg-background/50 px-2 py-1.5">
            <span className="text-muted-foreground">Iterations</span>
            <div className="font-mono text-foreground">{iterationCount.toLocaleString()}</div>
          </div>
          <div className="rounded border border-border bg-background/50 px-2 py-1.5">
            <span className="text-muted-foreground">Crashes</span>
            <div className="font-mono text-foreground">{crashes.length}</div>
          </div>
        </div>

        {banner ? (
          <div
            className={`rounded-md border px-2.5 py-2 text-[11px] ${
              banner.kind === "error"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-100"
                : banner.kind === "success"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100"
                  : "border-border bg-muted/40 text-muted-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {banner.kind === "error" ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
            {banner.text}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-sidebar-border">
          <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Live Fuzz Output
          </div>
          <ScrollArea className="h-full px-3 pb-3" aria-live="polite">
            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {logs.length === 0 ? (
                <p>No run output yet.</p>
              ) : (
                logs.map((line, index) => (
                  <p key={`${line}-${index}`} className="whitespace-pre-wrap break-all">
                    {line}
                  </p>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="min-h-0">
          <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Crash Findings
          </div>
          <ScrollArea className="h-full px-3 pb-3">
            <div className="space-y-2 text-[11px]">
              {crashes.length === 0 ? (
                <p className="text-muted-foreground">No crashes captured.</p>
              ) : (
                crashes.map((crash) => (
                  <button
                    key={crash.id}
                    type="button"
                    className="w-full rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-left hover:border-rose-400/60"
                    onClick={() => openCrash(crash)}
                    disabled={!crash.location}
                  >
                    <p className="font-mono text-rose-100">{crash.line}</p>
                    <p className="mt-1 text-[10px] text-rose-200/80">
                      {crash.location
                        ? `${crash.location.fileId}:${crash.location.line}:${crash.location.column}`
                        : "No source mapping available"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

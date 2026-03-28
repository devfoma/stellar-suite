"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type * as MonacoTypes from "monaco-editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ConflictBlock {
  id: string;
  startLine: number;   // line of <<<<<<<
  midLine: number;     // line of =======
  endLine: number;     // line of >>>>>>>
  currentLines: string[];
  incomingLines: string[];
  resolved: boolean;
  choice: "current" | "incoming" | null;
}

export interface ConflictFile {
  path: string;
  content: string;
  conflicts: ConflictBlock[];
}

// ---------------------------------------------------------------------------
// Conflict marker parser
// ---------------------------------------------------------------------------
const CONFLICT_START = /^<{7}(.*)$/;
const CONFLICT_MID   = /^={7}$/;
const CONFLICT_END   = /^>{7}(.*)$/;

export function parseConflicts(content: string): ConflictBlock[] {
  const lines = content.split("\n");
  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (CONFLICT_START.test(lines[i])) {
      const startLine = i + 1; // 1-based
      const currentLines: string[] = [];
      i++;

      while (i < lines.length && !CONFLICT_MID.test(lines[i])) {
        currentLines.push(lines[i]);
        i++;
      }

      const midLine = i + 1;
      const incomingLines: string[] = [];
      i++;

      while (i < lines.length && !CONFLICT_END.test(lines[i])) {
        incomingLines.push(lines[i]);
        i++;
      }

      const endLine = i + 1;

      blocks.push({
        id: `conflict-${startLine}`,
        startLine,
        midLine,
        endLine,
        currentLines,
        incomingLines,
        resolved: false,
        choice: null,
      });
    }
    i++;
  }

  return blocks;
}

export function applyResolutions(
  content: string,
  blocks: ConflictBlock[]
): string {
  const lines = content.split("\n");
  const resolved = [...lines];
  // Process in reverse so line indices stay valid
  const sorted = [...blocks].sort((a, b) => b.startLine - a.startLine);

  for (const block of sorted) {
    if (!block.choice) continue;
    const kept =
      block.choice === "current" ? block.currentLines : block.incomingLines;
    const start = block.startLine - 1; // 0-based
    const end = block.endLine;         // exclusive (endLine is 1-based)
    resolved.splice(start, end - start, ...kept);
  }

  return resolved.join("\n");
}

// ---------------------------------------------------------------------------
// Mock files — replace with real VCS layer
// ---------------------------------------------------------------------------
const MOCK_FILES: ConflictFile[] = [
  {
    path: "src/lib/wallet.ts",
    content: [
      'import { StellarSdk } from "@stellar/sdk";',
      "",
      "<<<<<<< HEAD",
      "export const NETWORK = 'mainnet';",
      "=======",
      "export const NETWORK = 'testnet';",
      ">>>>>>> feature/testnet-switch",
      "",
      "export function connect() {",
      "<<<<<<< HEAD",
      "  return StellarSdk.Network.useMainNet();",
      "=======",
      "  return StellarSdk.Network.useTestNet();",
      ">>>>>>> feature/testnet-switch",
      "}",
    ].join("\n"),
    conflicts: [],
  },
  {
    path: "src/components/TipButton.tsx",
    content: [
      "<<<<<<< HEAD",
      'const label = "Send Tip";',
      "=======",
      'const label = "Tip Creator";',
      ">>>>>>> feature/rebrand",
    ].join("\n"),
    conflicts: [],
  },
];

MOCK_FILES.forEach((f) => {
  f.conflicts = parseConflicts(f.content);
});

// ---------------------------------------------------------------------------
// ConflictResolver
// ---------------------------------------------------------------------------
interface Props {
  files?: ConflictFile[];
  onMergeComplete?: (results: { path: string; content: string }[]) => void;
}

const ConflictResolver: React.FC<Props> = ({
  files: filesProp,
  onMergeComplete,
}) => {
  const [files, setFiles] = useState<ConflictFile[]>(
    () =>
      (filesProp ?? MOCK_FILES).map((f) => ({
        ...f,
        conflicts: parseConflicts(f.content),
      }))
  );
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [activeConflictIdx, setActiveConflictIdx] = useState(0);
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoTypes | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decorationsRef = useRef<string[]>([]);

  const activeFile = files[activeFileIdx];
  const allResolved =
    activeFile?.conflicts.every((c) => c.resolved) ?? false;
  const totalUnresolved = activeFile?.conflicts.filter((c) => !c.resolved).length ?? 0;

  // ── Load Monaco lazily ──
  useEffect(() => {
    let destroyed = false;
    import("monaco-editor").then((monaco) => {
      if (destroyed || !containerRef.current) return;
      monacoRef.current = monaco;

      const editor = monaco.editor.create(containerRef.current, {
        value: activeFile?.content ?? "",
        language: "typescript",
        theme: "vs-dark",
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        readOnly: true,
        automaticLayout: true,
      });

      editorRef.current = editor;
      applyDecorations(editor, monaco, activeFile?.conflicts ?? []);
    });

    return () => {
      destroyed = true;
      editorRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update editor when file changes ──
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFile) return;

    editor.setValue(activeFile.content);
    applyDecorations(editor, monaco, activeFile.conflicts);

    // Scroll to first unresolved conflict
    const first = activeFile.conflicts.find((c) => !c.resolved);
    if (first) {
      editor.revealLineInCenter(first.startLine);
    }
  }, [activeFileIdx, activeFile]);

  // ── Re-decorate when conflicts change ──
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !activeFile) return;
    applyDecorations(editor, monaco, activeFile.conflicts);
  }, [activeFile?.conflicts]);

  // ── Decoration helper ──
  function applyDecorations(
    editor: MonacoTypes.editor.IStandaloneCodeEditor,
    monaco: typeof MonacoTypes,
    conflicts: ConflictBlock[]
  ) {
    const newDecorations: MonacoTypes.editor.IModelDeltaDecoration[] = [];

    for (const c of conflicts) {
      // Current block (HEAD) — amber tint
      newDecorations.push({
        range: new monaco.Range(c.startLine, 1, c.midLine - 1, 1),
        options: {
          isWholeLine: true,
          className: c.resolved && c.choice === "current"
            ? "conflict-accepted"
            : c.resolved
            ? "conflict-rejected"
            : "conflict-current",
          overviewRuler: {
            color: c.resolved ? "#22c55e" : "#f59e0b",
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      });

      // Incoming block — blue tint
      newDecorations.push({
        range: new monaco.Range(c.midLine + 1, 1, c.endLine, 1),
        options: {
          isWholeLine: true,
          className: c.resolved && c.choice === "incoming"
            ? "conflict-accepted"
            : c.resolved
            ? "conflict-rejected"
            : "conflict-incoming",
          overviewRuler: {
            color: c.resolved ? "#22c55e" : "#3b82f6",
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      });
    }

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }

  // ── Accept handler ──
  const accept = useCallback(
    (fileIdx: number, conflictId: string, choice: "current" | "incoming") => {
      setFiles((prev) => {
        const next = prev.map((f, fi) => {
          if (fi !== fileIdx) return f;
          const conflicts = f.conflicts.map((c) =>
            c.id === conflictId ? { ...c, resolved: true, choice } : c
          );
          return { ...f, conflicts };
        });
        return next;
      });
    },
    []
  );

  // ── Finalize merge ──
  const finalize = useCallback(() => {
    const results = files.map((f) => ({
      path: f.path,
      content: applyResolutions(f.content, f.conflicts),
    }));
    onMergeComplete?.(results);
    alert("Merge finalized! Check console for resolved content.");
    console.log("Merge results:", results);
  }, [files, onMergeComplete]);

  // ── Scroll editor to conflict ──
  const scrollTo = (line: number) => {
    editorRef.current?.revealLineInCenter(line);
  };

  return (
    <div className="flex h-screen flex-col bg-[#0d0d0f] font-mono text-sm text-gray-200">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#111114] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
            ⚡ Conflict Resolver
          </span>
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
            {files.reduce((s, f) => s + f.conflicts.filter((c) => !c.resolved).length, 0)} unresolved
          </span>
        </div>
        <button
          disabled={!allResolved}
          onClick={finalize}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-emerald-500"
        >
          ✓ Finalize Merge
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── File sidebar ── */}
        <aside className="flex w-52 shrink-0 flex-col border-r border-white/10 bg-[#111114]">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500">
            Conflicted Files
          </p>
          {files.map((f, fi) => {
            const unresolvedCount = f.conflicts.filter((c) => !c.resolved).length;
            const done = unresolvedCount === 0;
            return (
              <button
                key={f.path}
                onClick={() => { setActiveFileIdx(fi); setActiveConflictIdx(0); }}
                className={`flex items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-white/5 ${fi === activeFileIdx ? "bg-white/5 text-white" : "text-gray-400"}`}
              >
                <span className={done ? "text-emerald-400" : "text-amber-400"}>
                  {done ? "✓" : "!"}
                </span>
                <span className="truncate">{f.path.split("/").pop()}</span>
                {!done && (
                  <span className="ml-auto rounded bg-amber-500/20 px-1 text-[10px] text-amber-400">
                    {unresolvedCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* ── Main area ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Conflict nav strip */}
          <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#0d0d0f] px-3 py-1.5">
            {activeFile?.conflicts.map((c, ci) => (
              <button
                key={c.id}
                onClick={() => { setActiveConflictIdx(ci); scrollTo(c.startLine); }}
                className={`shrink-0 rounded px-2.5 py-1 text-[11px] transition ${
                  ci === activeConflictIdx
                    ? "bg-amber-500/20 text-amber-300"
                    : c.resolved
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {c.resolved ? "✓" : `#${ci + 1}`}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-gray-500">
              {totalUnresolved} left
            </span>
          </div>

          {/* Editor + conflict panel row */}
          <div className="flex flex-1 overflow-hidden">
            {/* Monaco editor */}
            <div ref={containerRef} className="flex-1 overflow-hidden" />

            {/* Conflict resolution panel */}
            <aside className="flex w-72 shrink-0 flex-col border-l border-white/10 bg-[#111114] overflow-y-auto">
              {activeFile?.conflicts.map((c, ci) => (
                <div
                  key={c.id}
                  className={`border-b border-white/5 px-3 py-3 ${ci === activeConflictIdx ? "bg-white/5" : ""}`}
                >
                  <p className="mb-2 text-[10px] uppercase tracking-widest text-gray-500">
                    Conflict {ci + 1}
                    {c.resolved && (
                      <span className="ml-2 text-emerald-400">✓ {c.choice}</span>
                    )}
                  </p>

                  {/* Current */}
                  <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/5 p-2">
                    <p className="mb-1 text-[10px] font-bold text-amber-400">▲ Current (HEAD)</p>
                    <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-300">
                      {c.currentLines.join("\n") || "(empty)"}
                    </pre>
                    <button
                      onClick={() => accept(activeFileIdx, c.id, "current")}
                      disabled={c.resolved}
                      className="mt-2 w-full rounded bg-amber-500/20 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/40 disabled:opacity-40"
                    >
                      Accept Current
                    </button>
                  </div>

                  {/* Incoming */}
                  <div className="rounded border border-blue-500/30 bg-blue-500/5 p-2">
                    <p className="mb-1 text-[10px] font-bold text-blue-400">▼ Incoming</p>
                    <pre className="whitespace-pre-wrap break-all text-[11px] text-gray-300">
                      {c.incomingLines.join("\n") || "(empty)"}
                    </pre>
                    <button
                      onClick={() => accept(activeFileIdx, c.id, "incoming")}
                      disabled={c.resolved}
                      className="mt-2 w-full rounded bg-blue-500/20 py-1 text-[11px] font-semibold text-blue-300 transition hover:bg-blue-500/40 disabled:opacity-40"
                    >
                      Accept Incoming
                    </button>
                  </div>
                </div>
              ))}
            </aside>
          </div>
        </div>
      </div>

      {/* Monaco decoration styles injected globally */}
      <style>{`
        .conflict-current  { background: rgba(245,158,11,0.12) !important; border-left: 3px solid #f59e0b; }
        .conflict-incoming { background: rgba(59,130,246,0.12) !important; border-left: 3px solid #3b82f6; }
        .conflict-accepted { background: rgba(34,197,94,0.10) !important; border-left: 3px solid #22c55e; }
        .conflict-rejected { opacity: 0.35; }
      `}</style>
    </div>
  );
};

export default ConflictResolver;
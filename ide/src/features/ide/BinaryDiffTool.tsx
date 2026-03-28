"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  History, 
  ArrowRight, 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  Layers, 
  Info,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Zap,
  Activity,
  Cpu,
  Binary,
  Plus,
  Trash2
} from "lucide-react";
import { useBuildHistoryStore, BuildRecord } from "@/store/useBuildHistoryStore";
import { compareWasm, DiffResult, formatHex } from "@/utils/wasmDiff";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BinaryDiffToolProps {
  onClose?: () => void;
}

export function BinaryDiffTool({ onClose }: BinaryDiffToolProps) {
  const { builds, addBuild } = useBuildHistoryStore();
  const [leftBuildId, setLeftBuildId] = useState<string>("");
  const [rightBuildId, setRightBuildId] = useState<string>("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [hexOffset, setHexOffset] = useState(0);

  // Mock data for initial presentation
  useEffect(() => {
    if (builds.length === 0) {
      // Small dummy WASM header
      const baseWasm = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // Magic & Version
        0x01, 0x04, 0x01, 0x60, 0x00, 0x00,             // Type section: 1 func type () -> ()
        0x03, 0x02, 0x01, 0x00,                         // Function section: 1 func with type 0
        0x07, 0x0a, 0x01, 0x06, 0x61, 0x70, 0x70, 0x6c, 0x79, 0x00, 0x00, // Export section: "apply"
        0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,              // Code section: 1 empty func body
      ]);

      const updatedWasm = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // Magic & Version
        0x01, 0x04, 0x01, 0x60, 0x00, 0x00,             // Type section: 1 func type () -> ()
        0x03, 0x02, 0x01, 0x00,                         // Function section: 1 func with type 0
        0x07, 0x11, 0x02, 0x06, 0x61, 0x70, 0x70, 0x6c, 0x79, 0x00, 0x00, // Export section: "apply"
        0x07, 0x69, 0x6e, 0x69, 0x74, 0x00, 0x00,        // Export section: "init"
        0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,              // Code section: 1 empty func body
      ]);

      addBuild("hello_world_v1", baseWasm);
      setTimeout(() => {
        addBuild("hello_world_v2_optimized", updatedWasm);
      }, 100);
    }
  }, [builds.length, addBuild]);

  const leftBuild = useMemo(() => builds.find(b => b.id === leftBuildId), [builds, leftBuildId]);
  const rightBuild = useMemo(() => builds.find(b => b.id === rightBuildId), [builds, rightBuildId]);

  const runDiff = async () => {
    if (!leftBuild || !rightBuild) return;
    setIsComparing(true);
    try {
      const leftWasm = Uint8Array.from(atob(leftBuild.wasmBase64), c => c.charCodeAt(0));
      const rightWasm = Uint8Array.from(atob(rightBuild.wasmBase64), c => c.charCodeAt(0));
      const res = await compareWasm(leftWasm, rightWasm);
      setDiff(res);
      toast.success("Binary comparison complete");
    } catch (err) {
      console.error(err);
      toast.error("Failed to compare binaries");
    } finally {
      setIsComparing(false);
    }
  };

  const getHexLines = () => {
    if (!leftBuild || !rightBuild) return [];
    const leftWasm = Uint8Array.from(atob(leftBuild.wasmBase64), c => c.charCodeAt(0));
    const rightWasm = Uint8Array.from(atob(rightBuild.wasmBase64), c => c.charCodeAt(0));
    const maxLen = Math.max(leftWasm.length, rightWasm.length);
    const lines: any[] = [];
    
    // Limit viewer range for performance
    const range = 512;
    const start = hexOffset;
    const end = Math.min(maxLen, start + range);

    for (let i = start; i < end; i += 16) {
      lines.push({
        offset: i,
        left: formatHex(leftWasm, i, 16),
        right: formatHex(rightWasm, i, 16),
      });
    }
    return lines;
  };

  const hexLines = useMemo(getHexLines, [leftBuild, rightBuild, hexOffset]);

  return (
    <div className="flex flex-col h-full bg-background border-l border-border animate-in slide-in-from-right-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary">
            <Binary className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Binary Diffing Tool</h2>
            <p className="text-[10px] text-muted-foreground">Compare WASM versions for optimizations or logic changes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={runDiff}
                disabled={!leftBuildId || !rightBuildId || isComparing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-[11px] font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm shadow-primary/20"
            >
                {isComparing ? <RefreshCcw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Run Diff
            </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Selection Area */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <History className="h-3 w-3" /> Baseline Version
              </label>
              <select 
                value={leftBuildId} 
                onChange={(e) => setLeftBuildId(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary shadow-sm"
              >
                <option value="">Select a build...</option>
                {builds.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({new Date(b.timestamp).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <Activity className="h-3 w-3" /> Target Version
              </label>
              <select 
                value={rightBuildId} 
                onChange={(e) => setRightBuildId(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-primary shadow-sm"
              >
                <option value="">Select a build...</option>
                {builds.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({new Date(b.timestamp).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {diff && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-card/50 border border-border/50 rounded-xl p-3 flex flex-col justify-between group hover:border-primary/30 transition-all">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Size Change</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-lg font-bold font-mono", diff.sizeDiff > 0 ? "text-red-400" : diff.sizeDiff < 0 ? "text-emerald-400" : "text-muted-foreground")}>
                      {diff.sizeDiff > 0 ? "+" : ""}{diff.sizeDiff} B
                    </span>
                    {diff.sizeDiff !== 0 && (
                        diff.sizeDiff > 0 ? <ArrowUpRight className="h-4 w-4 text-red-400" /> : <ArrowDownRight className="h-4 w-4 text-emerald-400" />
                    )}
                  </div>
                </div>
                <div className="bg-card/50 border border-border/50 rounded-xl p-3 flex flex-col justify-between group hover:border-primary/30 transition-all">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Export Delta</span>
                  <div className="flex items-center gap-1.5 text-lg font-bold font-mono">
                    <span className="text-emerald-400">+{diff.newExports.length}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-400">-{diff.removedExports.length}</span>
                  </div>
                </div>
                <div className="bg-card/50 border border-border/50 rounded-xl p-3 flex flex-col justify-between group hover:border-primary/30 transition-all">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Import Delta</span>
                  <div className="flex items-center gap-1.5 text-lg font-bold font-mono">
                    <span className="text-emerald-400">+{diff.newImports.length}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-400">-{diff.removedImports.length}</span>
                  </div>
                </div>
                <div className="bg-card/50 border border-border/50 rounded-xl p-3 flex flex-col justify-between group hover:border-primary/30 transition-all">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Byte Variance</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-bold font-mono text-amber-400">
                      {Math.round((diff.modifiedBytes / diff.totalBytes) * 100)}%
                    </span>
                    <Cpu className="h-4 w-4 text-amber-400/50" />
                  </div>
                </div>
              </div>

              {/* Logical Changes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">Logical Changes</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2">
                       <div className="p-1 rounded bg-blue-500/10 text-blue-500">
                         <FileCode className="h-3.5 w-3.5" />
                       </div>
                       <h3 className="text-[11px] font-bold">Public Exports</h3>
                    </div>
                    <div className="space-y-1.5">
                      {diff.newExports.map(ex => (
                        <div key={ex} className="flex items-center gap-2 text-[10px] p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400">
                          <Plus className="h-3 w-3" /> {ex} (Added)
                        </div>
                      ))}
                      {diff.removedExports.map(ex => (
                        <div key={ex} className="flex items-center gap-2 text-[10px] p-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-600 dark:text-red-400">
                           <Trash2 className="h-3 w-3" /> {ex} (Removed)
                        </div>
                      ))}
                      {diff.newExports.length === 0 && diff.removedExports.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic text-center py-2">No changes in exports</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2">
                       <div className="p-1 rounded bg-purple-500/10 text-purple-500">
                         <Layers className="h-3.5 w-3.5" />
                       </div>
                       <h3 className="text-[11px] font-bold">Contract Imports</h3>
                    </div>
                    <div className="space-y-1.5">
                      {diff.newImports.map(im => (
                        <div key={im.name} className="flex flex-col gap-0.5 p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 dark:text-emerald-400">
                            <div className="flex items-center gap-2 text-[10px]">
                                <Plus className="h-3 w-3" /> {im.name}
                            </div>
                            <span className="text-[8px] opacity-70 ml-5">{im.module} :: {im.kind}</span>
                        </div>
                      ))}
                      {diff.removedImports.map(im => (
                        <div key={im.name} className="flex flex-col gap-0.5 p-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-600 dark:text-red-400">
                            <div className="flex items-center gap-2 text-[10px]">
                                <Trash2 className="h-3 w-3" /> {im.name}
                            </div>
                            <span className="text-[8px] opacity-70 ml-5">{im.module} :: {im.kind}</span>
                        </div>
                      ))}
                      {diff.newImports.length === 0 && diff.removedImports.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic text-center py-2">No changes in imports</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hex Diff Viewer */}
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded bg-amber-500/10 text-amber-500">
                            <Binary className="h-3.5 w-3.5" />
                        </div>
                        <h3 className="text-[11px] font-bold">Hex Comparison View</h3>
                    </div>
                    <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md border border-border shadow-inner">
                        <button 
                            disabled={hexOffset <= 0}
                            onClick={() => setHexOffset(Math.max(0, hexOffset - 512))}
                            className="p-1 hover:bg-background rounded disabled:opacity-30 transition-colors"
                        >
                            <ChevronDown className="h-3 w-3 rotate-180" />
                        </button>
                        <span className="text-[9px] px-1 font-mono text-muted-foreground">{hexOffset.toString(16).padStart(4, '0')} - {(hexOffset + 512).toString(16).padStart(4, '0')}</span>
                        <button 
                            onClick={() => setHexOffset(hexOffset + 512)}
                            className="p-1 hover:bg-background rounded transition-colors"
                        >
                            <ChevronDown className="h-3 w-3" />
                        </button>
                    </div>
                 </div>

                 <div className="bg-slate-950 rounded-xl border border-slate-800 font-mono text-[10px] overflow-hidden shadow-2xl">
                    <div className="grid grid-cols-[80px_1fr_1fr] border-b border-slate-800 bg-slate-900/50">
                        <div className="p-2 text-slate-500 border-r border-slate-800 uppercase font-black tracking-tighter text-[8px]">Offset</div>
                        <div className="p-2 text-slate-400 border-r border-slate-800 flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-blue-500/50" />
                             {leftBuild?.name.substring(0, 20)}...
                        </div>
                        <div className="p-2 text-slate-400 flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-emerald-500/50" />
                             {rightBuild?.name.substring(0, 20)}...
                             <Badge variant="outline" className="ml-auto text-[8px] h-3 px-1 border-slate-700 bg-emerald-500/10 text-emerald-400">Target</Badge>
                        </div>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                        {hexLines.map((line, idx) => (
                            <div key={idx} className="grid grid-cols-[80px_1fr_1fr] border-b border-slate-900/50 group hover:bg-slate-900/40 transition-colors">
                                <div className="p-2 border-r border-slate-800 text-slate-600 font-bold bg-slate-900/20">{line.offset.toString(16).padStart(8, '0')}</div>
                                <div className="p-2 border-r border-slate-800 flex gap-2">
                                     <span className="text-slate-500">{line.left.hex}</span>
                                     <span className="text-slate-600 hidden group-hover:block transition-all">| {line.left.ascii}</span>
                                </div>
                                <div className="p-2 flex gap-2">
                                     <span className={cn(line.right.hex !== line.left.hex ? "text-emerald-400 font-bold bg-emerald-500/10 rounded px-1 -mx-1" : "text-slate-500")}>
                                        {line.right.hex}
                                     </span>
                                     <span className="text-slate-600 hidden group-hover:block transition-all">| {line.right.ascii}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>
              </div>
            </div>
          )}

          {!diff && !isComparing && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
               <div className="p-6 rounded-full bg-primary/5 border border-primary/10 relative">
                  <Binary className="h-12 w-12 text-primary/40" />
                  <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-20" />
               </div>
               <div className="max-w-[280px]">
                  <h3 className="text-sm font-bold text-foreground">Select Binaries to Compare</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">Choose two different builds from your history to see how the WASM bytecode and exports have changed.</p>
               </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      <div className="p-4 border-t border-border bg-card/10">
        <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <p className="text-[9px] text-amber-600/80 leading-snug">
            <strong>Byte-level diffing</strong> highlights exact bytecode changes. For large changes, address shifts might cause widespread differences even if the code logic is largely similar.
          </p>
        </div>
      </div>
    </div>
  );
}

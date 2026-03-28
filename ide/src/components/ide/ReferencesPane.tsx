import { useEffect, useState } from "react";
import { 
  Search, 
  FileCode, 
  ChevronRight, 
  ChevronDown, 
  Code,
  ArrowRight,
  ListTree,
  Library,
} from "lucide-react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Reference {
  filePath: string[];
  line: number;
  column: number;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  lineContent: string;
  isDeclaration: boolean;
}

interface GroupedReferences {
  [filePath: string]: Reference[];
}

export function ReferencesPane() {
  const [symbolName, setSymbolName] = useState<string>("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const { addTab, setActiveTabPath } = useWorkspaceStore();

  useEffect(() => {
    const handleReferences = (e: any) => {
      const { symbolName, references } = e.detail;
      setSymbolName(symbolName);
      setReferences(references);
      
      // Expand all files by default
      const files = new Set(references.map((r: Reference) => r.filePath.join('/')));
      setExpandedFiles(files);
    };

    window.addEventListener("referencesFound", handleReferences);
    return () => window.removeEventListener("referencesFound", handleReferences);
  }, []);

  const grouped = references.reduce((acc: GroupedReferences, ref) => {
    const key = ref.filePath.join('/');
    if (!acc[key]) acc[key] = [];
    acc[key].push(ref);
    return acc;
  }, {});

  const toggleFile = (path: string) => {
    const next = new Set(expandedFiles);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFiles(next);
  };

  const handleSelect = (ref: Reference) => {
    addTab(ref.filePath, ref.filePath[ref.filePath.length - 1]);
    setActiveTabPath(ref.filePath);
    
    // Jump to the specific position in the editor
    setTimeout(() => {
      const event = new CustomEvent("jumpToPosition", {
        detail: { 
          line: ref.line, 
          column: ref.column 
        }
      });
      window.dispatchEvent(event);
    }, 100);
  };

  if (!symbolName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center space-y-4">
        <div className="p-4 rounded-full bg-muted/50">
          <Search className="h-8 w-8 opacity-20" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground mb-1">No symbol selected</h3>
          <p className="text-xs leading-relaxed">
            Right-click on a symbol in the editor and select <span className="text-primary font-mono italic">"Find All References"</span> to see usage locations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sidebar animate-in fade-in slide-in-from-left-2 duration-300 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-sidebar-border bg-sidebar-accent/30">
        <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-primary/10 text-primary">
                    <Library className="h-3.5 w-3.5" />
                </div>
                <h2 className="text-[11px] font-bold uppercase tracking-wider">References</h2>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {references.length} matches
            </span>
        </div>
        <p className="text-[10px] text-muted-foreground">Showing usages for <span className="font-mono text-primary font-bold">{symbolName}</span></p>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
              {Object.entries(grouped).map(([path, refs]) => (
                <div key={path} className="mb-0.5">
                  <button
                    onClick={() => toggleFile(path)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-sidebar-accent/50 transition-colors group text-left"
                  >
                    {expandedFiles.has(path) ? <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />}
                    <FileCode className="h-3.5 w-3.5 text-blue-500/70" />
                    <span className="text-[11px] font-medium text-sidebar-foreground truncate">{path}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">{(refs as Reference[]).length}</span>
                  </button>
                  
                  {expandedFiles.has(path) && (
                    <div className="ml-5 border-l border-sidebar-border mt-0.5 mb-1">
                      {(refs as Reference[]).map((ref, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelect(ref)}
                          className={cn(
                            "w-full flex flex-col gap-1 px-3 py-2 text-left hover:bg-sidebar-accent/30 transition-all border-b border-sidebar-border/30 last:border-0",
                            ref.isDeclaration && "bg-emerald-500/5"
                          )}
                        >
                      <div className="flex items-center justify-between">
                         <span className="text-[9px] font-mono text-muted-foreground/60 leading-none">Line {ref.line}</span>
                         {ref.isDeclaration && (
                           <span className="text-[8px] font-black uppercase text-emerald-500/70 tracking-tighter">Declaration</span>
                         )}
                      </div>
                      <div className="flex gap-2 items-start group">
                         <div className="mt-1 h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="h-2 w-2 text-primary" />
                         </div>
                         <code className="text-[10px] font-mono text-foreground break-all leading-tight">
                            {ref.lineContent}
                         </code>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

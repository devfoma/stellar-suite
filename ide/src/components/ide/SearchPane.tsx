import { useMemo, useState } from "react";
import { AlertTriangle, CaseSensitive, Regex, Search as SearchIcon, Type } from "lucide-react";

import { useFileStore } from "@/store/useFileStore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { searchWorkspace, type SearchMatch, type SearchMode } from "@/utils/searchWorkspace";

interface SearchPaneProps {
  inputRef?: React.RefObject<HTMLInputElement>;
  onResultSelect: (
    pathParts: string[],
    range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
  ) => void;
}

export function SearchPane({ inputRef, onResultSelect }: SearchPaneProps) {
  const { files } = useFileStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 200);

  const { results, regexError } = useMemo(() => {
    if (!debouncedQuery.trim()) return { results: [] as SearchMatch[], regexError: undefined as string | undefined };
    const { matches, regexError: err } = searchWorkspace(files, debouncedQuery, {
      mode,
      matchCase,
      wholeWord,
    });
    return { results: matches, regexError: err };
  }, [debouncedQuery, files, matchCase, mode, wholeWord]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const match of results) {
      const list = map.get(match.fileId) ?? [];
      list.push(match);
      map.set(match.fileId, list);
    }
    return Array.from(map.entries());
  }, [results]);

  const renderSnippet = (match: SearchMatch) => {
    const { lineText, startColumn, endColumn } = match;
    const start = startColumn - 1;
    const end = endColumn - 1;
    return (
      <div className="text-xs text-muted-foreground">
        <span>{lineText.slice(0, start)}</span>
        <span className="bg-primary/30 text-primary-foreground px-0.5 rounded-sm">
          {lineText.slice(start, end)}
        </span>
        <span>{lineText.slice(end)}</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2">
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspace (Text or /regex/)"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="flex items-center gap-1 border-b border-sidebar-border px-3 py-2 text-[11px] text-muted-foreground">
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            mode === "text" ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
          }`}
          onClick={() => setMode("text")}
        >
          Text
        </button>
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            mode === "regex" ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
          }`}
          onClick={() => setMode("regex")}
        >
          <Regex className="h-3.5 w-3.5" /> Regex
        </button>
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            matchCase ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
          }`}
          onClick={() => setMatchCase((prev) => !prev)}
        >
          <CaseSensitive className="h-3.5 w-3.5" /> Match case
        </button>
        <button
          className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
            wholeWord ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
          }`}
          onClick={() => setWholeWord((prev) => !prev)}
        >
          <Type className="h-3.5 w-3.5" /> Whole word
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {regexError && (
          <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Invalid regex: {regexError}</span>
          </div>
        )}

        {!regexError && grouped.length === 0 && debouncedQuery.trim().length > 0 && (
          <p className="text-xs text-muted-foreground">No results found.</p>
        )}

        {grouped.map(([fileId, items]) => (
          <div key={fileId} className="rounded border border-border bg-card/40">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
              <span className="truncate" title={fileId}>{fileId}</span>
              <span className="text-muted-foreground">{items.length}</span>
            </div>
            <div className="divide-y divide-border">
              {items.map((match) => (
                <button
                  key={`${match.fileId}-${match.lineNumber}-${match.startColumn}-${match.endColumn}`}
                  className="w-full px-3 py-2 text-left hover:bg-muted/40"
                  onClick={() =>
                    setTimeout(
                      () =>
                        onResultSelect(match.pathParts, {
                          startLineNumber: match.lineNumber,
                          endLineNumber: match.lineNumber,
                          startColumn: match.startColumn,
                          endColumn: match.endColumn,
                        }),
                      0
                    )
                  }
                >
                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                    <span className="text-primary">{match.lineNumber}</span>
                    <span>:{match.startColumn}</span>
                  </div>
                  {renderSnippet(match)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

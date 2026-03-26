import { FileNode } from "@/lib/sample-contracts";

export type SearchMode = "text" | "regex";

export interface SearchOptions {
  mode: SearchMode;
  matchCase?: boolean;
  wholeWord?: boolean;
  limit?: number;
}

export interface SearchMatch {
  fileId: string;
  pathParts: string[];
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  lineText: string;
  matchText: string;
}

const DEFAULT_LIMIT = 2000;

interface FlattenedFile {
  fileId: string;
  pathParts: string[];
  content: string;
}

const flattenFiles = (
  nodes: FileNode[],
  parent: string[] = [],
): FlattenedFile[] =>
  nodes.flatMap((node) => {
    const nextPath = [...parent, node.name];
    if (node.type === "folder") {
      return flattenFiles(node.children ?? [], nextPath);
    }

    return [
      {
        fileId: nextPath.join("/"),
        pathParts: nextPath,
        content: node.content ?? "",
      },
    ];
  });

const isWordBoundary = (text: string, start: number, matchLength: number) => {
  const isBoundaryStart = start === 0 || /[^A-Za-z0-9_]/.test(text[start - 1]);
  const endIndex = start + matchLength;
  const isBoundaryEnd =
    endIndex >= text.length || /[^A-Za-z0-9_]/.test(text[endIndex]);
  return isBoundaryStart && isBoundaryEnd;
};

export function searchWorkspace(
  files: FileNode[],
  query: string,
  options: SearchOptions,
): { matches: SearchMatch[]; regexError?: string } {
  const trimmed = query;
  if (!trimmed) return { matches: [] };

  const {
    mode,
    matchCase = false,
    wholeWord = false,
    limit = DEFAULT_LIMIT,
  } = options;
  const matches: SearchMatch[] = [];
  let regexError: string | undefined;

  const haystack = flattenFiles(files);

  for (const file of haystack) {
    const lines = file.content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const lineNumber = i + 1;
      const rawLine = lines[i];

      if (mode === "text") {
        const line = matchCase ? rawLine : rawLine.toLowerCase();
        const needle = matchCase ? trimmed : trimmed.toLowerCase();
        if (!needle) continue;

        let index = line.indexOf(needle);
        while (index !== -1) {
          const startColumn = index + 1;
          const endColumn = startColumn + needle.length;

          if (!wholeWord || isWordBoundary(rawLine, index, needle.length)) {
            matches.push({
              fileId: file.fileId,
              pathParts: file.pathParts,
              lineNumber,
              startColumn,
              endColumn,
              lineText: rawLine,
              matchText: rawLine.slice(index, index + needle.length),
            });
          }

          if (matches.length >= limit) {
            return { matches, regexError };
          }

          index = line.indexOf(needle, index + needle.length || 1);
        }
      } else {
        let regex: RegExp;
        try {
          regex = new RegExp(trimmed, `g${matchCase ? "" : "i"}`);
        } catch (error) {
          regexError =
            error instanceof Error
              ? error.message
              : "Invalid regular expression";
          return { matches: [], regexError };
        }

        let execMatch: RegExpExecArray | null;
        while ((execMatch = regex.exec(rawLine)) !== null) {
          const start = execMatch.index;
          const matchText = execMatch[0];
          const startColumn = start + 1;
          const endColumn = startColumn + matchText.length;

          matches.push({
            fileId: file.fileId,
            pathParts: file.pathParts,
            lineNumber,
            startColumn,
            endColumn,
            lineText: rawLine,
            matchText,
          });

          if (matches.length >= limit) {
            return { matches, regexError };
          }

          if (matchText.length === 0) {
            regex.lastIndex += 1; // avoid infinite loop on zero-length matches
          }
        }
      }
    }
  }

  return { matches, regexError };
}

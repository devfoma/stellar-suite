import { FileNode } from "@/lib/sample-contracts";

export interface SearchOptions {
  query: string;
  isRegex: boolean;
  matchCase: boolean;
  includeFiles?: string; // Glob-like pattern or comma-separated list
  excludeFiles?: string; // Glob-like pattern or comma-separated list
}

export interface SearchMatch {
  fileId: string;
  pathParts: string[];
  lineNumber: number;
  lineText: string;
  matchText: string;
  startColumn: number;
  endColumn: number;
}

export interface SearchResult {
  matches: SearchMatch[];
  error?: string;
}

/**
 * A parallelized file walker that searches for a query string across the workspace.
 * It reads from the virtual storage (provided as an array of FileNode).
 */
export async function searchWalker(
  files: FileNode[],
  options: SearchOptions
): Promise<SearchResult> {
  const { query, isRegex, matchCase, includeFiles, excludeFiles } = options;

  if (!query) {
    return { matches: [] };
  }

  try {
    const flattenedFiles = flattenFiles(files);
    
    // Apply filters
    const filteredFiles = flattenedFiles.filter((file) => {
      const path = file.pathParts.join("/");
      
      // Basic glob-like filtering
      if (includeFiles && !isMatch(path, includeFiles)) {
        return false;
      }
      
      if (excludeFiles && isMatch(path, excludeFiles)) {
        return false;
      }
      
      return true;
    });

    // Parallelize the search using chunks to avoid blocking the main thread
    const chunkSize = 10;
    const results: SearchMatch[] = [];
    
    for (let i = 0; i < filteredFiles.length; i += chunkSize) {
      const chunk = filteredFiles.slice(i, i + chunkSize);
      
      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map((file) => searchInFile(file, query, isRegex, matchCase))
      );
      
      results.push(...chunkResults.flat());
      
      // Allow UI to breathe
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return { matches: results };
  } catch (error) {
    return { 
      matches: [], 
      error: error instanceof Error ? error.message : "An unknown error occurred during search" 
    };
  }
}

interface FlattenedFile {
  fileId: string;
  pathParts: string[];
  content: string;
}

function flattenFiles(
  nodes: FileNode[],
  parent: string[] = []
): FlattenedFile[] {
  return nodes.flatMap((node) => {
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
}

async function searchInFile(
  file: FlattenedFile,
  query: string,
  isRegex: boolean,
  matchCase: boolean
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = [];
  const lines = file.content.split(/\r?\n/);
  
  let regex: RegExp;
  if (isRegex) {
    try {
      regex = new RegExp(query, `g${matchCase ? "" : "i"}`);
    } catch (e) {
      throw new Error(`Invalid regex: ${query}`);
    }
  } else {
    // Escape special characters for literal search if needed, or just use indexOf
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escapedQuery, `g${matchCase ? "" : "i"}`);
  }

  lines.forEach((line, index) => {
    let match;
    // Reset regex index for each line if using global flag
    regex.lastIndex = 0;
    
    while ((match = regex.exec(line)) !== null) {
      matches.push({
        fileId: file.fileId,
        pathParts: file.pathParts,
        lineNumber: index + 1,
        lineText: line,
        matchText: match[0],
        startColumn: match.index + 1,
        endColumn: match.index + match[0].length + 1,
      });
      
      if (match[0].length === 0) {
        regex.lastIndex++; // Avoid infinite loop for zero-width matches
      }
    }
  });

  return matches;
}

/**
 * Simple glob-like matching.
 * Supports '*' for any characters within a path segment.
 */
function isMatch(path: string, pattern: string): boolean {
  if (!pattern) return true;
  
  const patterns = pattern.split(",").map((p) => p.trim()).filter(Boolean);
  if (patterns.length === 0) return true;

  return patterns.some((p) => {
    // Convert glob-like pattern to regex
    // Escape special chars except *
    const regexPattern = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(path) || path.includes(p); // Fallback to includes for simpler usage
  });
}

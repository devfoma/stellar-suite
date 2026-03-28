import type * as Monaco from "monaco-editor";

export interface RustFoldingRange {
  start: number;
  end: number;
  kind?: "comment" | "region";
}

export const RUST_FOLD_REGION_START = /^\s*\/\/\s*#?region\b/i;
export const RUST_FOLD_REGION_END = /^\s*\/\/\s*#?endregion\b/i;

const isEscaped = (source: string, index: number): boolean => {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
};

const getLineNumber = (lineStarts: number[], index: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return high + 1;
};

export function computeRustFoldingRanges(source: string): RustFoldingRange[] {
  const lines = source.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const ranges: RustFoldingRange[] = [];
  const braceStack: number[] = [];
  const blockCommentStack: number[] = [];
  const regionStack: number[] = [];

  let inString = false;
  let inRawString = false;
  let rawStringHashes = 0;
  let inLineComment = false;
  let lineCommentStart = -1;
  let lineCommentIsRegion = false;
  let pendingLineCommentStart: number | null = null;
  let pendingLineCommentEnd: number | null = null;

  const flushLineCommentGroup = () => {
    if (
      pendingLineCommentStart !== null &&
      pendingLineCommentEnd !== null &&
      pendingLineCommentEnd > pendingLineCommentStart
    ) {
      ranges.push({
        start: pendingLineCommentStart,
        end: pendingLineCommentEnd,
        kind: "comment",
      });
    }
    pendingLineCommentStart = null;
    pendingLineCommentEnd = null;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const lineNumber = getLineNumber(lineStarts, index);

    if (inLineComment) {
      if (char === "\n") {
        if (!lineCommentIsRegion) {
          if (pendingLineCommentStart === null) {
            pendingLineCommentStart = lineCommentStart;
            pendingLineCommentEnd = lineCommentStart;
          }

          if (
            pendingLineCommentEnd !== null &&
            lineCommentStart === pendingLineCommentEnd + 1
          ) {
            pendingLineCommentEnd = lineCommentStart;
          } else {
            flushLineCommentGroup();
            pendingLineCommentStart = lineCommentStart;
            pendingLineCommentEnd = lineCommentStart;
          }
        }

        inLineComment = false;
        lineCommentStart = -1;
        lineCommentIsRegion = false;
      }
      continue;
    }

    if (blockCommentStack.length > 0) {
      if (char === "/" && next === "*") {
        blockCommentStack.push(lineNumber);
        index += 1;
        continue;
      }

      if (char === "*" && next === "/") {
        const startLine = blockCommentStack.pop();
        if (startLine && lineNumber > startLine) {
          ranges.push({ start: startLine, end: lineNumber, kind: "comment" });
        }
        index += 1;
      }
      continue;
    }

    if (inString) {
      if (char === "\"" && !isEscaped(source, index)) {
        inString = false;
      }
      continue;
    }

    if (inRawString) {
      if (char === "\"") {
        let hashes = 0;
        while (source[index + 1 + hashes] === "#") {
          hashes += 1;
        }
        if (hashes === rawStringHashes) {
          inRawString = false;
          rawStringHashes = 0;
          index += hashes;
        }
      }
      continue;
    }

    if (char === "\n") {
      flushLineCommentGroup();
      continue;
    }

    if (char === "/" && next === "/") {
      const lineText = lines[lineNumber - 1] ?? "";
      const isRegionStart = RUST_FOLD_REGION_START.test(lineText);
      const isRegionEnd = RUST_FOLD_REGION_END.test(lineText);

      if (isRegionStart) {
        flushLineCommentGroup();
        regionStack.push(lineNumber);
      } else if (isRegionEnd) {
        flushLineCommentGroup();
        const startLine = regionStack.pop();
        if (startLine && lineNumber > startLine) {
          ranges.push({ start: startLine, end: lineNumber, kind: "region" });
        }
      }

      inLineComment = true;
      lineCommentStart = lineNumber;
      lineCommentIsRegion = isRegionStart || isRegionEnd;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      flushLineCommentGroup();
      blockCommentStack.push(lineNumber);
      index += 1;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if ((char === "r" || char === "b") && next === "\"") {
      inString = true;
      index += 1;
      continue;
    }

    if (char === "r" || (char === "b" && next === "r")) {
      const prefixStart = char === "b" ? index + 1 : index;
      let hashCount = 0;
      let cursor = prefixStart + 1;

      while (source[cursor] === "#") {
        hashCount += 1;
        cursor += 1;
      }

      if (source[cursor] === "\"") {
        inRawString = true;
        rawStringHashes = hashCount;
        index = cursor;
        continue;
      }
    }

    if (char === "{") {
      braceStack.push(lineNumber);
      continue;
    }

    if (char === "}") {
      const startLine = braceStack.pop();
      if (startLine && lineNumber > startLine) {
        ranges.push({ start: startLine, end: lineNumber });
      }
    }
  }

  if (inLineComment && !lineCommentIsRegion) {
    if (pendingLineCommentStart === null) {
      pendingLineCommentStart = lineCommentStart;
      pendingLineCommentEnd = lineCommentStart;
    } else if (lineCommentStart === pendingLineCommentEnd! + 1) {
      pendingLineCommentEnd = lineCommentStart;
    } else {
      flushLineCommentGroup();
      pendingLineCommentStart = lineCommentStart;
      pendingLineCommentEnd = lineCommentStart;
    }
  }

  flushLineCommentGroup();

  return ranges.sort((left, right) => {
    if (left.start === right.start) {
      return left.end - right.end;
    }
    return left.start - right.start;
  });
}

export function createRustFoldingRangeProvider(): Monaco.languages.FoldingRangeProvider {
  return {
    provideFoldingRanges(model) {
      return computeRustFoldingRanges(model.getValue()).map((range) => ({
        start: range.start,
        end: range.end,
        kind: range.kind as Monaco.languages.FoldingRangeKind | undefined,
      }));
    },
  };
}

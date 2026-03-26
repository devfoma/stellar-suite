import { describe, expect, it } from "vitest";

import { searchWorkspace, type SearchMatch } from "@/utils/searchWorkspace";
import { FileNode } from "@/lib/sample-contracts";

const makeFiles = (): FileNode[] => [
  {
    name: "folder",
    type: "folder",
    children: [
      {
        name: "a.txt",
        type: "file",
        content: "Hello world\nhello again",
      },
      {
        name: "b.txt",
        type: "file",
        content: "Regex line: foo123 foo\nCase Line",
      },
    ],
  },
];

describe("searchWorkspace", () => {
  it("finds simple text across files", () => {
    const { matches } = searchWorkspace(makeFiles(), "hello", { mode: "text" });
    const fileIds = matches.map((m) => m.fileId);
    expect(fileIds).toContain("folder/a.txt");
    expect(matches.some((m) => m.lineNumber === 1)).toBe(true);
    expect(matches.some((m) => m.lineNumber === 2)).toBe(true);
  });

  it("respects case-insensitive search by default", () => {
    const { matches } = searchWorkspace(makeFiles(), "HELLO", { mode: "text" });
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("respects matchCase flag", () => {
    const { matches } = searchWorkspace(makeFiles(), "Hello", {
      mode: "text",
      matchCase: true,
    });
    expect(matches.length).toBe(1);
  });

  it("finds regex matches and multiple per line", () => {
    const { matches } = searchWorkspace(makeFiles(), "foo[0-9]*", {
      mode: "regex",
    });
    const fooMatches = matches.filter((m) => m.matchText.startsWith("foo"));
    expect(fooMatches.length).toBe(2);
    const first = fooMatches[0] as SearchMatch;
    expect(first.lineNumber).toBe(1);
    expect(first.startColumn).toBeGreaterThan(0);
  });

  it("returns regexError on invalid regex", () => {
    const { matches, regexError } = searchWorkspace(makeFiles(), "(", {
      mode: "regex",
    });
    expect(matches).toHaveLength(0);
    expect(regexError).toBeDefined();
  });

  it("calculates start and end columns correctly", () => {
    const { matches } = searchWorkspace(makeFiles(), "world", { mode: "text" });
    const world = matches.find((m) => m.matchText === "world");
    expect(world?.startColumn).toBe(7);
    expect(world?.endColumn).toBe(12);
  });
});

import { describe, expect, it } from "vitest";
import { searchWalker } from "@/utils/searchWalker";
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

describe("searchWalker", () => {
  it("finds simple text across files", async () => {
    const { matches } = await searchWalker(makeFiles(), { 
      query: "hello", 
      isRegex: false, 
      matchCase: false 
    });
    const fileIds = matches.map((m) => m.fileId);
    expect(fileIds).toContain("folder/a.txt");
    expect(matches.some((m) => m.lineNumber === 1)).toBe(true);
    expect(matches.some((m) => m.lineNumber === 2)).toBe(true);
  });

  it("respects matchCase flag", async () => {
    const { matches } = await searchWalker(makeFiles(), {
      query: "Hello",
      isRegex: false,
      matchCase: true,
    });
    expect(matches.length).toBe(1);
  });

  it("finds regex matches", async () => {
    const { matches } = await searchWalker(makeFiles(), {
      query: "foo[0-9]*",
      isRegex: true,
      matchCase: false,
    });
    expect(matches.length).toBe(2);
  });

  it("respects includeFiles filter", async () => {
    const { matches } = await searchWalker(makeFiles(), {
      query: "hello",
      isRegex: false,
      matchCase: false,
      includeFiles: "folder/a.txt"
    });
    expect(matches.length).toBe(2);
    expect(matches.every(m => m.fileId === "folder/a.txt")).toBe(true);
  });

  it("respects excludeFiles filter", async () => {
    const { matches } = await searchWalker(makeFiles(), {
      query: "hello",
      isRegex: false,
      matchCase: false,
      excludeFiles: "folder/a.txt"
    });
    expect(matches.length).toBe(0);
  });
});

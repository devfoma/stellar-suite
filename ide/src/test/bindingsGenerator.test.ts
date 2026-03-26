import { describe, expect, it } from "vitest";

import { createBindingsExportFromWorkspace } from "@/lib/bindingsGenerator";
import { sampleContracts, type FileNode } from "@/lib/sample-contracts";

describe("bindingsGenerator", () => {
  it("creates a lightweight client from Rust contract exports", () => {
    const result = createBindingsExportFromWorkspace(sampleContracts, ["hello_world", "lib.rs"]);

    expect(result.mode).toBe("rust-lite");
    expect(result.filename).toBe("hello_world.bindings.ts");
    expect(result.source).toContain('export class HelloWorldClient');
    expect(result.source).toContain('hello(args: { to: string }): Promise<string[]>;');
  });

  it("prefers ABI JSON when a contract spec file exists", () => {
    const files: FileNode[] = [
      {
        name: "counter",
        type: "folder",
        children: [
          {
            name: "contract-spec.json",
            type: "file",
            language: "json",
            content: JSON.stringify({
              functions: [
                {
                  name: "increment",
                  inputs: [{ name: "amount", type: "u32" }],
                  outputs: [{ type: "u32" }],
                },
                {
                  name: "owner",
                  inputs: [],
                  outputs: [{ type: "Address" }],
                },
              ],
            }),
          },
          {
            name: "lib.rs",
            type: "file",
            language: "rust",
            content: "pub fn fallback(env: Env) {}",
          },
        ],
      },
    ];

    const result = createBindingsExportFromWorkspace(files, ["counter", "contract-spec.json"]);

    expect(result.mode).toBe("abi");
    expect(result.source).toContain('increment(args: { amount: number }): Promise<number>;');
    expect(result.source).toContain('owner(): Promise<string>;');
  });
});

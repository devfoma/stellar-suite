import { describe, expect, it } from "vitest";

import {
  createSorobanFuzzTemplate,
  type RustWorkspaceFile,
} from "@/lib/fuzzing/templateGenerator";

const baseFiles: RustWorkspaceFile[] = [
  {
    path: "hello_world/Cargo.toml",
    content: `[package]
name = "hello-world"
version = "0.1.0"
edition = "2021"
`,
  },
  {
    path: "hello_world/lib.rs",
    content: `#![no_std]
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn ping(_env: Env) {}
}
`,
  },
];

describe("createSorobanFuzzTemplate", () => {
  it("creates fuzz scaffold files with sanitized target name", () => {
    const result = createSorobanFuzzTemplate({
      contractName: "hello_world",
      files: baseFiles,
      targetName: "hello-world target",
    });

    expect(result.targetName).toBe("hello_world_target");
    expect(result.crateName).toBe("hello_world");
    expect(result.contractStructName).toBe("HelloContract");

    const outputPaths = result.files.map((entry) => entry.path).sort();
    expect(outputPaths).toEqual([
      "fuzz/.gitignore",
      "fuzz/Cargo.toml",
      "fuzz/README.md",
      "fuzz/fuzz_targets/hello_world_target.rs",
    ]);
  });

  it("falls back to contractName when Cargo package name is missing", () => {
    const files: RustWorkspaceFile[] = [
      {
        path: "counter/Cargo.toml",
        content: "[package]\nversion = \"0.1.0\"\n",
      },
      {
        path: "counter/lib.rs",
        content: "pub struct CounterContract;",
      },
    ];

    const result = createSorobanFuzzTemplate({
      contractName: "counter",
      files,
    });

    expect(result.crateName).toBe("counter");
    expect(result.targetName).toBe("contract_fuzz");
  });

  it("injects crate package reference into fuzz Cargo.toml", () => {
    const result = createSorobanFuzzTemplate({
      contractName: "hello_world",
      files: baseFiles,
    });

    const cargoToml = result.files.find((entry) => entry.path === "fuzz/Cargo.toml");
    expect(cargoToml).toBeDefined();
    expect(cargoToml?.content).toContain("package = \"hello-world\"");
    expect(cargoToml?.content).toContain("path = \"..\"");
  });
});

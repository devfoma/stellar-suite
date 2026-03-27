import { describe, expect, it } from "vitest";
import { createGitService } from "@/lib/vcs/gitService";

const createTestService = () => {
  const seed = Math.random().toString(36).slice(2);
  return createGitService({
    fsName: `stellar-suite-git-test-${seed}`,
    metaPrefix: `stellar-suite-git-test-${seed}`,
    wipe: true,
  });
};

describe("gitService", () => {
  it("initializes a local repository in IndexedDB and snapshots HEAD", async () => {
    const service = createTestService();
    const files = [
      { path: "contracts/hello.rs", content: "fn hello() {}\n" },
      { path: "Cargo.toml", content: "[package]\nname = \"hello\"\n" },
    ];

    const statusMap = await service.initializeRepository(files);

    expect(await service.hasGitDirectory()).toBe(true);
    expect(statusMap).toEqual({});
    expect(await service.readHeadFile(["contracts", "hello.rs"])).toBe("fn hello() {}\n");
  });

  it("tracks modified, new, and deleted files after syncing the workspace", async () => {
    const service = createTestService();

    await service.initializeRepository([
      { path: "contracts/hello.rs", content: "fn hello() {}\n" },
      { path: "Cargo.toml", content: "[package]\nname = \"hello\"\n" },
    ]);

    const statusMap = await service.syncWorkspace([
      { path: "contracts/hello.rs", content: "fn hello() { println!(\"hi\"); }\n" },
      { path: "contracts/new.rs", content: "fn added() {}\n" },
    ]);

    expect(statusMap["contracts/hello.rs"]).toBe("modified");
    expect(statusMap["contracts/new.rs"]).toBe("new");
    expect(statusMap["Cargo.toml"]).toBe("deleted");
  });
});

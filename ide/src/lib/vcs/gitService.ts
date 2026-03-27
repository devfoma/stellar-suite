import LightningFS from "@isomorphic-git/lightning-fs";
import * as git from "isomorphic-git";
import { get, set } from "idb-keyval";

export type GitFileStatus = "modified" | "new" | "deleted";

export interface GitWorkspaceFile {
  path: string;
  content: string;
}

interface GitServiceOptions {
  fsName?: string;
  dir?: string;
  metaPrefix?: string;
  defaultBranch?: string;
  wipe?: boolean;
}

type GitHeadSnapshot = Record<string, string>;

type StatusMatrixRow = [string, number, number, number];

const DEFAULT_FS_NAME = "stellar-suite-ide-repo";
const DEFAULT_DIR = "/workspace";
const DEFAULT_META_PREFIX = "stellar-suite-ide-repo";
const DEFAULT_BRANCH = "main";

const browserFsRegistry = globalThis as typeof globalThis & {
  __stellarSuiteGitFsRegistry__?: Map<string, ReturnType<typeof createLightningFs>>;
};

const createLightningFs = (name: string, wipe: boolean) =>
  new LightningFS(name, { wipe });

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "");

const uniqueSorted = (values: string[]) => Array.from(new Set(values)).sort();

export function createGitService(options: GitServiceOptions = {}) {
  const fsName = options.fsName ?? DEFAULT_FS_NAME;
  const dir = options.dir ?? DEFAULT_DIR;
  const metaPrefix = options.metaPrefix ?? DEFAULT_META_PREFIX;
  const defaultBranch = options.defaultBranch ?? DEFAULT_BRANCH;
  const wipe = options.wipe ?? false;

  const mirroredPathsKey = `${metaPrefix}:mirrored-paths`;
  const headSnapshotKey = `${metaPrefix}:head-snapshot`;

  const getFs = () => {
    if (typeof window === "undefined") {
      throw new Error("Local Git is only available in the browser.");
    }

    if (!browserFsRegistry.__stellarSuiteGitFsRegistry__) {
      browserFsRegistry.__stellarSuiteGitFsRegistry__ = new Map();
    }

    const registry = browserFsRegistry.__stellarSuiteGitFsRegistry__;
    if (!registry.has(fsName)) {
      registry.set(fsName, createLightningFs(fsName, wipe));
    }

    return registry.get(fsName)!;
  };

  const getPromises = () => getFs().promises;

  const ensureDir = async (targetDir: string) => {
    const fs = getPromises();
    const parts = normalizePath(targetDir).split("/").filter(Boolean);

    let current = "";
    for (const part of parts) {
      current = `${current}/${part}`;
      try {
        await fs.mkdir(current);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("EEXIST")) {
          throw error;
        }
      }
    }
  };

  const writeWorkspaceFile = async (file: GitWorkspaceFile) => {
    const fs = getPromises();
    const normalizedPath = normalizePath(file.path);
    const pathParts = normalizedPath.split("/").filter(Boolean);
    const folderPath = `${dir}/${pathParts.slice(0, -1).join("/")}`.replace(/\/$/, "");

    if (pathParts.length > 1) {
      await ensureDir(folderPath);
    } else {
      await ensureDir(dir);
    }

    await fs.writeFile(`${dir}/${normalizedPath}`, file.content, "utf8");
  };

  const deleteWorkspaceFile = async (path: string) => {
    const fs = getPromises();
    try {
      await fs.unlink(`${dir}/${normalizePath(path)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("ENOENT")) {
        throw error;
      }
    }
  };

  const normalizeFiles = (files: GitWorkspaceFile[]) =>
    files
      .map((file) => ({
        path: normalizePath(file.path),
        content: file.content ?? "",
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

  const toHeadSnapshot = (files: GitWorkspaceFile[]): GitHeadSnapshot =>
    Object.fromEntries(normalizeFiles(files).map((file) => [file.path, file.content]));

  const deriveStatus = ([filepath, head, workdir]: StatusMatrixRow): GitFileStatus | null => {
    if (head === 0 && workdir > 0) {
      return "new";
    }

    if (head === 1 && workdir === 0) {
      return "deleted";
    }

    if (head === 1 && workdir === 2) {
      return "modified";
    }

    return null;
  };

  const collectStatusMap = async () => {
    const rows = (await git.statusMatrix({
      fs: getFs(),
      dir,
    })) as StatusMatrixRow[];

    return rows.reduce<Record<string, GitFileStatus>>((acc, row) => {
      const status = deriveStatus(row);
      if (status) {
        acc[row[0]] = status;
      }
      return acc;
    }, {});
  };

  const hasGitDirectory = async () => {
    const fs = getPromises();
    try {
      const entries = await fs.readdir(dir);
      return entries.includes(".git");
    } catch {
      return false;
    }
  };

  const isRepositoryInitialized = async () => {
    if (!(await hasGitDirectory())) {
      return false;
    }

    try {
      await git.currentBranch({
        fs: getFs(),
        dir,
        fullname: false,
      });
      return true;
    } catch {
      return false;
    }
  };

  const initializeRepository = async (files: GitWorkspaceFile[]) => {
    const normalizedFiles = normalizeFiles(files);

    if (await isRepositoryInitialized()) {
      return syncWorkspace(normalizedFiles);
    }

    await ensureDir(dir);

    for (const file of normalizedFiles) {
      await writeWorkspaceFile(file);
    }

    await git.init({
      fs: getFs(),
      dir,
      defaultBranch,
    });

    for (const file of normalizedFiles) {
      await git.add({
        fs: getFs(),
        dir,
        filepath: file.path,
      });
    }

    if (normalizedFiles.length > 0) {
      await git.commit({
        fs: getFs(),
        dir,
        message: "chore: initialize local repository",
        author: {
          name: "Stellar Suite IDE",
          email: "ide@stellar-suite.local",
        },
      });
    }

    await set(mirroredPathsKey, uniqueSorted(normalizedFiles.map((file) => file.path)));
    await set(headSnapshotKey, toHeadSnapshot(normalizedFiles));

    return collectStatusMap();
  };

  const syncWorkspace = async (files: GitWorkspaceFile[]) => {
    const normalizedFiles = normalizeFiles(files);

    if (!(await isRepositoryInitialized())) {
      return {};
    }

    const previousPaths = ((await get<string[]>(mirroredPathsKey)) ?? []).map(normalizePath);
    const nextPaths = uniqueSorted(normalizedFiles.map((file) => file.path));
    const nextPathSet = new Set(nextPaths);

    for (const deletedPath of previousPaths) {
      if (!nextPathSet.has(deletedPath)) {
        await deleteWorkspaceFile(deletedPath);
      }
    }

    for (const file of normalizedFiles) {
      await writeWorkspaceFile(file);
    }

    await set(mirroredPathsKey, nextPaths);

    return collectStatusMap();
  };

  const readHeadFile = async (path: string[]) => {
    const snapshot = (await get<GitHeadSnapshot>(headSnapshotKey)) ?? {};
    const key = normalizePath(path.join("/"));
    return snapshot[key] ?? null;
  };

  return {
    defaultBranch,
    dir,
    hasGitDirectory,
    isRepositoryInitialized,
    initializeRepository,
    syncWorkspace,
    readHeadFile,
  };
}

export const gitService = createGitService();

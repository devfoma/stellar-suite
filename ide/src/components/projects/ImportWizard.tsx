"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Github, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import type { FileNode } from "@/lib/sample-contracts";
import { useWorkspaceStore } from "@/store/workspaceStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ImportSource = "external-repository";
type RepoVisibility = "public" | "private";

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

interface ImportedFile {
  path: string;
  content: string;
}

interface DetectionResult {
  kind: "soroban" | "rust" | "generic";
  hasCargoToml: boolean;
  hasSorobanSdk: boolean;
  rustFileCount: number;
  suggestedEntryPath: string | null;
}

const TEXT_EXTENSIONS = new Set([
  "rs",
  "toml",
  "md",
  "json",
  "yaml",
  "yml",
  "txt",
  "tsx",
  "ts",
  "jsx",
  "js",
  "lock",
]);

const GITHUB_API_BASE = "https://api.github.com";

function parseGitHubRepositoryUrl(url: string): GitHubRepoRef | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "github.com") return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");

    let branch: string | undefined;
    const treeIndex = parts.findIndex((part) => part === "tree");
    if (treeIndex >= 0 && parts[treeIndex + 1]) {
      branch = decodeURIComponent(parts[treeIndex + 1]);
    }

    return { owner, repo, branch };
  } catch {
    return null;
  }
}

function detectLanguage(fileName: string): string {
  if (fileName.endsWith(".rs")) return "rust";
  if (fileName.endsWith(".toml")) return "toml";
  if (fileName.endsWith(".json")) return "json";
  if (fileName.endsWith(".md")) return "markdown";
  if (fileName.endsWith(".ts")) return "typescript";
  if (fileName.endsWith(".tsx")) return "typescript";
  if (fileName.endsWith(".js")) return "javascript";
  if (fileName.endsWith(".jsx")) return "javascript";
  return "text";
}

function upsertNode(nodes: FileNode[], pathParts: string[], content: string) {
  if (pathParts.length === 0) return;

  const [head, ...tail] = pathParts;
  if (tail.length === 0) {
    nodes.push({
      name: head,
      type: "file",
      language: detectLanguage(head),
      content,
    });
    return;
  }

  let folder = nodes.find(
    (node) => node.type === "folder" && node.name === head,
  );

  if (!folder) {
    folder = { name: head, type: "folder", children: [] };
    nodes.push(folder);
  }

  if (!folder.children) {
    folder.children = [];
  }

  upsertNode(folder.children, tail, content);
}

function toWorkspaceTree(files: ImportedFile[]): FileNode[] {
  const root: FileNode[] = [];
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of ordered) {
    const pathParts = file.path.split("/").filter(Boolean);
    upsertNode(root, pathParts, file.content);
  }

  return root;
}

function detectProjectStructure(files: ImportedFile[]): DetectionResult {
  const hasCargoToml = files.some((file) => file.path.endsWith("Cargo.toml"));
  const hasSorobanSdk = files.some(
    (file) =>
      file.path.endsWith("Cargo.toml") &&
      file.content.toLowerCase().includes("soroban-sdk"),
  );

  const rustFiles = files.filter((file) => file.path.endsWith(".rs"));
  const suggestedEntryPath =
    rustFiles.find((file) => file.path.endsWith("src/lib.rs"))?.path ??
    rustFiles.find((file) => file.path.endsWith("lib.rs"))?.path ??
    rustFiles[0]?.path ??
    null;

  if (hasCargoToml && hasSorobanSdk) {
    return {
      kind: "soroban",
      hasCargoToml,
      hasSorobanSdk,
      rustFileCount: rustFiles.length,
      suggestedEntryPath,
    };
  }

  if (hasCargoToml || rustFiles.length > 0) {
    return {
      kind: "rust",
      hasCargoToml,
      hasSorobanSdk,
      rustFileCount: rustFiles.length,
      suggestedEntryPath,
    };
  }

  return {
    kind: "generic",
    hasCargoToml,
    hasSorobanSdk,
    rustFileCount: rustFiles.length,
    suggestedEntryPath,
  };
}

function decodeBase64ToUtf8(value: string): string {
  const normalized = value.replace(/\n/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isTextLikePath(path: string): boolean {
  const fileName = path.split("/").pop() ?? path;
  if (!fileName.includes(".")) return false;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

async function fetchWithGitHubHeaders(
  path: string,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${GITHUB_API_BASE}${path}`, { headers });
}

async function resolveRepositoryBranch(
  repo: GitHubRepoRef,
  token?: string,
): Promise<string> {
  if (repo.branch) {
    return repo.branch;
  }

  const repoRes = await fetchWithGitHubHeaders(
    `/repos/${repo.owner}/${repo.repo}`,
    token,
  );

  if (!repoRes.ok) {
    throw new Error("Unable to read repository metadata from GitHub.");
  }

  const repoJson = (await repoRes.json()) as { default_branch?: string };
  return repoJson.default_branch ?? "main";
}

async function importViaGitHubApi(
  repo: GitHubRepoRef,
  token?: string,
): Promise<{ files: ImportedFile[]; branch: string }> {
  const branch = await resolveRepositoryBranch(repo, token);

  const treeRes = await fetchWithGitHubHeaders(
    `/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );

  if (!treeRes.ok) {
    if (treeRes.status === 404) {
      throw new Error("Repository or branch not found.");
    }
    if (treeRes.status === 403) {
      throw new Error("GitHub API rate limit or access denied.");
    }
    throw new Error("Failed to load repository tree.");
  }

  const treeJson = (await treeRes.json()) as {
    tree?: Array<{ path: string; type: string; sha: string }>;
  };

  const blobNodes =
    treeJson.tree?.filter(
      (node) => node.type === "blob" && isTextLikePath(node.path),
    ) ?? [];

  const files: ImportedFile[] = [];
  for (const node of blobNodes.slice(0, 500)) {
    const blobRes = await fetchWithGitHubHeaders(
      `/repos/${repo.owner}/${repo.repo}/git/blobs/${node.sha}`,
      token,
    );

    if (!blobRes.ok) {
      continue;
    }

    const blobJson = (await blobRes.json()) as {
      content?: string;
      encoding?: string;
    };

    if (!blobJson.content || blobJson.encoding !== "base64") {
      continue;
    }

    try {
      files.push({
        path: node.path,
        content: decodeBase64ToUtf8(blobJson.content),
      });
    } catch {
      // Binary-ish content can fail UTF-8 decoding. Skip it.
    }
  }

  return { files, branch };
}

async function importViaIsomorphicGit(
  repoUrl: string,
  branch?: string,
  token?: string,
): Promise<ImportedFile[]> {
  const [{ default: LightningFS }, git, http] = await Promise.all([
    import("@isomorphic-git/lightning-fs"),
    import("isomorphic-git"),
    import("isomorphic-git/http/web"),
  ]);

  const fs = new LightningFS(`stellar-suite-import-${Date.now()}`, { wipe: true });
  const dir = "/imported-repo";
  const fsPromises = fs.promises;

  await fsPromises.mkdir(dir);

  await git.clone({
    fs,
    http: http.default,
    dir,
    url: repoUrl,
    singleBranch: true,
    depth: 1,
    ...(branch ? { ref: branch } : {}),
    onAuth:
      token && token.length > 0
        ? () => ({ username: token, password: "x-oauth-basic" })
        : undefined,
  });

  const files: ImportedFile[] = [];

  const walk = async (currentDir: string) => {
    const entries = await fsPromises.readdir(currentDir);
    for (const entry of entries) {
      if (entry === ".git") continue;

      const fullPath = `${currentDir}/${entry}`.replace(/\/+/g, "/");
      const stat = await fsPromises.stat(fullPath);

      if (stat.type === "dir") {
        await walk(fullPath);
        continue;
      }

      if (!isTextLikePath(entry)) {
        continue;
      }

      try {
        const content = await fsPromises.readFile(fullPath, { encoding: "utf8" });
        const relativePath = fullPath.replace(`${dir}/`, "");
        files.push({
          path: relativePath,
          content: String(content),
        });
      } catch {
        // Ignore unreadable/binary files.
      }
    }
  };

  await walk(dir);
  return files;
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const { isAuthenticated } = useAuth();
  const [importSource, setImportSource] =
    useState<ImportSource>("external-repository");
  const [repoVisibility, setRepoVisibility] = useState<RepoVisibility>("public");
  const [repoUrl, setRepoUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [importMethod, setImportMethod] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const {
    setFiles,
    setOpenTabs,
    addTab,
    setActiveTabPath,
    setLeftSidebarTab,
    setShowExplorer,
  } = useWorkspaceStore();

  const canAttemptImport = useMemo(
    () =>
      importSource === "external-repository" &&
      repoUrl.trim().length > 0 &&
      (!isImporting || isImporting === false),
    [importSource, isImporting, repoUrl],
  );

  const handleImport = async () => {
    setLastError(null);
    setDetection(null);

    const parsed = parseGitHubRepositoryUrl(repoUrl);
    if (!parsed) {
      setLastError("Enter a valid HTTPS GitHub URL.");
      return;
    }

    if (repoVisibility === "private" && !isAuthenticated) {
      setLastError("Private repositories are available only for authenticated users.");
      return;
    }

    const shouldOverwrite = window.confirm(
      "Importing will replace the current workspace files. Continue?",
    );
    if (!shouldOverwrite) return;

    const token =
      repoVisibility === "private" ? accessToken.trim() || undefined : undefined;

    setIsImporting(true);
    try {
      let importedFiles: ImportedFile[] = [];
      let usedMethod = "github-api";

      try {
        importedFiles = await importViaIsomorphicGit(
          repoUrl.trim(),
          parsed.branch,
          token,
        );
        if (importedFiles.length > 0) {
          usedMethod = "git.clone";
        }
      } catch {
        const apiImport = await importViaGitHubApi(parsed, token);
        importedFiles = apiImport.files;
        usedMethod = `github-api:${apiImport.branch}`;
      }

      if (importedFiles.length === 0) {
        throw new Error("No supported text files were found in this repository.");
      }

      const tree = toWorkspaceTree(importedFiles);
      const detected = detectProjectStructure(importedFiles);

      setFiles(tree);
      setOpenTabs([]);
      setShowExplorer(true);
      setLeftSidebarTab("explorer");

      if (detected.suggestedEntryPath) {
        const path = detected.suggestedEntryPath.split("/").filter(Boolean);
        addTab(path, path[path.length - 1]);
        setActiveTabPath(path);
      }

      setDetection(detected);
      setImportMethod(usedMethod);

      if (detected.kind === "soroban") {
        toast.success("Soroban workspace imported successfully.");
      } else {
        toast.success("Repository imported successfully.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Repository import failed.";
      setLastError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5 text-primary" />
            Import Project
          </DialogTitle>
          <DialogDescription>
            Import an existing GitHub repository and auto-initialize a Rust/Soroban workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Import Source
            </label>
            <select
              value={importSource}
              onChange={(event) =>
                setImportSource(event.target.value as ImportSource)
              }
              className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm"
            >
              <option value="external-repository">External Repository</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              GitHub URL (HTTPS)
            </label>
            <Input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Repository Access
              </label>
              <select
                value={repoVisibility}
                onChange={(event) =>
                  setRepoVisibility(event.target.value as RepoVisibility)
                }
                className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-sm"
              >
                <option value="public">Public Repository</option>
                <option value="private" disabled={!isAuthenticated}>
                  Private Repository {!isAuthenticated ? "(Sign in required)" : ""}
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                GitHub Token (optional)
              </label>
              <Input
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="ghp_..."
                disabled={repoVisibility !== "private"}
                autoComplete="off"
              />
            </div>
          </div>

          {lastError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {lastError}
            </div>
          ) : null}

          {detection ? (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                Detection Summary
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>
                  Detected workspace:{" "}
                  <span className="font-semibold text-foreground">{detection.kind}</span>
                </div>
                <div>Rust files: {detection.rustFileCount}</div>
                <div>Cargo.toml: {detection.hasCargoToml ? "Yes" : "No"}</div>
                <div>Soroban SDK: {detection.hasSorobanSdk ? "Yes" : "No"}</div>
                {importMethod ? <div>Import method: {importMethod}</div> : null}
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-border/70 bg-secondary/30 p-2 text-[11px] text-muted-foreground">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
              <p>
                Guest users can only import public repositories. Authenticated users can import
                private repositories using a personal access token.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!canAttemptImport || isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import Repository"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

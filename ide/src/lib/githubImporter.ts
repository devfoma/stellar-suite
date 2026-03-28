export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch: string;
  path?: string;
}

interface GitHubTreeNode {
  path: string;
  type: string;
  url: string;
}

export interface ImportedGitHubFile {
  path: string;
  content: string;
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);

    if (parts.length < 2) return null;

    const [owner, repo, type, branch, ...rest] = parts;

    return {
      owner,
      repo,
      branch: branch || "main",
      path: rest.join("/"),
    };
  } catch {
    return null;
  }
}

export async function fetchRepoTree(info: GitHubRepoInfo) {
  const res = await fetch(
    `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${info.branch}?recursive=1`
  );

  if (!res.ok) {
    throw new Error("Failed to fetch repo tree (rate limit?)");
  }

  const data = await res.json();
  return data.tree as GitHubTreeNode[];
}

const VALID_EXT = [".rs", ".toml", ".json"];

export async function fetchFiles(tree: GitHubTreeNode[]): Promise<ImportedGitHubFile[]> {
  const files = tree.filter(
    (f) =>
      f.type === "blob" &&
      VALID_EXT.some((ext) => f.path.endsWith(ext))
  );

  const results: ImportedGitHubFile[] = [];

  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${file.url
      .split("/repos/")[1]
      .replace("/git/blobs/", "/")}`;

    const res = await fetch(rawUrl);
    const content = await res.text();

    results.push({
      path: file.path,
      content,
    });
  }

  return results;
}

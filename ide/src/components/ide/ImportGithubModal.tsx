import { useState } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGitHubUrl, fetchRepoTree, fetchFiles } from "@/lib/githubImporter";
import { useFileStore } from "@/store/useFileStore";
import { FileNode } from "@/lib/sample-contracts";

interface ImportGithubModalProps {
  open: boolean;
  onClose: () => void;
}

interface ImportedGitHubFile {
  path: string;
  content: string;
}

const detectLanguage = (fileName: string): string => {
  if (fileName.endsWith(".rs")) return "rust";
  if (fileName.endsWith(".toml")) return "toml";
  if (fileName.endsWith(".json")) return "json";
  return "text";
};

const upsertNode = (nodes: FileNode[], pathParts: string[], content: string) => {
  if (pathParts.length === 0) return;

  const [head, ...rest] = pathParts;

  if (rest.length === 0) {
    nodes.push({
      name: head,
      type: "file",
      language: detectLanguage(head),
      content,
    });
    return;
  }

  let folder = nodes.find((node) => node.type === "folder" && node.name === head);
  if (!folder) {
    folder = { name: head, type: "folder", children: [] };
    nodes.push(folder);
  }

  if (!folder.children) {
    folder.children = [];
  }

  upsertNode(folder.children, rest, content);
};

const toWorkspaceTree = (files: ImportedGitHubFile[]): FileNode[] => {
  const root: FileNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    upsertNode(root, parts, file.content);
  }

  return root;
};

export default function ImportGithubModal({ open, onClose }: ImportGithubModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const setFiles = useFileStore((s) => s.setFiles);

  const handleImport = async () => {
    const parsed = parseGitHubUrl(url);

    if (!parsed) {
      alert("Invalid GitHub URL");
      return;
    }

    const confirmOverwrite = confirm(
      "This will overwrite your current workspace. Continue?"
    );

    if (!confirmOverwrite) return;

    try {
      setLoading(true);

      const tree = await fetchRepoTree(parsed);
      const importedFiles = (await fetchFiles(tree)) as ImportedGitHubFile[];
      const mappedTree = toWorkspaceTree(importedFiles);

      setFiles(mappedTree);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      alert(message);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>Import from GitHub</DialogHeader>

        <Input
          placeholder="Paste GitHub repo URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <Button onClick={handleImport} disabled={loading}>
          {loading ? "Importing..." : "Import"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

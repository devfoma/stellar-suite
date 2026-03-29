"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageSquarePlus, Reply, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  useCodeCommentsStore,
  type CodeCommentThread,
} from "@/store/useCodeCommentsStore";
import { useWorkspaceStore } from "@/store/workspaceStore";

interface StartThreadEventDetail {
  filePath: string;
  line: number;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function buildPathLabel(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return `${parts[0]}/.../${parts[parts.length - 1]}`;
}

export function CommentsPane() {
  const { user } = useAuth();
  const { activeTabPath, addTab, setActiveTabPath } = useWorkspaceStore();
  const { threads, addThread, addReply, setResolved } = useCodeCommentsStore();

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeFilePath, setComposeFilePath] = useState(activeTabPath.join("/"));
  const [composeLine, setComposeLine] = useState(1);
  const [composeBody, setComposeBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<StartThreadEventDetail>).detail;
      if (!detail || !detail.filePath || !detail.line) return;

      setComposeOpen(true);
      setComposeFilePath(detail.filePath);
      setComposeLine(Math.max(1, detail.line));
      window.dispatchEvent(new Event("comments:open-pane"));
    };

    window.addEventListener("comments:start-thread", handler as EventListener);
    return () =>
      window.removeEventListener("comments:start-thread", handler as EventListener);
  }, []);

  useEffect(() => {
    if (activeTabPath.length > 0 && !composeOpen) {
      setComposeFilePath(activeTabPath.join("/"));
    }
  }, [activeTabPath, composeOpen]);

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (a.resolved !== b.resolved) {
        return a.resolved ? 1 : -1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [threads]);

  const activeFileThreads = useMemo(() => {
    const activePath = activeTabPath.join("/");
    if (!activePath) return sortedThreads;
    return sortedThreads.filter((thread) => thread.filePath === activePath);
  }, [activeTabPath, sortedThreads]);

  const createThread = () => {
    const body = composeBody.trim();
    const filePath = composeFilePath.trim();
    if (!body || !filePath) return;

    const author = user?.name ?? user?.email ?? "Guest";
    addThread({
      filePath,
      line: Math.max(1, composeLine),
      author,
      body,
    });

    setComposeBody("");
    setComposeOpen(false);
  };

  const openThreadLocation = (thread: CodeCommentThread) => {
    const path = thread.filePath.split("/").filter(Boolean);
    if (path.length === 0) return;

    addTab(path, path[path.length - 1]);
    setActiveTabPath(path);
    window.dispatchEvent(
      new CustomEvent("jumpToPosition", {
        detail: {
          line: thread.line,
          column: 1,
        },
      }),
    );
  };

  const submitReply = (thread: CodeCommentThread) => {
    const body = (replyDrafts[thread.id] ?? "").trim();
    if (!body) return;

    const author = user?.name ?? user?.email ?? "Guest";
    const rootMessageId = thread.messages[0]?.id;

    addReply({
      threadId: thread.id,
      author,
      body,
      parentId: rootMessageId,
    });

    setReplyDrafts((prev) => ({ ...prev, [thread.id]: "" }));
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Comments
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setComposeOpen((open) => !open)}
          >
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
            Add Comment
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {threads.length} thread(s), {threads.filter((thread) => !thread.resolved).length} open
        </p>
      </div>

      {composeOpen ? (
        <div className="space-y-2 border-b border-sidebar-border bg-muted/30 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            New Comment Popover
          </div>
          <Input
            value={composeFilePath}
            onChange={(event) => setComposeFilePath(event.target.value)}
            placeholder="file/path.rs"
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={composeLine}
              onChange={(event) => setComposeLine(Number(event.target.value) || 1)}
              className="h-8 w-28 text-xs"
            />
            <Input
              value={composeBody}
              onChange={(event) => setComposeBody(event.target.value)}
              placeholder="Write a comment..."
              className="h-8 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setComposeOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={createThread}>
              Post
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {activeFileThreads.length === 0 ? (
          <div className="rounded-md border border-dashed border-sidebar-border p-3 text-[11px] text-muted-foreground">
            No comments yet for this file. Hover the editor gutter to add one.
          </div>
        ) : null}

        <div className="space-y-2">
          {activeFileThreads.map((thread) => (
            <article
              key={thread.id}
              className={`rounded-md border p-2 ${
                thread.resolved
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-sidebar-border bg-muted/20"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="truncate text-left text-[11px] font-semibold text-foreground hover:underline"
                  onClick={() => openThreadLocation(thread)}
                  title={thread.filePath}
                >
                  {buildPathLabel(thread.filePath)}:{thread.line}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => setResolved(thread.id, !thread.resolved)}
                >
                  {thread.resolved ? (
                    <>
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      Reopen
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Resolve
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-1.5">
                {thread.messages.map((message) => (
                  <div key={message.id} className="rounded bg-background/40 p-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">{message.author}</span>
                      <time>{formatTimestamp(message.createdAt)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-foreground">
                      {message.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex gap-1.5">
                <Input
                  value={replyDrafts[thread.id] ?? ""}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [thread.id]: event.target.value,
                    }))
                  }
                  placeholder="Write a reply..."
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => submitReply(thread)}
                >
                  <Reply className="mr-1 h-3 w-3" />
                  Reply
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

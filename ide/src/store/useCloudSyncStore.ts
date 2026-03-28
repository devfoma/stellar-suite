"use client";

/**
 * useCloudSyncStore.ts
 *
 * Zustand store for cloud project persistence state.
 *
 * Auto-save is throttled with a 5-second debounce so that rapid edits
 * only produce one network round-trip per burst of typing.
 * The last-saved file hashes are kept in module scope (not persisted) to
 * detect no-op saves and skip unnecessary uploads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  saveProject,
  loadProject,
  type ProjectData,
  type WorkspaceTextFile,
} from "@/lib/cloud/cloudSyncService";
import { buildHashMap } from "@/lib/cloud/fileHash";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CloudSyncStatus =
  | "idle"
  | "saving"
  | "saved"
  | "loading"
  | "conflict"
  | "error";

interface CloudSyncState {
  // Persisted across page reloads
  projectId: string | null;
  projectName: string;
  lastSyncedAt: string | null; // ISO timestamp of last successful save

  // Transient (reset on mount)
  syncStatus: CloudSyncStatus;
  errorMessage: string | null;
  conflictData: ProjectData | null;

  // Actions
  setProjectName: (name: string) => void;
  triggerSave: (
    userId: string,
    files: WorkspaceTextFile[],
    network: string,
  ) => Promise<void>;
  scheduleAutoSave: (
    userId: string,
    files: WorkspaceTextFile[],
    network: string,
  ) => void;
  loadFromCloud: (projectId: string) => Promise<ProjectData | null>;
  resolveConflict: (choice: "local" | "cloud") => void;
  clearError: () => void;
}

// ── Module-level mutable refs (not serialised to storage) ────────────────────

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
/** Hash map of the files as of the last successful cloud save. */
let _lastSavedHashes: Record<string, string> = {};

const AUTO_SAVE_DELAY_MS = 5_000;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      // ── Persisted initial state ─────────────────────────────────────────────
      projectId: null,
      projectName: "Untitled Project",
      lastSyncedAt: null,

      // ── Transient initial state ─────────────────────────────────────────────
      syncStatus: "idle",
      errorMessage: null,
      conflictData: null,

      // ── Actions ─────────────────────────────────────────────────────────────

      setProjectName: (name) => set({ projectName: name }),

      triggerSave: async (userId, files, network) => {
        if (!userId) return;

        // Skip if nothing has changed since the last save
        const currentHashes = buildHashMap(files);
        const hasChanges = files.some(
          (f) => _lastSavedHashes[f.path] !== currentHashes[f.path],
        );
        const hasDeletes = Object.keys(_lastSavedHashes).some(
          (p) => !currentHashes[p],
        );

        if (!hasChanges && !hasDeletes && get().projectId !== null) return;

        set({ syncStatus: "saving", errorMessage: null });

        try {
          const { projectId, projectName, lastSyncedAt } = get();

          const result = await saveProject({
            projectId,
            name: projectName,
            network,
            files,
            fileHashes: currentHashes,
            lastKnownUpdatedAt: lastSyncedAt,
          });

          if (result.type === "conflict") {
            set({ syncStatus: "conflict", conflictData: result.cloudData });
            return;
          }

          _lastSavedHashes = result.fileHashes;
          set({
            syncStatus: "saved",
            projectId: result.projectId,
            lastSyncedAt: result.updatedAt,
            conflictData: null,
          });

          // Reset the "saved" indicator back to idle after 3 s
          setTimeout(() => {
            if (useCloudSyncStore.getState().syncStatus === "saved") {
              useCloudSyncStore.setState({ syncStatus: "idle" });
            }
          }, 3_000);
        } catch (err) {
          set({
            syncStatus: "error",
            errorMessage: err instanceof Error ? err.message : "Save failed",
          });
        }
      },

      scheduleAutoSave: (userId, files, network) => {
        if (_autoSaveTimer) {
          clearTimeout(_autoSaveTimer);
        }
        _autoSaveTimer = setTimeout(() => {
          _autoSaveTimer = null;
          void get().triggerSave(userId, files, network);
        }, AUTO_SAVE_DELAY_MS);
      },

      loadFromCloud: async (projectId) => {
        set({ syncStatus: "loading", errorMessage: null });
        try {
          const data = await loadProject(projectId);
          if (!data) {
            set({ syncStatus: "error", errorMessage: "Project not found" });
            return null;
          }
          _lastSavedHashes = data.fileHashes ?? {};
          set({
            syncStatus: "idle",
            projectId: data.id,
            projectName: data.name,
            lastSyncedAt: data.updatedAt,
          });
          return data;
        } catch (err) {
          set({
            syncStatus: "error",
            errorMessage: err instanceof Error ? err.message : "Load failed",
          });
          return null;
        }
      },

      resolveConflict: (choice) => {
        if (choice === "local") {
          // User keeps local — clear conflict state and allow a forced save
          _lastSavedHashes = {};
          set({ syncStatus: "idle", conflictData: null });
        } else {
          // "cloud" branch is handled by the UI calling loadFromCloud after
          // applying the conflictData to the workspace store
          set({ syncStatus: "idle", conflictData: null });
        }
      },

      clearError: () => set({ syncStatus: "idle", errorMessage: null }),
    }),
    {
      name: "stellar-suite-cloud-sync",
      // Only persist the IDs and timestamps; status is always transient
      partialize: (state) => ({
        projectId: state.projectId,
        projectName: state.projectName,
        lastSyncedAt: state.lastSyncedAt,
      }),
    },
  ),
);

import { create } from "zustand";
import {
  gitService,
  type GitFileStatus,
  type GitWorkspaceFile,
} from "@/lib/vcs/gitService";

export type VCSOperation = "idle" | "committing" | "pushing" | "syncing";
export type VCSStatus = "idle" | "success" | "error";

interface VCSState {
  commitMessage: string;
  commitAuthorName: string;
  commitAuthorEmail: string;
  operation: VCSOperation;
  status: VCSStatus;
  statusMessage: string;
  progress: number;
  remoteUrl: string;
  branch: string;
  isAuthenticated: boolean;
  lastCommitSha: string | null;
  localRepoInitialized: boolean;
  localRepoInitializing: boolean;
  localRepoMessage: string;
  localRepoError: string | null;
  localStatusMap: Record<string, GitFileStatus>;

  setCommitMessage: (message: string) => void;
  setCommitAuthorName: (name: string) => void;
  setCommitAuthorEmail: (email: string) => void;
  setOperation: (op: VCSOperation) => void;
  setStatus: (status: VCSStatus, message?: string) => void;
  setProgress: (progress: number) => void;
  setRemoteUrl: (url: string) => void;
  setBranch: (branch: string) => void;
  setIsAuthenticated: (auth: boolean) => void;
  setLastCommitSha: (sha: string | null) => void;
  initializeLocalRepo: (files: GitWorkspaceFile[]) => Promise<void>;
  hydrateLocalRepo: (files: GitWorkspaceFile[]) => Promise<void>;
  refreshLocalStatuses: (files: GitWorkspaceFile[]) => Promise<void>;
  setLocalRepoMessage: (message: string) => void;
  clearLocalRepoError: () => void;
  reset: () => void;
}

const initialState = {
  commitMessage: "",
  commitAuthorName: "",
  commitAuthorEmail: "",
  operation: "idle" as VCSOperation,
  status: "idle" as VCSStatus,
  statusMessage: "",
  progress: 0,
  remoteUrl: "",
  branch: "main",
  isAuthenticated: false,
  lastCommitSha: null,
  localRepoInitialized: false,
  localRepoInitializing: false,
  localRepoMessage: "",
  localRepoError: null,
  localStatusMap: {},
};

export const useVCSStore = create<VCSState>()((set) => ({
  ...initialState,

  setCommitMessage: (commitMessage) => set({ commitMessage }),
  setCommitAuthorName: (commitAuthorName) => set({ commitAuthorName }),
  setCommitAuthorEmail: (commitAuthorEmail) => set({ commitAuthorEmail }),
  setOperation: (operation) => set({ operation }),
  setStatus: (status, statusMessage = "") => set({ status, statusMessage }),
  setProgress: (progress) => set({ progress }),
  setRemoteUrl: (remoteUrl) => set({ remoteUrl }),
  setBranch: (branch) => set({ branch }),
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setLastCommitSha: (lastCommitSha) => set({ lastCommitSha }),
  setLocalRepoMessage: (localRepoMessage) => set({ localRepoMessage }),
  clearLocalRepoError: () => set({ localRepoError: null }),
  initializeLocalRepo: async (files) => {
    set({
      localRepoInitializing: true,
      localRepoError: null,
      localRepoMessage: "Initializing local Git repository...",
    });

    try {
      const localStatusMap = await gitService.initializeRepository(files);
      set({
        localRepoInitialized: true,
        localRepoInitializing: false,
        localRepoMessage: "Local Git repository initialized in IndexedDB.",
        localStatusMap,
        branch: gitService.defaultBranch,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initialize local Git repository.";
      set({
        localRepoInitializing: false,
        localRepoError: message,
        localRepoMessage: "",
      });
    }
  },
  hydrateLocalRepo: async (files) => {
    try {
      const localRepoInitialized = await gitService.isRepositoryInitialized();

      if (!localRepoInitialized) {
        set({
          localRepoInitialized: false,
          localStatusMap: {},
          localRepoMessage: "",
          localRepoError: null,
        });
        return;
      }

      const localStatusMap = await gitService.syncWorkspace(files);
      set({
        localRepoInitialized: true,
        localStatusMap,
        localRepoError: null,
        branch: gitService.defaultBranch,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to hydrate local Git repository.";
      set({
        localRepoInitialized: false,
        localRepoError: message,
      });
    }
  },
  refreshLocalStatuses: async (files) => {
    if (!(await gitService.isRepositoryInitialized())) {
      set({ localRepoInitialized: false, localStatusMap: {} });
      return;
    }

    try {
      const localStatusMap = await gitService.syncWorkspace(files);
      set({
        localRepoInitialized: true,
        localStatusMap,
        localRepoError: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh local Git status.";
      set({ localRepoError: message });
    }
  },
  reset: () => set(initialState),
}));

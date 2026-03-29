import type { FileNode } from "@/lib/sample-contracts";
import {
  getTutorialById,
  tutorialContentCollection,
  type TutorialActionRecord,
  type TutorialActionType,
  type TutorialDefinition,
  type TutorialWorkspaceSnapshot,
} from "@/lib/tutorials/content";

const STORAGE_KEY = "stellar-suite:tutorial-engine-state";

export interface TutorialEngineState {
  status: "idle" | "active" | "completed";
  activeTutorialId: string | null;
  currentStepIndex: number;
  completedStepIds: string[];
  lastAction: TutorialActionRecord | null;
  startedAt: string | null;
  completedAt: string | null;
}

type Listener = (state: TutorialEngineState) => void;

const initialState: TutorialEngineState = {
  status: "idle",
  activeTutorialId: null,
  currentStepIndex: 0,
  completedStepIds: [],
  lastAction: null,
  startedAt: null,
  completedAt: null,
};

function cloneState(state: TutorialEngineState): TutorialEngineState {
  return {
    ...state,
    completedStepIds: [...state.completedStepIds],
    lastAction: state.lastAction ? { ...state.lastAction } : null,
  };
}

function readStateFromStorage(): TutorialEngineState {
  if (typeof window === "undefined") return cloneState(initialState);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(initialState);
    const parsed = JSON.parse(raw) as TutorialEngineState;
    return {
      ...cloneState(initialState),
      ...parsed,
      completedStepIds: Array.isArray(parsed.completedStepIds)
        ? parsed.completedStepIds
        : [],
    };
  } catch {
    return cloneState(initialState);
  }
}

function persistState(state: TutorialEngineState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors.
  }
}

function flattenFiles(
  nodes: FileNode[],
  prefix: string[] = [],
): TutorialWorkspaceSnapshot["files"] {
  const out: TutorialWorkspaceSnapshot["files"] = [];
  for (const node of nodes) {
    const nextPath = [...prefix, node.name];
    if (node.type === "folder") {
      out.push(...flattenFiles(node.children ?? [], nextPath));
    } else {
      out.push({
        path: nextPath.join("/"),
        content: node.content ?? "",
      });
    }
  }
  return out;
}

export function createWorkspaceSnapshot(
  files: FileNode[],
  activeFilePath: string[],
): TutorialWorkspaceSnapshot {
  return {
    files: flattenFiles(files),
    activeFilePath: activeFilePath.join("/"),
  };
}

class TutorialEngine {
  private state: TutorialEngineState = readStateFromStorage();
  private listeners = new Set<Listener>();

  getState(): TutorialEngineState {
    return cloneState(this.state);
  }

  getActiveTutorial(): TutorialDefinition | null {
    if (!this.state.activeTutorialId) return null;
    return getTutorialById(this.state.activeTutorialId) ?? null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  startTutorial(tutorialId: string, snapshot?: TutorialWorkspaceSnapshot) {
    const tutorial = getTutorialById(tutorialId);
    if (!tutorial) {
      throw new Error(`Unknown tutorial: ${tutorialId}`);
    }

    this.state = {
      status: "active",
      activeTutorialId: tutorial.id,
      currentStepIndex: 0,
      completedStepIds: [],
      lastAction: {
        type: "workspace.initialized",
        timestamp: new Date().toISOString(),
      },
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    if (snapshot) {
      this.evaluateMilestones(snapshot);
      return;
    }

    this.emit();
  }

  stopTutorial() {
    this.state = cloneState(initialState);
    this.emit();
  }

  recordAction(
    type: TutorialActionType,
    metadata?: Record<string, string | number | boolean>,
    snapshot?: TutorialWorkspaceSnapshot,
  ) {
    if (!this.state.activeTutorialId || this.state.status !== "active") return;

    this.state = {
      ...this.state,
      lastAction: {
        type,
        timestamp: new Date().toISOString(),
        metadata,
      },
    };

    if (snapshot) {
      this.evaluateMilestones(snapshot);
      return;
    }

    this.emit();
  }

  evaluateMilestones(snapshot: TutorialWorkspaceSnapshot) {
    const tutorial = this.getActiveTutorial();
    if (!tutorial || this.state.status !== "active") {
      this.emit();
      return;
    }

    let nextState = cloneState(this.state);
    let changed = false;

    while (nextState.currentStepIndex < tutorial.steps.length) {
      const step = tutorial.steps[nextState.currentStepIndex];
      const action = nextState.lastAction ?? undefined;
      const actionSatisfied = step.waitForAction
        ? action?.type === step.waitForAction
        : true;
      const checkSatisfied = step.check ? step.check(snapshot, action) : true;

      if (!actionSatisfied || !checkSatisfied) {
        break;
      }

      nextState.completedStepIds.push(step.id);
      nextState.currentStepIndex += 1;
      changed = true;
    }

    if (nextState.currentStepIndex >= tutorial.steps.length) {
      nextState.status = "completed";
      nextState.completedAt = new Date().toISOString();
      changed = true;
    }

    if (changed) {
      this.state = nextState;
    }

    this.emit();
  }

  listTutorials(): TutorialDefinition[] {
    return [...tutorialContentCollection];
  }

  private emit() {
    const stateSnapshot = this.getState();
    persistState(stateSnapshot);
    for (const listener of this.listeners) {
      listener(stateSnapshot);
    }
  }
}

export const tutorialEngine = new TutorialEngine();

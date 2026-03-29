export type TutorialActionType =
  | "workspace.initialized"
  | "file.opened"
  | "build.success"
  | "build.failure"
  | "test.run"
  | "deploy.success"
  | "deploy.failure";

export interface TutorialWorkspaceFile {
  path: string;
  content: string;
}

export interface TutorialWorkspaceSnapshot {
  files: TutorialWorkspaceFile[];
  activeFilePath?: string;
}

export interface TutorialActionRecord {
  type: TutorialActionType;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface TutorialStepDefinition {
  id: string;
  title: string;
  instruction: string;
  waitForAction?: TutorialActionType;
  check?: (
    snapshot: TutorialWorkspaceSnapshot,
    action?: TutorialActionRecord,
  ) => boolean;
}

export interface TutorialDefinition {
  id: string;
  title: string;
  description: string;
  templateId: string;
  tags: string[];
  steps: TutorialStepDefinition[];
}

const hasFile = (snapshot: TutorialWorkspaceSnapshot, pathEndsWith: string) =>
  snapshot.files.some((file) => file.path.endsWith(pathEndsWith));

const fileContains = (
  snapshot: TutorialWorkspaceSnapshot,
  pathEndsWith: string,
  snippet: string,
) =>
  snapshot.files.some(
    (file) =>
      file.path.endsWith(pathEndsWith) &&
      file.content.toLowerCase().includes(snippet.toLowerCase()),
  );

export const tutorialContentCollection: TutorialDefinition[] = [
  {
    id: "counter-basics",
    title: "Counter Contract Basics",
    description:
      "Create and validate a basic Soroban counter contract directly in the IDE.",
    templateId: "counter",
    tags: ["beginner", "counter", "soroban"],
    steps: [
      {
        id: "workspace-ready",
        title: "Load Counter Workspace",
        instruction:
          "Initialize the Counter template so we can walk through a real contract flow.",
        waitForAction: "workspace.initialized",
        check: (snapshot) => hasFile(snapshot, "increment/lib.rs"),
      },
      {
        id: "open-lib",
        title: "Open increment/lib.rs",
        instruction:
          "Open increment/lib.rs in the editor to inspect the contract entrypoints.",
        waitForAction: "file.opened",
        check: (snapshot, action) =>
          typeof action?.metadata?.path === "string" &&
          action.metadata.path.endsWith("increment/lib.rs"),
      },
      {
        id: "check-increment-fn",
        title: "Inspect Increment Function",
        instruction:
          "Verify the contract exposes `pub fn increment(env: Env)` and persists state.",
        check: (snapshot) =>
          fileContains(snapshot, "increment/lib.rs", "pub fn increment") &&
          fileContains(snapshot, "increment/lib.rs", "DataKey::Counter"),
      },
      {
        id: "run-build",
        title: "Run Build",
        instruction:
          "Click the Build button to compile the contract and continue.",
        waitForAction: "build.success",
      },
      {
        id: "run-tests",
        title: "Run Tests",
        instruction:
          "Run tests from the toolbar to validate behavior end-to-end.",
        waitForAction: "test.run",
      },
    ],
  },
];

export function getTutorialById(id: string): TutorialDefinition | undefined {
  return tutorialContentCollection.find((tutorial) => tutorial.id === id);
}

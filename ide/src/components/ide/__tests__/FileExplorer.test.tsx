import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FileExplorer } from "@/components/ide/FileExplorer";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useVCSStore } from "@/store/vcsStore";
import { useCoverageStore } from "@/store/useCoverageStore";

describe("FileExplorer git integration", () => {
  beforeEach(() => {
    useCoverageStore.setState({ summary: null });
    useWorkspaceStore.setState({
      files: [
        {
          name: "src",
          type: "folder",
          children: [
            {
              name: "lib.rs",
              type: "file",
              language: "rust",
              content: "fn main() {}\n",
            },
            {
              name: "new.rs",
              type: "file",
              language: "rust",
              content: "fn added() {}\n",
            },
          ],
        },
      ],
      openTabs: [],
      activeTabPath: [],
      unsavedFiles: new Set<string>(),
      mobilePanel: "none",
    });
    useVCSStore.setState({
      ...useVCSStore.getState(),
      localRepoInitialized: false,
      localRepoInitializing: false,
      localRepoMessage: "",
      localRepoError: null,
      localStatusMap: {},
    });
  });

  it("shows an explorer button to initialize a local git repository", () => {
    const initializeLocalRepo = vi.fn(() => Promise.resolve());
    useVCSStore.setState({ initializeLocalRepo });

    render(<FileExplorer />);

    const button = screen.getByRole("button", {
      name: /Initialize Git Repository/i,
    });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(initializeLocalRepo).toHaveBeenCalledTimes(1);
  });

  it("renders git status badges and deleted ghost rows in the tree", () => {
    useVCSStore.setState({
      localRepoInitialized: true,
      localStatusMap: {
        "src/lib.rs": "modified",
        "src/new.rs": "new",
        "src/deleted.rs": "deleted",
      },
    });

    render(<FileExplorer />);

    expect(screen.getByText("lib.rs")).toBeInTheDocument();
    expect(screen.getByText("new.rs")).toBeInTheDocument();
    expect(screen.getByText("deleted.rs")).toBeInTheDocument();
    expect(screen.getByLabelText("modified")).toBeInTheDocument();
    expect(screen.getByLabelText("new")).toBeInTheDocument();
    expect(screen.getByLabelText("deleted")).toBeInTheDocument();
  });
});

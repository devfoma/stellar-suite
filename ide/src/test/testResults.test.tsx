import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleContracts } from "@/lib/sample-contracts";
import {
  createSimulatedCargoTestOutput,
  extractTraceLocationsFromText,
  formatTestRunForTerminal,
  parseStructuredTestOutput,
  resolveWorkspacePathForTrace,
} from "@/lib/testResults";
import { TestResultsLog } from "@/components/terminal/TestResultsLog";

describe("testResults helpers", () => {
  it("parses simulated cargo output into a structured failed run", () => {
    const rawOutput = createSimulatedCargoTestOutput({
      files: sampleContracts,
      activeTabPath: ["hello_world", "lib.rs"],
    });

    const result = parseStructuredTestOutput(rawOutput);

    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.cases[1]?.trace[0]?.file).toBe("hello_world/src/test.rs");
    expect(formatTestRunForTerminal(result)).toContain("test result:");
  });

  it("maps trace paths back to workspace files", () => {
    expect(
      resolveWorkspacePathForTrace("hello_world/src/test.rs", sampleContracts)
    ).toEqual(["hello_world", "test.rs"]);
  });

  it("extracts trace locations from stdout text", () => {
    const output = [
      "thread 'tests::foo' panicked at src/lib.rs:21:9",
      "  --> hello_world/src/test.rs:8:5",
    ].join("\n");

    const locations = extractTraceLocationsFromText(output);

    expect(locations).toEqual([
      {
        file: "src/lib.rs",
        line: 21,
        column: 9,
        label: "Detected in output",
      },
      {
        file: "hello_world/src/test.rs",
        line: 8,
        column: 5,
        label: "Detected in output",
      },
    ]);
  });
});

describe("TestResultsLog", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("renders failed test details, deep links, and rerun controls", async () => {
    const onOpenTrace = vi.fn();
    const onRerunFailed = vi.fn();
    const result = parseStructuredTestOutput(
      createSimulatedCargoTestOutput({
        files: sampleContracts,
        activeTabPath: ["hello_world", "lib.rs"],
      })
    );

    render(
      <TestResultsLog
        result={result}
        onOpenTrace={onOpenTrace}
        onRerunFailed={onRerunFailed}
      />
    );

    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rerun failed/i })).toBeEnabled();

    const traceTexts = await screen.findAllByText(/hello_world\/src\/test\.rs/i);
    const traceButton = traceTexts
      .map((node) => node.closest("button"))
      .find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    expect(traceButton).toBeTruthy();

    if (traceButton) {
      fireEvent.click(traceButton);
      expect(onOpenTrace).toHaveBeenCalledWith(
        "hello_world/src/test.rs",
        expect.any(Number),
        5
      );
    }

    fireEvent.click(screen.getByRole("button", { name: /rerun failed/i }));
    expect(onRerunFailed).toHaveBeenCalledTimes(1);
  });

  it("creates clickable trace links from stdout when explicit trace metadata is absent", async () => {
    const onOpenTrace = vi.fn();
    const onRerunFailed = vi.fn();
    const parsed = parseStructuredTestOutput(
      createSimulatedCargoTestOutput({
        files: sampleContracts,
        activeTabPath: ["hello_world", "lib.rs"],
      })
    );

    const resultWithoutTrace = {
      ...parsed,
      cases: parsed.cases.map((testCase) =>
        testCase.status === "failed" ? { ...testCase, trace: [] } : testCase
      ),
    };

    render(
      <TestResultsLog
        result={resultWithoutTrace}
        onOpenTrace={onOpenTrace}
        onRerunFailed={onRerunFailed}
      />
    );

    const traceMatches = await screen.findAllByText(/hello_world\/src\/test\.rs/i);
    const traceButton = traceMatches
      .map((node) => node.closest("button"))
      .find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    expect(traceButton).toBeTruthy();

    if (traceButton) {
      fireEvent.click(traceButton);
      expect(onOpenTrace).toHaveBeenCalledWith(
        "hello_world/src/test.rs",
        expect.any(Number),
        5
      );
    }
  });
});
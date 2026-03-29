"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Circle, CircleCheckBig, PauseCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { tutorialEngine, createWorkspaceSnapshot } from "@/lib/tutorials/tutorialEngine";

export function TutorialsPane() {
  const { files, activeTabPath } = useWorkspaceStore();
  const [engineState, setEngineState] = useState(tutorialEngine.getState());
  const tutorials = useMemo(() => tutorialEngine.listTutorials(), []);
  const activeTutorial = useMemo(
    () =>
      engineState.activeTutorialId
        ? tutorials.find((tutorial) => tutorial.id === engineState.activeTutorialId) ?? null
        : null,
    [engineState.activeTutorialId, tutorials],
  );

  useEffect(() => tutorialEngine.subscribe(setEngineState), []);

  useEffect(() => {
    tutorialEngine.evaluateMilestones(createWorkspaceSnapshot(files, activeTabPath));
  }, [files, activeTabPath]);

  if (!activeTutorial) {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        <div className="border-b border-sidebar-border px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Tutorials
          </h3>
        </div>
        <div className="px-3 py-3 text-[11px] text-muted-foreground">
          Start a tutorial from the landing wizard to get guided in-IDE instructions.
        </div>
      </div>
    );
  }

  const currentStep = activeTutorial.steps[engineState.currentStepIndex] ?? null;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
            <BookOpenCheck className="h-3.5 w-3.5 text-primary" />
            Tutorials
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => tutorialEngine.stopTutorial()}
          >
            Stop
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {activeTutorial.title} - step {Math.min(engineState.currentStepIndex + 1, activeTutorial.steps.length)}
          /{activeTutorial.steps.length}
        </p>
      </div>

      <div className="border-b border-sidebar-border bg-muted/30 px-3 py-3">
        {engineState.status === "completed" ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px] text-emerald-300">
            Tutorial completed. You can replay it anytime from the landing wizard.
          </div>
        ) : currentStep ? (
          <div className="rounded-md border border-border bg-background/40 p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <PauseCircle className="h-3.5 w-3.5" />
              Waiting For Action
            </div>
            <p className="text-[11px] text-foreground">{currentStep.instruction}</p>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-2">
          {activeTutorial.steps.map((step, index) => {
            const done = engineState.completedStepIds.includes(step.id);
            const active = !done && index === engineState.currentStepIndex;

            return (
              <div
                key={step.id}
                className={`rounded-md border p-2 ${
                  done
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : active
                      ? "border-primary/50 bg-primary/10"
                      : "border-sidebar-border bg-muted/20"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                  {done ? (
                    <CircleCheckBig className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{step.title}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{step.instruction}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

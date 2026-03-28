import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { CriterionSample } from "@/lib/criterionParser";

export interface BenchmarkRun {
  id: string;
  contractName: string;
  timestamp: number;
  /** Parsed samples from this run */
  samples: CriterionSample[];
  /** Raw output for debugging */
  rawOutput: string;
}

const MAX_RUNS_PER_CONTRACT = 20;

interface BenchmarkState {
  runs: BenchmarkRun[];
  isRunning: boolean;
  lastError: string | null;
  setIsRunning: (v: boolean) => void;
  setLastError: (err: string | null) => void;
  addRun: (run: BenchmarkRun) => void;
  clearHistory: (contractName?: string) => void;
  getRunsForContract: (contractName: string) => BenchmarkRun[];
}

export const useBenchmarkStore = create<BenchmarkState>()(
  persist(
    (set, get) => ({
      runs: [],
      isRunning: false,
      lastError: null,

      setIsRunning: (isRunning) => set({ isRunning }),
      setLastError: (lastError) => set({ lastError }),

      addRun: (run) => {
        set((state) => {
          const forContract = state.runs.filter(
            (r) => r.contractName === run.contractName,
          );
          const others = state.runs.filter(
            (r) => r.contractName !== run.contractName,
          );
          // newest first while stored; getRunsForContract re-sorts ascending
          const trimmed = [run, ...forContract].slice(0, MAX_RUNS_PER_CONTRACT);
          return { runs: [...others, ...trimmed] };
        });
      },

      clearHistory: (contractName) => {
        set((state) => ({
          runs: contractName
            ? state.runs.filter((r) => r.contractName !== contractName)
            : [],
        }));
      },

      getRunsForContract: (contractName) =>
        get()
          .runs.filter((r) => r.contractName === contractName)
          .sort((a, b) => a.timestamp - b.timestamp),
    }),
    {
      name: "stellar-ide-benchmarks",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // SSR stub
          return {
            getItem: () => null,
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              setItem: () => {},
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              removeItem: () => {},
          };
        }
        return localStorage;
      }),
    },
  ),
);

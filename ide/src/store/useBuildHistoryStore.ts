import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/utils/idbStorage";

export interface BuildRecord {
  id: string;
  name: string;
  timestamp: string;
  wasmBase64: string; // Storing as base64 for simplicity in JSON storage
  size: number;
}

interface BuildHistoryStore {
  builds: BuildRecord[];
  addBuild: (name: string, wasm: Uint8Array) => void;
  removeBuild: (id: string) => void;
  clearHistory: () => void;
}

export const useBuildHistoryStore = create<BuildHistoryStore>()(
  persist(
    (set) => ({
      builds: [],

      addBuild: (name, wasm) => {
        const reader = new FileReader();
        const blob = new Blob([wasm]);
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const wasmBase64 = base64data.split(",")[1];
          
          set((state) => ({
            builds: [
              ...state.builds,
              {
                id: crypto.randomUUID(),
                name,
                timestamp: new Date().toISOString(),
                wasmBase64,
                size: wasm.length,
              },
            ].slice(-20), // Keep last 20 builds
          }));
        };
      },

      removeBuild: (id) =>
        set((state) => ({
          builds: state.builds.filter((b) => b.id !== id),
        })),

      clearHistory: () => set({ builds: [] }),
    }),
    {
      name: "stellar-suite:build-history",
      storage: createJSONStorage(() => idbStorage),
    }
  )
);

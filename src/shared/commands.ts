import type { HypothesisValue } from "./types";

export type Command =
  | { type: "cell"; id: number; mark?: boolean }
  | { type: "chord"; id: number }
  | { type: "mode"; mode: "reveal" | "mark" | "probe" | "flare" | "assume" }
  | { type: "shield" }
  | { type: "pause"; paused?: boolean }
  | { type: "tick" }
  | { type: "extract" }
  | { type: "new"; difficulty: "scout" | "scholar" | "legend"; seed: string }
  | { type: "branch-new"; name?: string }
  | { type: "branch-rename"; id: string; name: string }
  | { type: "branch-select"; id: string | null }
  | { type: "branch-delete"; id: string }
  | { type: "branch-assume"; id: string; cell: number; value: HypothesisValue }
  | { type: "branch-clear"; id: string; cell: number }
  | { type: "branch-merge"; id: string }
  | { type: "branch-merge-set"; ids: string[] };

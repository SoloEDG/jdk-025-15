import type { Expedition } from "../../../shared/types";
import { analyze, type AnalysisInput } from "../lib/deduce";
import { publicBoard } from "../../terrain/lib/visibility";

/** Turns the expedition's hypotheses into branch inputs and runs the proof. */
export function analyzeExpedition(e: Expedition) {
  const input: AnalysisInput = {
    branches: e.hypotheses.branches.map((b) => ({
      id: b.id,
      name: b.name,
      active: b.id === e.hypotheses.active,
      assumptions: b.assumptions,
    })),
    merge: e.hypotheses.merge,
  };
  return analyze(publicBoard(e.board), input);
}

export interface Overlay {
  /** Verified merge verdicts: the only conclusions usable for safe play. */
  safe: number[];
  danger: number[];
  merged: Set<number>;
}

/**
 * Merged conclusions are the sole actionable overlay. Branch-only verdicts
 * stay inside their card so nothing hypothesis-derived is painted on the map
 * as if it were proven.
 */
export function branchOverlay(
  _e: Expedition,
  analysis: ReturnType<typeof analyze>,
): Overlay {
  const overlay: Overlay = { safe: [], danger: [], merged: new Set() };
  if (!analysis.merge.actionable) return overlay;
  for (const [key, kind] of Object.entries(analysis.merge.cells)) {
    const cell = Number(key);
    overlay.merged.add(cell);
    (kind === "safe" ? overlay.safe : overlay.danger).push(cell);
  }
  return overlay;
}

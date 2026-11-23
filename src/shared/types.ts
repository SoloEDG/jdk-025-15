export type Difficulty = "scout" | "scholar" | "legend";
export type Mode = "reveal" | "mark" | "probe" | "flare" | "assume";
export type Status = "ready" | "active" | "won" | "lost" | "extracted";
export type Mark = "none" | "flag" | "question";
export type RelicId = "sun" | "vessel" | "tablet";
export type HypothesisValue = "safe" | "danger";
export interface HypothesisBranch {
  id: string;
  name: string;
  assumptions: Record<string, HypothesisValue>;
  createdAt: number;
  updatedAt: number;
}
export interface Hypotheses {
  branches: HypothesisBranch[];
  /** Active branch id, or null for the direct (no-assumption) baseline. */
  active: string | null;
  /** Branch ids selected for the merge, including the special "direct". */
  merge: string[];
}
export interface Cell {
  id: number;
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  mark: Mark;
  intel: "unknown" | "safe" | "danger";
  relic: RelicId | null;
  terrain: "moss" | "stone" | "water";
}
export interface Board {
  width: number;
  height: number;
  mines: number;
  seed: string;
  difficulty: Difficulty;
  generated: boolean;
  cells: Cell[];
}
export interface ActionEntry {
  id: number;
  kind:
    | "reveal"
    | "mark"
    | "probe"
    | "flare"
    | "hit"
    | "shield"
    | "extract"
    | "assume";
  cell: number | null;
  message: string;
  second: number;
}
export interface Expedition {
  id: string;
  board: Board;
  status: Status;
  mode: Mode;
  lives: number;
  shield: boolean;
  tools: { probe: number; flare: number; shield: number };
  used: number;
  mistakes: number;
  elapsed: number;
  paused: boolean;
  actions: ActionEntry[];
  nextAction: number;
  selected: number | null;
  startedAt: number;
  hypotheses: Hypotheses;
}
export interface Report {
  id: string;
  seed: string;
  difficulty: Difficulty;
  outcome: Status;
  safe: number;
  totalSafe: number;
  relics: RelicId[];
  score: number;
  seconds: number;
  used: number;
  mistakes: number;
  endedAt: number;
}
export interface Archive {
  reports: Report[];
  discoveries: Partial<Record<RelicId, number>>;
  totalScore: number;
}
export interface GameDocument {
  version: 1;
  expedition: Expedition;
  archive: Archive;
}
export interface PublicCell {
  id: number;
  revealed: boolean;
  mark: Mark;
  adjacent: number | null;
  intel: Cell["intel"];
  exploded: boolean;
}
export interface PublicBoard {
  width: number;
  height: number;
  mines: number;
  cells: PublicCell[];
}
export type ProofStatus =
  | "ready"
  | "pending"
  | "conflict"
  | "contradiction"
  | "empty"
  | "proven";
export interface BranchDeduction {
  cell: number;
  kind: "safe" | "danger";
  reasons: number[];
  text: string;
}
export interface BaseAnalysis {
  /** Complete joint assignments satisfying every public number, if enumerated. */
  worlds: number;
  feasible: boolean;
  status: "ready" | "proven" | "conflict" | "pending";
  note: string;
  /** Verdicts true in every assignment, before any hypothesis. */
  conclusions: BranchDeduction[];
}
export interface BranchAnalysis {
  id: string;
  name: string;
  active: boolean;
  /** No assumptions yet: it carries no support and cannot vote in a merge. */
  empty: boolean;
  status: ProofStatus;
  /** At least one complete assignment satisfies the branch assumptions. */
  feasible: boolean;
  /** Worlds in this branch's reduced space (exact or capped). */
  covered: number;
  /** Frontier cells the branch still leaves open. */
  open: number;
  /** Why the branch could not be checked, or what invalidates it. */
  note: string;
  /** Assumed cells that by themselves violate public numbers. */
  directViolations: number[];
  /** Assumed cells blamed when the joint assumption set is infeasible. */
  contradiction: number[];
  /** Verdicts common to every assignment satisfying this branch. */
  conclusions: BranchDeduction[];
}
export interface MergeBranchLine {
  id: string;
  name: string;
  /** Worlds in the branch's own case. */
  covered: number;
  total: number;
  /** Verified support: counted toward the merge. */
  agrees: boolean;
  /** Cells where this branch contradicts the merged verdicts. */
  against: number[];
  /** Cases (literal combinations) this branch is compatible with. */
  cases: number;
  /** Contradictory branch whose own case has no public-consistent world. */
  infeasible?: boolean;
}

export interface MergeConclusion {
  status: ProofStatus;
  text: string;
  details: string[];
  /** Only a proven case split is actionable. */
  actionable: boolean;
  cells: Record<number, "safe" | "danger">;
  /** Cells used to split the case space. */
  splitCells: number[];
  /** Total literal combinations the selected assumptions imply. */
  cases: number;
  /** Combinations with at least one public-consistent world. */
  feasibleCases: number;
  /** Feasible combinations no selected branch covers. */
  uncoveredCases: number;
  /** Feasible combinations covered by more than one branch. */
  duplicateCases: number;
  /** Enumerated worlds across all cases. */
  worlds: number;
  branches: MergeBranchLine[];
  /** Human-readable reasons the merge cannot be used. */
  unsafe: string[];
}
export interface Analysis {
  constraints: number;
  /** Unrevealed cells the solver still has no verdict for. */
  unknown: number[];
  base: BaseAnalysis;
  branches: BranchAnalysis[];
  merge: MergeConclusion;
}
export interface Workspace {
  doc: GameDocument;
  notice: string;
}

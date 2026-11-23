import type { PublicBoard } from "../../../shared/types";
import { neighbors } from "../../../shared/geometry";

/**
 * A public clue: among `cells` exactly `remaining` are hazardous.
 * `source` names the revealed number tiles that produced it, for provenance.
 */
export interface Constraint {
  cells: number[];
  remaining: number;
  source: number[];
}

/**
 * Facts the player can see without hypotheses:
 * - `safe`/`danger` come from probe intel and exploded traps.
 * - A real flag is *not* a fact. It only becomes evidence through a probe,
 *   which is recorded in `intel`; unproven flags are kept separately so the
 *   UI can show the difference between a belief and confirmed information.
 */
export interface GroundTruth {
  values: Record<number, "safe" | "danger">;
  unprovenFlags: number[];
  verifiedFlags: number[];
}

export interface ConstraintSet {
  constraints: Constraint[];
  /** Revealed numbers that cannot be satisfied even with zero assumptions. */
  cellIssues: number[];
  /** Unresolved cells untouched by any number. No conclusion is possible. */
  uncovered: number[];
  truth: GroundTruth;
}

export function groundTruth(board: PublicBoard): GroundTruth {
  const values: GroundTruth["values"] = {};
  const unprovenFlags: number[] = [];
  const verifiedFlags: number[] = [];
  for (const c of board.cells) {
    if (c.revealed) {
      // A revealed tile has a definite status: exploded means hazard,
      // otherwise it is safe by definition of the game.
      values[c.id] = c.exploded ? "danger" : "safe";
      if (c.mark === "flag") verifiedFlags.push(c.id);
      continue;
    }
    if (c.intel === "safe" || c.intel === "danger") {
      values[c.id] = c.intel;
      if (c.mark === "flag") verifiedFlags.push(c.id);
    } else if (c.mark === "flag") {
      // A flag nobody verified. Kept as a belief, never as evidence.
      unprovenFlags.push(c.id);
    }
  }
  return { values, unprovenFlags, verifiedFlags };
}

/**
 * Builds the clue set visible to the player. Flags never reduce a number's
 * remaining count: a wrong flag would otherwise silently poison every later
 * proof. Only confirmed intel and exploded traps are subtracted.
 */
export function buildConstraints(board: PublicBoard): ConstraintSet {
  const truth = groundTruth(board);
  const known = new Set<number>();
  const knownMines = new Set<number>();
  for (const [key, value] of Object.entries(truth.values)) {
    known.add(Number(key));
    if (value === "danger") knownMines.add(Number(key));
  }
  const constraints: Constraint[] = [];
  const cellIssues: number[] = [];
  const byKey = new Map<string, Constraint>();
  const covered = new Set<number>();

  for (const c of board.cells) {
    if (c.adjacent === null) continue;
    const around = neighbors(c.id, board.width, board.height);
    const unresolved = around.filter((id) => !known.has(id));
    // Only confirmed mines reduce the count. Confirmed safe neighbours are
    // already excluded from `unresolved` but contribute nothing to `adjacent`.
    const fixedMines = around.filter((id) => knownMines.has(id)).length;
    const remaining = c.adjacent - fixedMines;
    if (remaining < 0 || remaining > unresolved.length) {
      cellIssues.push(c.id);
      continue;
    }
    if (!unresolved.length) continue;
    const key = unresolved.join(",");
    const existing = byKey.get(key);
    if (existing) {
      if (existing.remaining !== remaining) cellIssues.push(c.id);
      else existing.source.push(c.id);
      continue;
    }
    const made: Constraint = { cells: unresolved, remaining, source: [c.id] };
    byKey.set(key, made);
    constraints.push(made);
    for (const id of unresolved) covered.add(id);
  }

  const uncovered: number[] = [];
  for (const c of board.cells)
    if (!c.revealed && !known.has(c.id) && !covered.has(c.id))
      uncovered.push(c.id);

  return { constraints, cellIssues: [...new Set(cellIssues)], uncovered, truth };
}

import type { HypothesisValue } from "../../../shared/types";

/**
 * One "world" is a complete safe/danger assignment to the frontier cells that
 * simultaneously satisfies every public number and a possible global mine
 * count. Worlds are stored as danger bitsets so that branch coverage,
 * intersections and per-cell verdicts are exact set operations instead of
 * duplicated per-branch solves.
 */
export interface WorldSpace {
  /** Frontier cell id for each bit index. */
  cells: number[];
  index: Map<number, number>;
  words: number;
  /** count * words danger bitsets; bit set means "mine". */
  bits: Uint32Array;
  /** Mines inside the frontier, per world. */
  minesPerWorld: Uint8Array;
  count: number;
  /** False when the search hit the cap: counts and verdicts are then incomplete. */
  complete: boolean;
  visited: number;
  /** Allowed number of mines among the frontier cells. */
  mineLo: number;
  mineHi: number;
  /** Cells that no number touches; they never enter a world. */
  offFrontier: number[];
}

export const EMPTY_SPACE: WorldSpace = {
  cells: [],
  index: new Map(),
  words: 1,
  bits: new Uint32Array(1),
  minesPerWorld: new Uint8Array(0),
  count: 0,
  complete: true,
  visited: 0,
  mineLo: 0,
  mineHi: 0,
  offFrontier: [],
};

export interface Clause {
  cells: number[];
  remaining: number;
}

/**
 * Exhaustively assigns every frontier cell, propagating the "exactly N of
 * these are mines" clauses eagerly. No hidden mine data is ever consulted;
 * only the public numbers passed in as clauses and the mine total window.
 *
 * World storage is the reason for the `lfCap` parameter: each world costs
 * `words` 32-bit integers, so a 200k-world cap on a 50-cell frontier would be
 * 320MB. Instead the search keeps recording only while its own memory stays
 * within a fixed budget; hitting it marks the space incomplete, which the UI
 * reports as "待证" rather than guessing.
 */
function storageWords(cap: number, words: number, budgetWords: number) {
  return Math.max(1, Math.min(cap, Math.floor(budgetWords / words)));
}
export function enumerateWorlds(
  cells: number[],
  clauses: Clause[],
  mineLo: number,
  mineHi: number,
  cap: number,
  budgetWords = 8_000_000,
): WorldSpace {
  const n = cells.length;
  const words = Math.max(1, Math.ceil(n / 32));
  const storeCap = storageWords(cap, words, budgetWords);
  const index = new Map<number, number>();
  cells.forEach((id, i) => index.set(id, i));
  const value = new Int8Array(n).fill(-1);
  const total = new Int32Array(clauses.length);
  const unknown = new Int32Array(clauses.length);
  const clausesOf: number[][] = Array.from({ length: n }, () => []);
  const clauseVars = clauses.map((clause, ci) => {
    const ids: number[] = [];
    for (const id of clause.cells) {
      const i = index.get(id);
      if (i === undefined) continue;
      ids.push(i);
      clausesOf[i].push(ci);
    }
    total[ci] = clause.remaining;
    unknown[ci] = ids.length;
    return ids;
  });
  const live = clauses.map((_, i) => i).filter((i) => clauseVars[i].length > 0);

  const bits = new Uint32Array(Math.max(1, storeCap) * words);
  const minesPerWorld = new Uint8Array(Math.max(1, storeCap));
  const current = new Uint32Array(words);
  const trail: number[] = [];
  let count = 0;
  let visited = 0;
  let complete = true;
  let unassigned = n;
  let mines = 0;

  const setBit = (i: number, on: boolean) => {
    const word = i >> 5;
    const mask = 1 << (i & 31);
    if (on) current[word] |= mask;
    else current[word] &= ~mask;
  };
  const assign = (i: number, v: number) => {
    value[i] = v;
    unassigned--;
    if (v === 1) {
      mines++;
      setBit(i, true);
    }
    trail.push(i);
    for (const ci of clausesOf[i]) {
      unknown[ci]--;
      if (v === 1) total[ci]--;
    }
  };
  const release = (i: number) => {
    const v = value[i];
    value[i] = -1;
    unassigned++;
    if (v === 1) {
      mines--;
      setBit(i, false);
    }
    for (const ci of clausesOf[i]) {
      unknown[ci]++;
      if (v === 1) total[ci]++;
    }
  };
  const unwind = (mark: number) => {
    while (trail.length > mark) release(trail.pop()!);
  };
  const propagate = (): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const ci of live) {
        const t = total[ci];
        const u = unknown[ci];
        if (t < 0 || t > u) return false;
        if (u === 0) continue;
        if (t === 0 || t === u) {
          const forced = t === u ? 1 : 0;
          for (const i of clauseVars[ci]) {
            if (value[i] !== -1) continue;
            assign(i, forced);
            changed = true;
          }
        }
      }
      if (mines > mineHi) return false;
      if (mines + unassigned < mineLo) return false;
    }
    return true;
  };
  const search = () => {
    if (!complete) return;
    if (count >= storeCap) {
      complete = false;
      return;
    }
    visited++;
    const mark = trail.length;
    if (!propagate()) {
      unwind(mark);
      return;
    }
    let pick = -1;
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (value[i] !== -1) continue;
      let score = 0;
      for (const ci of clausesOf[i])
        score += 1 + Math.abs(total[ci] * 2 - unknown[ci]);
      if (score > best) {
        best = score;
        pick = i;
      }
    }
    if (pick === -1) {
      if (count >= storeCap) {
        complete = false;
        return;
      }
      bits.set(current, count * words);
      minesPerWorld[count] = mines;
      count++;
      unwind(mark);
      return;
    }
    for (const v of [1, 0] as const) {
      assign(pick, v);
      search();
      release(pick);
      if (!complete) break;
    }
    unwind(mark);
  };

  if (n === 0) {
    return {
      ...EMPTY_SPACE,
      cells,
      index,
      words,
      mineLo,
      mineHi,
      count: mineLo <= 0 && mineHi >= 0 ? 1 : 0,
      bits: new Uint32Array(words),
      minesPerWorld: new Uint8Array(1),
      complete: true,
    };
  }
  search();
  return {
    cells,
    index,
    words,
    bits,
    minesPerWorld,
    count,
    complete,
    visited,
    mineLo,
    mineHi,
    offFrontier: [],
  };
}

export interface FilterResult {
  covered: number;
  /** Bits set here are mines in every covered world. */
  dangerAll: Uint32Array;
  /** Bits set here are mines in at least one covered world. */
  dangerAny: Uint32Array;
  /**
   * Number of covered worlds, keyed by how many mines they place inside the
   * frontier. Off-frontier assumption coverage is decided per bucket, so a
   * branch is not falsely rejected just because a free cell could absorb the
   * remaining mines.
   */
  mineBuckets: Map<number, number>;
  complete: boolean;
}

export type Literals = { cell: number; value: HypothesisValue }[];

/** Extra per-world condition, e.g. whether off-frontier assumptions can be met. */
export type WorldFilter = (world: number, frontierMines: number) => boolean;

/** Counts and summarizes worlds satisfying every literal, in one pass. */
export function filterWorlds(
  space: WorldSpace,
  literals: Literals,
  worldFilter?: WorldFilter,
): FilterResult {
  const dangerAll = new Uint32Array(space.words);
  const dangerAny = new Uint32Array(space.words);
  const checks: { i: number; mine: boolean }[] = [];
  for (const lit of literals) {
    const i = space.index.get(lit.cell);
    if (i === undefined) continue;
    checks.push({ i, mine: lit.value === "danger" });
  }
  const mineBuckets = new Map<number, number>();
  let covered = 0;
  let first = true;
  for (let w = 0; w < space.count; w++) {
    const offset = w * space.words;
    let ok = true;
    for (const c of checks) {
      const isMine = (space.bits[offset + (c.i >> 5)] & (1 << (c.i & 31))) !== 0;
      if (isMine !== c.mine) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const mines = space.minesPerWorld[w];
    if (worldFilter && !worldFilter(w, mines)) continue;
    for (let word = 0; word < space.words; word++) {
      const value = space.bits[offset + word];
      dangerAny[word] |= value;
      dangerAll[word] = first ? value : dangerAll[word] & value;
    }
    first = false;
    covered++;
    mineBuckets.set(mines, (mineBuckets.get(mines) ?? 0) + 1);
  }
  return { covered, dangerAll, dangerAny, mineBuckets, complete: space.complete };
}

/**
 * Boolean mask over worlds: true where the literals hold and the optional
 * filter admits the world. Used to compute union coverage and duplicate
 * coverage exactly for branch merges.
 */
export function worldMask(
  space: WorldSpace,
  literals: Literals,
  worldFilter?: WorldFilter,
): Uint8Array {
  const mask = new Uint8Array(space.count);
  const checks: { i: number; mine: boolean }[] = [];
  for (const lit of literals) {
    const i = space.index.get(lit.cell);
    if (i === undefined) continue;
    checks.push({ i, mine: lit.value === "danger" });
  }
  for (let w = 0; w < space.count; w++) {
    let ok = true;
    for (const c of checks) {
      const isMine =
        (space.bits[w * space.words + (c.i >> 5)] & (1 << (c.i & 31))) !== 0;
      if (isMine !== c.mine) {
        ok = false;
        break;
      }
    }
    if (ok && worldFilter && !worldFilter(w, space.minesPerWorld[w])) ok = false;
    mask[w] = ok ? 1 : 0;
  }
  return mask;
}

/**
 * Case-split enumeration.
 *
 * Given a set of "split" cells and the branch assumptions, this enumerates the
 * worlds for every literal combination of the split cells, using the *same*
 * public clauses each time. Enumerating each case against all clauses means:
 * - each case's worlds are exact (no dropped constraints),
 * - impossible cases naturally yield zero worlds and are reported as such,
 * - the cases partition the original world space, so if every non-empty case
 *   proves a verdict, that verdict holds for the whole space.
 *
 * The player's selected branches are expected to be exactly these cases; the
 * merge checks that rather than trusting it.
 */
export interface CaseSplit {
  /** Values assigned to the split cells in this case. */
  literals: Literals;
  space: WorldSpace;
}

export function enumerateCases(
  frontier: number[],
  clauses: Clause[],
  splitCells: number[],
  mineLo: number,
  mineHi: number,
  cap: number,
): CaseSplit[] {
  const usable = splitCells.filter((id) => frontier.includes(id));
  if (!usable.length) {
    return [
      {
        literals: [],
        space: enumerateWorlds(frontier, clauses, mineLo, mineHi, cap),
      },
    ];
  }
  const free = frontier.filter((id) => !usable.includes(id));
  const cases: CaseSplit[] = [];
  const combinations = 1 << usable.length;
  for (let mask = 0; mask < combinations; mask++) {
    const literals: Literals = usable.map((cell, bit) => ({
      cell,
      value: (mask & (1 << bit)) !== 0 ? "danger" : "safe",
    }));
    const fixed = new Map(literals.map((l) => [l.cell, l.value === "danger"]));
    const fixedMines = literals.filter((l) => l.value === "danger").length;
    // Clauses reduced by the fixed cells. Clauses with no free cells must be
    // satisfied exactly, otherwise the case is impossible.
    const reduced: Clause[] = [];
    let impossible = false;
    for (const clause of clauses) {
      let remaining = clause.remaining;
      const cells: number[] = [];
      for (const id of clause.cells) {
        if (fixed.has(id)) {
          if (fixed.get(id)) remaining--;
        } else cells.push(id);
      }
      if (remaining < 0 || remaining > cells.length) {
        impossible = true;
        break;
      }
      if (cells.length) reduced.push({ cells, remaining });
    }
    const lo = Math.max(0, mineLo - fixedMines);
    const hi = Math.max(0, mineHi - fixedMines);
    if (impossible || lo > hi) {
      cases.push({ literals, space: { ...EMPTY_SPACE, mineLo: lo, mineHi: hi } });
      continue;
    }
    const space = enumerateWorlds(free, reduced, lo, hi, cap);
    cases.push({ literals, space });
  }
  return cases;
}

export function bitSet(word: number, i: number) {
  return (word & (1 << (i & 31))) !== 0;
}

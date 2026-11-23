import type {
  Analysis,
  BaseAnalysis,
  BranchAnalysis,
  BranchDeduction,
  MergeBranchLine,
  MergeConclusion,
  ProofStatus,
  PublicBoard,
} from "../../../shared/types";
import { DIRECT_BRANCH, MAX_CASES, MAX_WORLDS } from "../../../shared/constants";
import { buildConstraints, type ConstraintSet } from "./constraints";
import {
  enumerateCases,
  enumerateWorlds,
  filterWorlds,
  type Clause,
  type Literals,
  type WorldSpace,
} from "./enumerate";

export interface BranchInput {
  id: string;
  name: string;
  active: boolean;
  assumptions: Record<string, "safe" | "danger">;
}

export interface AnalysisInput {
  branches: BranchInput[];
  /** Branch ids chosen for merging; DIRECT_BRANCH means the no-assumption line. */
  merge: string[];
}

export function coordinateOf(board: PublicBoard, id: number) {
  const x = id % board.width;
  const y = Math.floor(id / board.width);
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

interface Problem {
  board: PublicBoard;
  set: ConstraintSet;
  frontier: number[];
  /** Frontier cells no public number touches: they can never be concluded. */
  free: number[];
  clauses: Clause[];
  mineLo: number;
  mineHi: number;
  knownMines: number;
}

/**
 * Re-derives everything from the public board on every call. A newly revealed
 * number therefore immediately re-checks every branch and merge; nothing is
 * cached between turns, and the hidden mine layout is never read.
 */
export function analyze(board: PublicBoard, input: AnalysisInput): Analysis {
  const set = buildConstraints(board);
  const problem = buildProblem(board, set);
  const base = baseSummary(problem);
  const branches = input.branches.map((b) => analyzeBranch(problem, b));
  const merge = mergeAnalysis(problem, input, branches);
  const touched = new Set<number>([
    ...Object.keys(set.truth.values).map(Number),
    ...problem.frontier,
  ]);
  const unknown: number[] = [];
  for (const c of board.cells)
    if (!c.revealed && !touched.has(c.id)) unknown.push(c.id);
  return { constraints: set.constraints.length, unknown, base, branches, merge };
}

function buildProblem(board: PublicBoard, set: ConstraintSet): Problem {
  const empty: Problem = {
    board,
    set,
    frontier: [],
    free: [],
    clauses: [],
    mineLo: 0,
    mineHi: 0,
    knownMines: 0,
  };
  if (set.cellIssues.length || !set.constraints.length) return empty;
  const frontier = [...new Set(set.constraints.flatMap((c) => c.cells))].sort(
    (a, b) => a - b,
  );
  const knownMines = Object.values(set.truth.values).filter(
    (v) => v === "danger",
  ).length;
  const free = set.uncovered.filter((id) => !board.cells[id]?.revealed);
  const outside = free.length;
  return {
    board,
    set,
    frontier,
    free,
    clauses: set.constraints.map((c) => ({
      cells: c.cells,
      remaining: c.remaining,
    })),
    mineLo: Math.max(0, board.mines - knownMines - outside),
    mineHi: Math.max(0, board.mines - knownMines),
    knownMines,
  };
}

function deductionsFrom(
  space: WorldSpace,
  frontier: number[],
  board: PublicBoard,
  reasons: number[],
): BranchDeduction[] {
  if (!space.complete || space.count === 0) return [];
  const result = filterWorlds(space, []);
  const out: BranchDeduction[] = [];
  for (const id of frontier) {
    if (board.cells[id].revealed) continue;
    const i = space.index.get(id);
    if (i === undefined) continue;
    const alwaysMine = (result.dangerAll[i >> 5] & (1 << (i & 31))) !== 0;
    const everMine = (result.dangerAny[i >> 5] & (1 << (i & 31))) !== 0;
    if (alwaysMine)
      out.push({
        cell: id,
        kind: "danger",
        reasons: [id, ...reasons],
        text: "在该情形覆盖的全部布局中都是危险。",
      });
    else if (!everMine)
      out.push({
        cell: id,
        kind: "safe",
        reasons: [id, ...reasons],
        text: "在该情形覆盖的全部布局中都是安全。",
      });
  }
  return out;
}

function baseSummary(problem: Problem): BaseAnalysis {
  const { set, frontier, clauses, mineLo, mineHi, board } = problem;
  if (set.cellIssues.length)
    return {
      worlds: 0,
      feasible: false,
      status: "conflict",
      note: "已有数字与探针信息互相矛盾，需要先修正。",
      conclusions: [],
    };
  if (!frontier.length)
    return {
      worlds: 0,
      feasible: true,
      status: "ready",
      note: "还没有可用的数字边界，暂无可枚举的联合布局。",
      conclusions: [],
    };
  const space = enumerateWorlds(
    frontier,
    clauses,
    mineLo,
    mineHi,
    MAX_WORLDS,
  );
  if (space.count === 0)
    return {
      worlds: 0,
      feasible: false,
      status: "conflict",
      note: "公开数字没有任何可行布局，请核对探针信息与已揭数字。",
      conclusions: [],
    };
  const conclusions = deductionsFrom(space, frontier, board, []);
  return {
    worlds: space.count,
    feasible: true,
    status: !space.complete
      ? "pending"
      : conclusions.length
        ? "proven"
        : "ready",
    note: space.complete
      ? `已枚举 ${space.count} 种符合公开数字的完整布局。`
      : "布局数量超过枚举上限，未算完的结论一律待证；可改用假设分支拆分。",
    conclusions,
  };
}

function blankBranch(
  base: { id: string; name: string; active: boolean },
  status: ProofStatus,
  covered: number,
  open: number,
  extra: Partial<BranchAnalysis>,
): BranchAnalysis {
  return {
    ...base,
    empty: false,
    status,
    feasible: status === "ready" || status === "empty",
    covered,
    open,
    note: "",
    directViolations: [],
    contradiction: [],
    conclusions: [],
    ...extra,
  };
}

/**
 * A branch fixes some cells. Its "own scenario" is the exact set of worlds
 * consistent with the public numbers and those fixed cells. Enumerating it
 * from the full clause set (not from leftover cells) keeps every premise
 * shared: no branch carries a private, possibly stale, copy of the puzzle.
 */
function analyzeBranch(problem: Problem, branch: BranchInput): BranchAnalysis {
  const { board, set, frontier, clauses } = problem;
  const declared = Object.entries(branch.assumptions).map(([key, value]) => ({
    cell: Number(key),
    value,
  }));
  const live = declared.filter(
    (a) =>
      board.cells[a.cell] &&
      !board.cells[a.cell].revealed &&
      board.cells[a.cell].intel === "unknown",
  );
  const empty = live.length === 0;
  const base = { id: branch.id, name: branch.name, active: branch.active };

  if (set.cellIssues.length)
    return blankBranch(base, "conflict", 0, frontier.length, {
      note: "公开数字本身矛盾，任何分支都无法验证。",
    });
  if (!set.constraints.length)
    return blankBranch(base, "empty", 0, 0, {
      empty,
      note: empty
        ? "空分支没有假设，不提供独立支持。"
        : "当前没有可用的数字边界：这些假设无法与公开信息核对，不构成证据。",
    });
  if (empty)
    return blankBranch(base, "empty", 0, frontier.length, {
      empty: true,
      note: declared.length
        ? "这些假设已被探索或探针确认为真实信息，分支没有剩余内容，不构成独立支持。"
        : "空分支没有假设，不提供独立支持，不能参与合并。",
    });

  // Assumptions on cells no number touches cannot be checked. They are not
  // evidence, but they also don't make a branch wrong; report it honestly.
  const assumedFrontier = live.filter((a) => frontier.includes(a.cell));
  const assumedFree = live.filter((a) => !frontier.includes(a.cell));
  if (!assumedFrontier.length)
    return blankBranch(base, "empty", 0, frontier.length, {
      empty: true,
      note: "假设落在没有数字约束的格子上，无法与公开信息核对，不构成证据。",
    });

  const fixed = new Map(
    assumedFrontier.map((a) => [a.cell, a.value === "danger"] as const),
  );
  const fixedMines = assumedFrontier.filter((a) => a.value === "danger").length;
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
  // Mines are distributed among: known mines (already subtracted into
  // `knownMines`), assumed-frontier danger, assumed-free danger, unassumed
  // free cells (0..their count) and the remaining free frontier cells.
  const offDanger = assumedFree.filter((a) => a.value === "danger").length;
  const otherFree = Math.max(0, problem.free.length - assumedFree.length);
  const hiFrontier = board.mines - problem.knownMines - offDanger;
  const loFrontier = Math.max(0, hiFrontier - otherFree);
  const lo = Math.max(0, loFrontier - fixedMines);
  const hi = hiFrontier - fixedMines;
  const freeFrontier = frontier.filter((id) => !fixed.has(id));

  if (impossible || lo > hi)
    return contradictionBranch(problem, base, live, assumedFrontier);

  const space = enumerateWorlds(
    freeFrontier,
    reduced,
    lo,
    hi,
    MAX_WORLDS,
  );
  if (space.count === 0)
    return contradictionBranch(problem, base, live, assumedFrontier);

  const conclusions = deductionsFrom(
    space,
    frontier,
    board,
    assumedFrontier.map((a) => a.cell),
  ).filter((d) => !assumedFrontier.some((a) => a.cell === d.cell));

  return {
    ...base,
    empty: false,
    // A capped enumeration proves nothing globally: it has only seen part of
    // the branch's own case, so it must stay pending and cannot vote.
    status: space.complete ? "ready" : "pending",
    feasible: true,
    covered: space.count,
    open: freeFrontier.length,
    note: space.complete
      ? `该情形下还有 ${space.count} 种符合公开数字的布局。`
      : "该情形布局数超过上限，只显示已确认的结论，其余待证。",
    directViolations: [],
    contradiction: [],
    conclusions,
  };
}

function contradictionBranch(
  problem: Problem,
  base: { id: string; name: string; active: boolean },
  live: { cell: number; value: "safe" | "danger" }[],
  assumedFrontier: { cell: number; value: "safe" | "danger" }[],
): BranchAnalysis {
  const soloBad: number[] = [];
  for (const a of assumedFrontier) {
    const alone = analyzeSingleAssumption(problem, a);
    if (!alone) soloBad.push(a.cell);
  }
  const reason = soloBad.length
    ? `假设与公开数字直接冲突：${soloBad
        .map((id) => coordinateOf(problem.board, id))
        .join("、")} 单独就不可能成立。`
    : "这组假设合在一起排除全部布局：没有任何符合公开数字的布局同时满足它们。";
  return blankBranch(base, "contradiction", 0, problem.frontier.length, {
    note: reason,
    directViolations: soloBad,
    contradiction: soloBad.length ? soloBad : live.map((l) => l.cell),
  });
}

function analyzeSingleAssumption(
  problem: Problem,
  a: { cell: number; value: "safe" | "danger" },
): boolean {
  const { frontier, clauses } = problem;
  if (!frontier.includes(a.cell)) return true;
  const fixed = new Map([[a.cell, a.value === "danger"]]);
  const reduced: Clause[] = [];
  for (const clause of clauses) {
    let remaining = clause.remaining;
    const cells: number[] = [];
    for (const id of clause.cells) {
      if (fixed.has(id)) {
        if (fixed.get(id)) remaining--;
      } else cells.push(id);
    }
    if (remaining < 0 || remaining > cells.length) return false;
    if (cells.length) reduced.push({ cells, remaining });
  }
  const fixedMines = a.value === "danger" ? 1 : 0;
  const hiFrontier = problem.board.mines - problem.knownMines;
  const loFrontier = Math.max(0, hiFrontier - problem.free.length);
  const lo = Math.max(0, loFrontier - fixedMines);
  const hi = hiFrontier - fixedMines;
  if (lo > hi) return false;
  const space = enumerateWorlds(
    frontier.filter((id) => id !== a.cell),
    reduced,
    lo,
    hi,
    MAX_WORLDS,
  );
  // Only blame the cell when the check was exhaustive; a capped search cannot
  // prove the assumption impossible.
  if (!space.complete) return true;
  return space.count > 0;
}

/**
 * Merge by case split.
 *
 * The selected branches are treated as one combined hypothesis: the cells they
 * fix are the split. The merge then asks the solver to enumerate *every*
 * literal combination of those cells (not just the combinations the player
 * happened to create). For each combination that admits at least one public-
 * consistent world, a selected branch must cover it. A verdict is merged only
 * when every such combination's worlds agree on it. That is the coverage
 * proof: a missing case shows up as an uncovered feasible case, and a
 * contradictory branch shows up as an impossible case claimed by a branch.
 */
function mergeAnalysis(
  problem: Problem,
  input: AnalysisInput,
  branches: BranchAnalysis[],
): MergeConclusion {
  const { board, set, frontier, clauses, mineLo, mineHi } = problem;
  const selected = [...new Set(input.merge)].filter(
    (id) => id === DIRECT_BRANCH || branches.some((b) => b.id === id),
  );
  const unsafe: string[] = [];
  const details: string[] = [];
  const empty = (status: ProofStatus, text: string): MergeConclusion => ({
    status,
    text,
    details,
    actionable: false,
    cells: {},
    splitCells: [],
    cases: 0,
    feasibleCases: 0,
    uncoveredCases: 0,
    duplicateCases: 0,
    worlds: 0,
    branches: [],
    unsafe,
  });

  if (!selected.length) unsafe.push("尚未选择任何分支用于合并。");
  if (set.cellIssues.length) unsafe.push("公开数字本身矛盾，任何合并结论都不可靠。");
  if (!frontier.length) {
    unsafe.push("还没有可用的数字边界，无法进行合并证明。");
    return empty("ready", "选择一个或多个有假设的分支后才能合并。");
  }

  // Fixed cells per selected branch. A branch that the solver proved
  // contradictory may still be a legitimate *case label*: if its assumed
  // combination is infeasible, the case simply has no worlds and every other
  // branch covering all feasible cases is still a complete proof. Such a
  // branch is never counted as support; it just contributes its case.
  interface Voting {
    input: BranchInput;
    analysis: BranchAnalysis;
    fixed: Map<number, boolean>;
    /** Verified with worlds: may be counted as support. */
    support: boolean;
    /** Assumption itself is impossible under the public numbers. */
    infeasible: boolean;
  }
  const voting: Voting[] = [];
  for (const id of selected) {
    if (id === DIRECT_BRANCH) continue;
    const branchInput = input.branches.find((b) => b.id === id);
    const analysis = branches.find((b) => b.id === id);
    if (!branchInput || !analysis) continue;
    if (analysis.status === "empty") continue;
    if (analysis.status !== "ready" && analysis.status !== "contradiction")
      continue;
    const fixed = new Map<number, boolean>();
    for (const [key, value] of Object.entries(branchInput.assumptions)) {
      const cell = Number(key);
      if (!frontier.includes(cell)) continue;
      if (board.cells[cell]?.revealed) continue;
      if (board.cells[cell]?.intel !== "unknown") continue;
      fixed.set(cell, value === "danger");
    }
    voting.push({
      input: branchInput,
      analysis,
      fixed,
      support: analysis.status === "ready",
      infeasible: analysis.status === "contradiction",
    });
  }
  const directSelected = selected.includes(DIRECT_BRANCH);
  if (!voting.some((v) => v.support) && !directSelected) {
    unsafe.push(
      "所选分支中没有已验证且有假设的分支，不能作为合并支持（空分支、矛盾分支或未算完的分支不计入）。",
    );
    return empty("ready", "选择一个或多个有假设、且已核验的分支后才能合并。");
  }

  const splitCells = [...new Set(voting.flatMap((v) => [...v.fixed.keys()]))].sort(
    (a, b) => a - b,
  );
  const extraBranches = Math.max(0, splitCells.length - 8);
  if (splitCells.length > 8)
    unsafe.push(
      `合并涉及 ${splitCells.length} 个假设格，超出一次可证明的范围；请减少假设（多出 ${extraBranches} 格）。`,
    );

  const lines: MergeBranchLine[] = selected.map((id) => {
    if (id === DIRECT_BRANCH)
      return {
        id,
        name: "直接推断",
        covered: 0,
        total: 0,
        agrees: true,
        against: [],
        cases: 1,
      };
    const a = branches.find((b) => b.id === id)!;
    const v = voting.find((x) => x.input.id === id);
    return {
      id,
      name: a.name,
      covered: a.covered,
      total: a.covered,
      // A contradictory branch is only acceptable as an empty-case label; it
      // never counts as support. Empty/pending branches cannot speak at all.
      agrees: a.status === "ready",
      against: [],
      cases: 1,
      infeasible: v?.infeasible ?? false,
    };
  });
  // Invalid support means: selected, not the direct line, and not verified.
  // A contradictory branch is only a problem if its case has worlds (checked
  // below); the line itself is marked so the UI can explain it.
  const invalid = lines.filter(
    (l) => l.id !== DIRECT_BRANCH && !l.agrees && !l.infeasible,
  );
  for (const l of invalid) {
    const a = branches.find((b) => b.id === l.id);
    unsafe.push(
      a?.status === "pending"
        ? `分支「${l.name}」的布局未算完，暂不能作为支持。`
        : `分支「${l.name}」不是已验证的支持（状态：${
            a?.status === "empty" ? "空分支" : a?.status === "conflict" ? "数字矛盾" : "无法验证"
          }）。`,
    );
  }

  if (splitCells.length > MAX_CASES || splitCells.length > 8) {
    if (!unsafe.length) unsafe.push("假设格过多，无法逐一枚举所有情形。");
    return finish({
      status: "pending",
      text: unsafe[0],
      actionable: false,
      cells: {},
      splitCells,
      cases: 0,
      feasibleCases: 0,
      uncoveredCases: 0,
      duplicateCases: 0,
      worlds: 0,
      lines,
    }, details, unsafe);
  }

  // Enumerate every literal combination of the split cells.
  const cases = enumerateCases(
    frontier,
    clauses,
    splitCells,
    mineLo,
    mineHi,
    MAX_WORLDS,
  );
  const feasible = cases.filter((c) => c.space.count > 0);

  // Which branch(es) claim each case? A branch claims a case when every split
  // cell it fixes matches the case's literal. A contradictory branch claims
  // its own case too; that case is expected to have no worlds, and if it ever
  // does, the contradiction was an error rather than a valid support.
  const claimed = new Map<string, string[]>();
  const keyOf = (literals: Literals) =>
    literals
      .map((l) => `${l.cell}${l.value === "danger" ? "D" : "S"}`)
      .sort()
      .join("|");
  const caseOfBranch = (v: Voting, c: (typeof cases)[number]) => {
    for (const [cell, mine] of v.fixed) {
      const literal = c.literals.find((l) => l.cell === cell);
      if (!literal) continue;
      if ((literal.value === "danger") !== mine) return false;
    }
    return true;
  };
  for (const v of voting) {
    for (const c of feasible) {
      if (!caseOfBranch(v, c)) continue;
      const key = keyOf(c.literals);
      const list = claimed.get(key) ?? [];
      list.push(v.input.id);
      claimed.set(key, list);
    }
  }
  // The direct line fixes nothing, so it covers every feasible case.
  if (directSelected)
    for (const c of feasible) {
      const key = keyOf(c.literals);
      const list = claimed.get(key) ?? [];
      list.push(DIRECT_BRANCH);
      claimed.set(key, list);
    }

  // A contradictory branch must correspond to a genuinely infeasible case.
  // If a world exists for its assumed combination, the solver and the branch
  // disagree: that is a hard conflict, and it blocks the merge.
  for (const v of voting) {
    if (!v.infeasible) continue;
    const matching = cases.filter((c) => caseOfBranch(v, c));
    if (matching.some((c) => c.space.count > 0))
      unsafe.push(
        `分支「${v.input.name}」被判为矛盾，但它的假设组合仍有可行布局，结论不可信。`,
      );
  }

  let uncovered = 0;
  let duplicates = 0;
  for (const c of feasible) {
    const list = claimed.get(keyOf(c.literals)) ?? [];
    if (!list.length) uncovered++;
    if (list.length > 1) duplicates += list.length - 1;
  }
  if (uncovered)
    unsafe.push(
      `${feasible.length} 个可行情形中有 ${uncovered} 个没有任何所选分支覆盖，合并无法证明全部情况。`,
    );
  if (duplicates)
    details.push(`${duplicates} 个情形被多个分支重复覆盖（已按并集去重计入）。`);

  // Enumerated completeness: if any feasible case hit the cap, stay pending.
  const pendingEnumeration = feasible.some((c) => !c.space.complete);
  if (pendingEnumeration) unsafe.push("部分情形的布局未枚举完，结论保持待证。");

  // Verdicts: a cell must be the same in every feasible case that is covered.
  const totalWorlds = feasible.reduce((sum, c) => sum + c.space.count, 0);
  const covered = feasible.filter(
    (c) => (claimed.get(keyOf(c.literals)) ?? []).length > 0,
  );
  const tally = new Map<number, { safe: number; danger: number }>();
  for (const c of covered) {
    const deductions = deductionsFrom(
      c.space,
      frontier,
      board,
      c.literals.map((l) => l.cell),
    );
    const seen = new Map<number, "safe" | "danger">();
    for (const d of deductions) seen.set(d.cell, d.kind);
    for (const [cell, kind] of seen) {
      const entry = tally.get(cell) ?? { safe: 0, danger: 0 };
      entry[kind]++;
      tally.set(cell, entry);
    }
  }
  const cells: Record<number, "safe" | "danger"> = {};
  const conflicting: number[] = [];
  for (const [cell, entry] of tally) {
    if (entry.safe === covered.length && entry.safe > 0) cells[cell] = "safe";
    else if (entry.danger === covered.length && entry.danger > 0)
      cells[cell] = "danger";
    else if (entry.safe > 0 && entry.danger > 0) conflicting.push(cell);
  }
  // Opposite verdicts across branches are expected when branches genuinely
  // explore different cases; those cells simply do not become merged facts.
  // They are surfaced as a note, not treated as a proof failure.

  // Each voting branch must agree with the merged verdicts on cells it judges.
  for (const v of voting) {
    const line = lines.find((l) => l.id === v.input.id)!;
    const seen = new Map<number, "safe" | "danger">();
    for (const d of v.analysis.conclusions) seen.set(d.cell, d.kind);
    const against: number[] = [];
    for (const [cell, kind] of Object.entries(cells) as [
      string,
      "safe" | "danger",
    ][]) {
      const own = seen.get(Number(cell));
      if (own && own !== kind) against.push(Number(cell));
    }
    line.against = against;
    if (against.length) {
      line.agrees = false;
      unsafe.push(
        `分支「${v.input.name}」与合并结论在 ${against
          .map((id) => coordinateOf(board, id))
          .join("、")} 上相反。`,
      );
    }
  }

  const conclusive = Object.keys(cells).length > 0;
  const proven =
    !unsafe.length &&
    uncovered === 0 &&
    !pendingEnumeration &&
    covered.length === feasible.length &&
    feasible.length > 0 &&
    conclusive;
  if (!proven && !unsafe.length)
    unsafe.push("所有情形均已覆盖，但没有一条对所有分支都相同的结论。");

  if (proven) {
    details.unshift(
      `公开数字与假设共划分出 ${cases.length} 个情形，其中 ${feasible.length} 个可行，已全部枚举（共 ${totalWorlds} 种布局，非估计）。`,
    );
    details.push(
      `所选分支覆盖全部 ${feasible.length} 个可行情形；重复覆盖 ${duplicates} 个，遗漏 ${uncovered} 个。`,
    );
    if (conflicting.length)
      details.push(
        `有 ${conflicting.length} 格在不同情形下结论不同（${conflicting
          .map((id) => coordinateOf(board, id))
          .join("、")}），已从合并事实中排除。`,
      );
    details.push("每个可行情形都得到同一组结论，因此可提交。");
  }

  const hasPendingVoter = invalid.some(
    (l) => branches.find((b) => b.id === l.id)?.status === "pending",
  );
  const hasContradiction = invalid.some(
    (l) => branches.find((b) => b.id === l.id)?.status === "contradiction",
  );
  const status: ProofStatus = set.cellIssues.length
    ? "conflict"
    : pendingEnumeration || hasPendingVoter
      ? "pending"
      : proven
        ? "proven"
        : hasContradiction
          ? "contradiction"
          : "pending";
  return finish({
    status,
    text: proven
      ? `已验证：${feasible.length} 个可行情形、${totalWorlds} 种布局全部支持 ${Object.keys(cells).length} 条结论。`
      : status === "conflict"
        ? "公开数字互相矛盾，先核对探针信息与已揭数字。"
        : (unsafe[0] ?? "合并尚未完成，结论保持待证。"),
    actionable: proven,
    cells: proven ? cells : {},
    splitCells,
    cases: cases.length,
    feasibleCases: feasible.length,
    uncoveredCases: uncovered,
    duplicateCases: duplicates,
    worlds: totalWorlds,
    lines,
  }, details, unsafe);
}

function finish(
  partial: {
    status: ProofStatus;
    text: string;
    actionable: boolean;
    cells: Record<number, "safe" | "danger">;
    splitCells: number[];
    cases: number;
    feasibleCases: number;
    uncoveredCases: number;
    duplicateCases: number;
    worlds: number;
    lines: MergeBranchLine[];
  },
  details: string[],
  unsafe: string[],
): MergeConclusion {
  return {
    status: partial.status,
    text: partial.text,
    details,
    actionable: partial.actionable,
    cells: partial.cells,
    splitCells: partial.splitCells,
    cases: partial.cases,
    feasibleCases: partial.feasibleCases,
    uncoveredCases: partial.uncoveredCases,
    duplicateCases: partial.duplicateCases,
    worlds: partial.worlds,
    branches: partial.lines,
    unsafe,
  };
}

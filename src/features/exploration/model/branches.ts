import type {
  Expedition,
  HypothesisBranch,
  HypothesisValue,
} from "../../../shared/types";
import { coordinate } from "../../../shared/geometry";
import { logAction } from "../../../shared/initial";
import { DIRECT_BRANCH, MAX_BRANCHES } from "../../../shared/constants";
import { mayAct } from "./expedition";

export { DIRECT_BRANCH };

export function activeBranch(e: Expedition): HypothesisBranch | null {
  const h = e.hypotheses;
  if (!h.active) return null;
  return h.branches.find((b) => b.id === h.active) ?? null;
}

export function branchById(e: Expedition, id: string) {
  return e.hypotheses.branches.find((b) => b.id === id) ?? null;
}

/**
 * Drops assumptions that a real discovery has since answered. Shrinking a
 * branch never touches tools, findings, or other branches.
 */
export function pruneHypotheses(e: Expedition): Expedition {
  let changed = false;
  const branches = e.hypotheses.branches.map((b) => {
    const kept: Record<string, HypothesisValue> = {};
    let removed = false;
    for (const [key, value] of Object.entries(b.assumptions)) {
      const c = e.board.cells[Number(key)];
      if (!c || c.revealed || c.intel !== "unknown") {
        removed = true;
        continue;
      }
      kept[key] = value;
    }
    if (!removed) return b;
    changed = true;
    return { ...b, assumptions: kept, updatedAt: Date.now() };
  });
  return changed ? { ...e, hypotheses: { ...e.hypotheses, branches } } : e;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function replaceBranch(
  e: Expedition,
  id: string,
  update: (b: HypothesisBranch) => HypothesisBranch,
): Expedition {
  return {
    ...e,
    hypotheses: {
      ...e.hypotheses,
      branches: e.hypotheses.branches.map((b) =>
        b.id === id ? update(b) : b,
      ),
    },
  };
}

export function createBranch(
  e: Expedition,
  name?: string,
): { expedition: Expedition; id: string } {
  if (!mayAct(e) || e.hypotheses.branches.length >= MAX_BRANCHES)
    return { expedition: e, id: "" };
  const id = newId();
  const now = Date.now();
  const branch: HypothesisBranch = {
    id,
    name:
      name?.trim().slice(0, 24) ||
      `假设 ${String.fromCharCode(65 + e.hypotheses.branches.length)}`,
    assumptions: {},
    createdAt: now,
    updatedAt: now,
  };
  return {
    id,
    expedition: {
      ...e,
      mode: "assume",
      hypotheses: {
        ...e.hypotheses,
        branches: [...e.hypotheses.branches, branch],
        active: id,
        // A new branch is not auto-merged: merging is an explicit claim.
        merge: e.hypotheses.merge,
      },
    },
  };
}

/** Renaming is purely cosmetic: assumptions, tools and findings are untouched. */
export function renameBranch(e: Expedition, id: string, name: string): Expedition {
  const label = name.trim().slice(0, 24);
  if (!label) return e;
  const branch = branchById(e, id);
  if (!branch || branch.name === label) return e;
  return replaceBranch(e, id, (b) => ({ ...b, name: label }));
}

export function selectBranch(e: Expedition, id: string | null): Expedition {
  if (!mayAct(e)) return e;
  if (id !== null && !branchById(e, id)) return e;
  const next: Expedition = {
    ...e,
    mode: id ? "assume" : "reveal",
    hypotheses: { ...e.hypotheses, active: id },
  };
  const branch = id ? branchById(e, id) : null;
  return logAction(
    next,
    "assume",
    null,
    branch
      ? `切换到假设分支「${branch.name}」。假设不会揭开真实石板，也不会消耗道具。`
      : "回到直接推断，真实旗标与已探明信息保持不变。",
  );
}

export function deleteBranch(e: Expedition, id: string): Expedition {
  if (!branchById(e, id)) return e;
  return {
    ...e,
    mode: e.hypotheses.active === id ? "reveal" : e.mode,
    hypotheses: {
      ...e.hypotheses,
      branches: e.hypotheses.branches.filter((b) => b.id !== id),
      active: e.hypotheses.active === id ? null : e.hypotheses.active,
      merge: e.hypotheses.merge.filter((m) => m !== id),
    },
  };
}

/** Adds or flips one assumption without revealing anything on the board. */
export function setAssumption(
  e: Expedition,
  branchId: string,
  cell: number,
  value: HypothesisValue,
): Expedition {
  const target = e.board.cells[cell];
  if (!mayAct(e) || !branchById(e, branchId)) return e;
  if (!target || target.revealed || target.intel !== "unknown") return e;
  const next = replaceBranch(e, branchId, (b) => ({
    ...b,
    assumptions: { ...b.assumptions, [String(cell)]: value },
    updatedAt: Date.now(),
  }));
  return {
    ...next,
    mode: "assume",
    hypotheses: { ...next.hypotheses, active: branchId },
  };
}

export function clearAssumption(
  e: Expedition,
  branchId: string,
  cell: number,
): Expedition {
  if (!mayAct(e) || !branchById(e, branchId)) return e;
  return replaceBranch(e, branchId, (b) => {
    if (!(String(cell) in b.assumptions)) return b;
    const assumptions = { ...b.assumptions };
    delete assumptions[String(cell)];
    return { ...b, assumptions, updatedAt: Date.now() };
  });
}

/** Used by the "split" helper: replaces a branch's whole assumption map. */
export function setAssumptions(
  e: Expedition,
  branchId: string,
  assumptions: Record<string, HypothesisValue>,
): Expedition {
  if (!mayAct(e) || !branchById(e, branchId)) return e;
  const clean: Record<string, HypothesisValue> = {};
  for (const [key, value] of Object.entries(assumptions)) {
    const c = e.board.cells[Number(key)];
    if (!c || c.revealed || c.intel !== "unknown") continue;
    clean[key] = value;
  }
  return replaceBranch(e, branchId, (b) => ({
    ...b,
    assumptions: clean,
    updatedAt: Date.now(),
  }));
}

export function toggleMerge(e: Expedition, id: string): Expedition {
  if (id !== DIRECT_BRANCH && !branchById(e, id)) return e;
  const set = new Set(e.hypotheses.merge);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return { ...e, hypotheses: { ...e.hypotheses, merge: [...set] } };
}

export function setMerge(e: Expedition, ids: string[]): Expedition {
  const valid = ids.filter(
    (id) => id === DIRECT_BRANCH || !!branchById(e, id),
  );
  return {
    ...e,
    hypotheses: { ...e.hypotheses, merge: [...new Set(valid)] },
  };
}

export function toggleAssumption(e: Expedition, cell: number): Expedition {
  const branch = activeBranch(e);
  if (!branch) return e;
  const current = branch.assumptions[String(cell)];
  if (current === undefined)
    return setAssumption(e, branch.id, cell, "danger");
  if (current === "danger")
    return setAssumption(e, branch.id, cell, "safe");
  return clearAssumption(e, branch.id, cell);
}

export function describeAssumption(e: Expedition, id: number) {
  const branch = activeBranch(e);
  const value = branch?.assumptions[String(id)];
  return value ? `${coordinate(id, e.board.width)} 设为${value === "danger" ? "危险" : "安全"}` : "";
}

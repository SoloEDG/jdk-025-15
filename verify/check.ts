// Verification harness for the hypothesis-branch proof model.
// Run: npx esbuild verify/check.ts --bundle --format=esm --platform=node \
//        --outfile=/tmp/check.mjs && node /tmp/check.mjs
//
// It uses the real solver against generated boards and compares every merged
// verdict with the hidden truth (tests only; the app never reads the truth).

import { blankBoard, generateBoard } from "../src/features/terrain/lib/generator";
import { publicBoard } from "../src/features/terrain/lib/visibility";
import { analyze } from "../src/features/inference/lib/deduce";
import type { BranchInput } from "../src/features/inference/lib/deduce";
import { revealArea } from "../src/features/exploration/lib/flood";
import { buildConstraints } from "../src/features/inference/lib/constraints";
import { gameReducer, initialGame } from "../src/app/gameReducer";
import type { Board, Difficulty, Workspace } from "../src/shared/types";
import type { Command } from "../src/shared/commands";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
let proven = 0;
let claims = 0;
const difficulties: Difficulty[] = ["scout", "scholar", "legend"];

for (let i = 0; i < 90; i++) {
  const rng = mulberry(12000 + i * 977);
  const difficulty = difficulties[i % 3];
  const seed = `CS-${i}`;
  let b: Board = generateBoard(blankBoard(difficulty, seed), 44);
  b = revealArea(b, [44]).board;
  for (let k = 0; k < Math.floor(rng() * 6) + 1; k++) {
    const pool = b.cells.filter((c) => !c.revealed && !c.mine);
    if (!pool.length) break;
    b = revealArea(b, [pool[Math.floor(rng() * pool.length)].id]).board;
  }
  const pub = publicBoard(b);
  const set = buildConstraints(pub);
  if (set.cellIssues.length || !set.constraints.length) continue;
  const frontier = [...new Set(set.constraints.flatMap((c) => c.cells))];
  const base = analyze(pub, { branches: [], merge: [] });
  if (base.base.status === "conflict") continue;
  const decided = new Set(base.base.conclusions.map((d) => d.cell));
  const undecided = frontier.filter((id) => !decided.has(id));
  if (!undecided.length) continue;

  const nSplit = Math.min(undecided.length, 1 + Math.floor(rng() * 2));
  const picks = undecided.slice(0, nSplit);
  const branches: BranchInput[] = [];
  for (let mask = 0; mask < 1 << nSplit; mask++) {
    const assumptions: Record<string, "safe" | "danger"> = {};
    for (let bit = 0; bit < nSplit; bit++)
      assumptions[String(picks[bit])] =
        mask & (1 << bit) ? "danger" : "safe";
    branches.push({ id: `b${mask}`, name: `b${mask}`, active: false, assumptions });
  }
  const res = analyze(pub, { branches, merge: branches.map((x) => x.id) });
  if (!res.merge.actionable) continue;
  proven++;
  if (res.merge.uncoveredCases !== 0) {
    failures++;
    console.log("PROVEN WITH UNCOVERED CASE", seed);
  }
  if (
    res.merge.branches.some(
      (l) => l.id !== "direct" && !l.agrees && !l.infeasible,
    )
  ) {
    failures++;
    console.log("PROVEN WITH INVALID SUPPORT", seed);
  }
  for (const [k, kind] of Object.entries(res.merge.cells)) {
    claims++;
    if ((kind === "danger") !== b.cells[Number(k)].mine) {
      failures++;
      console.log("WRONG MERGE", seed, difficulty, k, kind);
    }
  }
}

// Reducer invariants: rename does not touch assumptions/tools/findings;
// deleting a branch never changes tools or findings.
function send(s: Workspace, c: Command) {
  return gameReducer(s, c);
}
let s = send(initialGame(), { type: "new", difficulty: "scout", seed: "E2E-2" });
s = send(s, { type: "cell", id: 44 });
const set2 = buildConstraints(publicBoard(s.doc.expedition.board));
const frontier2 = [...new Set(set2.constraints.flatMap((c) => c.cells))];
const decided2 = new Set(
  analyze(publicBoard(s.doc.expedition.board), {
    branches: [],
    merge: [],
  }).base.conclusions.map((d) => d.cell),
);
const splitCell = frontier2.find((id) => !decided2.has(id))!;
s = send(s, { type: "branch-new", name: "A" });
const aId = s.doc.expedition.hypotheses.branches[0].id;
s = send(s, { type: "branch-new", name: "B" });
const bId = s.doc.expedition.hypotheses.branches[1].id;
s = send(s, { type: "branch-assume", id: aId, cell: splitCell, value: "danger" });
s = send(s, { type: "branch-assume", id: bId, cell: splitCell, value: "safe" });
s = send(s, { type: "branch-merge", id: aId });
s = send(s, { type: "branch-merge", id: bId });
const toolsBefore = JSON.stringify(s.doc.expedition.tools);
const revealedBefore = s.doc.expedition.board.cells.filter((c) => c.revealed).length;
const assumptionsBefore = JSON.stringify(
  s.doc.expedition.hypotheses.branches.map((x) => x.assumptions),
);
s = send(s, { type: "branch-rename", id: aId, name: "A-renamed" });
if (JSON.stringify(s.doc.expedition.hypotheses.branches.map((x) => x.assumptions)) !== assumptionsBefore) {
  failures++;
  console.log("RENAME CHANGED ASSUMPTIONS");
}
s = send(s, { type: "branch-delete", id: aId });
if (toolsBefore !== JSON.stringify(s.doc.expedition.tools)) {
  failures++;
  console.log("DELETE CHANGED TOOLS");
}
if (revealedBefore !== s.doc.expedition.board.cells.filter((c) => c.revealed).length) {
  failures++;
  console.log("DELETE CHANGED FINDINGS");
}

console.log({ provenMerges: proven, verifiedClaims: claims, failures });
if (failures) process.exit(1);

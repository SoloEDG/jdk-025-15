import { useState } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Pencil,
  Check,
  CircleDot,
  ShieldQuestion,
  TriangleAlert,
  ArrowRightLeft,
  Layers,
} from "lucide-react";
import type {
  Analysis,
  BranchAnalysis,
  Expedition,
  MergeConclusion,
} from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import { coordinate } from "../../../shared/geometry";
import { DIRECT_BRANCH } from "../../../shared/constants";

const statusLabel: Record<BranchAnalysis["status"], string> = {
  ready: "已核验",
  pending: "待证",
  conflict: "数字矛盾",
  contradiction: "假设矛盾",
  empty: "无假设",
  proven: "已证明",
};

const mergeLabel: Record<MergeConclusion["status"], string> = {
  ready: "未选择",
  pending: "待证",
  conflict: "数字矛盾",
  contradiction: "分支相反",
  empty: "无结论",
  proven: "可提交",
};

function assumptionChips(e: Expedition, branchId: string) {
  const branch = e.hypotheses.branches.find((b) => b.id === branchId);
  if (!branch) return [];
  return Object.entries(branch.assumptions).map(([key, value]) => ({
    cell: Number(key),
    value,
  }));
}

export function HypothesisPanel({
  analysis,
  expedition: e,
  send,
  onLocate,
}: {
  analysis: Analysis;
  expedition: Expedition;
  send: (c: Command) => void;
  onLocate: (id: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const active = e.hypotheses.active;
  const branches = analysis.branches;
  const live = e.hypotheses.branches;
  const merge = analysis.merge;

  const startRename = (id: string, name: string) => {
    setEditing(id);
    setDraft(name);
  };
  const commit = () => {
    if (editing) send({ type: "branch-rename", id: editing, name: draft });
    setEditing(null);
  };

  return (
    <section className="hypothesis-panel">
      <div className="panel-heading">
        <GitBranch size={15} />
        <h2>假设分支</h2>
        <span>{String(branches.length).padStart(2, "0")} 分支</span>
      </div>

      <div className="hypothesis-toolbar">
        <button
          className={"outline-button small " + (!active ? "active" : "")}
          aria-pressed={!active}
          onClick={() => send({ type: "branch-select", id: null })}
          title="不设任何假设，只用真正的公开数字推断"
        >
          <CircleDot size={11} />
          直接推断
        </button>
        <button
          className="outline-button small"
          disabled={live.length >= 12 || e.status === "ready"}
          onClick={() => send({ type: "branch-new" })}
          title="创建一个空假设分支，在“假设”模式下给格子写安全/危险"
        >
          <Plus size={11} />
          新建分支
        </button>
      </div>

      <p className="hypothesis-hint">
        {active
          ? "已选中分支：在“假设”模式下点击格子依次写入危险 / 安全 / 清除。假设不会揭格、不花道具、不收文物。"
          : "分支只记录你的假设，不会揭开石板、不消耗探针或火把，也不收集文物。真实旗标与已探明信息始终保持独立。"}
      </p>

      <div className="branch-list">
        {branches.length === 0 && (
          <p className="branch-empty">
            还没有假设分支。遇到无法二分的边界时，新建两个分支分别假设危险与安全。
          </p>
        )}
        {branches.map((b) => {
          const raw = live.find((v) => v.id === b.id);
          const chips = raw ? assumptionChips(e, raw.id) : [];
          const selectedForMerge = e.hypotheses.merge.includes(b.id);
          return (
            <article
              key={b.id}
              className={
                "branch-card" +
                (b.active ? " active" : "") +
                (b.status === "contradiction" || b.status === "conflict"
                  ? " invalid"
                  : "")
              }
            >
              <header>
                <span className="branch-dot" data-status={b.status} />
                {editing === b.id ? (
                  <input
                    autoFocus
                    className="branch-name-input"
                    value={draft}
                    maxLength={24}
                    onChange={(ev) => setDraft(ev.target.value)}
                    onBlur={commit}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") commit();
                      if (ev.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    className="branch-name"
                    onClick={() => send({ type: "branch-select", id: b.id })}
                    aria-pressed={b.active}
                  >
                    {b.name}
                  </button>
                )}
                <span className={"branch-status st-" + b.status}>
                  {statusLabel[b.status]}
                </span>
                <button
                  className="icon-button tiny"
                  aria-label="重命名分支"
                  onClick={() => startRename(b.id, b.name)}
                >
                  <Pencil size={10} />
                </button>
                <button
                  className="icon-button tiny"
                  aria-label="删除分支"
                  onClick={() => send({ type: "branch-delete", id: b.id })}
                >
                  <Trash2 size={10} />
                </button>
              </header>
              <div className="branch-meta">
                <span>
                  {b.covered > 0 ? `${b.covered} 种布局` : "无可行布局"}
                  {b.open > 0 ? ` · 余 ${b.open} 格开放` : ""}
                </span>
                <span>假设 {chips.length} 格</span>
                {b.empty && <span className="warn">空分支不计票</span>}
              </div>
              {chips.length > 0 && (
                <div className="branch-chips">
                  {chips.map((c) => (
                    <button
                      key={c.cell}
                      className={"assume-chip " + c.value}
                      onClick={() => onLocate(c.cell)}
                      title="定位到该格；在假设模式下点击格子可改安全 / 危险 / 清除"
                    >
                      {coordinate(c.cell, e.board.width)}
                      <b>{c.value === "danger" ? "危" : "安"}</b>
                    </button>
                  ))}
                </div>
              )}
              {b.status === "ready" && b.conclusions.length > 0 && (
                <div className="branch-conclusions">
                  {b.conclusions.slice(0, 3).map((d) => (
                    <button key={d.cell} onClick={() => onLocate(d.cell)}>
                      <i className={d.kind} />
                      {coordinate(d.cell, e.board.width)}
                      {d.kind === "safe" ? " 安全" : " 危险"}
                    </button>
                  ))}
                  {b.conclusions.length > 3 && (
                    <span>+{b.conclusions.length - 3}</span>
                  )}
                </div>
              )}
              {b.note && <p className="branch-note">{b.note}</p>}
              <footer>
                <label className="merge-toggle">
                  <input
                    type="checkbox"
                    checked={selectedForMerge}
                    onChange={() =>
                      send({ type: "branch-merge", id: b.id })
                    }
                  />
                  纳入合并
                </label>
              </footer>
            </article>
          );
        })}
      </div>

      <MergeCard merge={merge} e={e} send={send} onLocate={onLocate} />
    </section>
  );
}

function MergeCard({
  merge,
  e,
  send,
  onLocate,
}: {
  merge: MergeConclusion;
  e: Expedition;
  send: (c: Command) => void;
  onLocate: (id: number) => void;
}) {
  const directSelected = e.hypotheses.merge.includes(DIRECT_BRANCH);
  const conclusionCells = Object.entries(merge.cells);
  return (
    <section className={"merge-card " + merge.status}>
      <div className="merge-heading">
        <Layers size={13} />
        <h3>合并结论</h3>
        <span className={"merge-status m-" + merge.status}>
          {mergeLabel[merge.status]}
        </span>
      </div>
      <div className="merge-meter">
        <div>
          <b>
            {merge.feasibleCases - merge.uncoveredCases}/{merge.feasibleCases}
          </b>
          <small>可行情形已覆盖</small>
        </div>
        <div>
          <b>{merge.worlds}</b>
          <small>枚举布局</small>
        </div>
        <div>
          <b>{merge.duplicateCases}</b>
          <small>重复情形</small>
        </div>
      </div>
      <p className="merge-text">
        {merge.status === "proven" ? (
          <Check size={12} />
        ) : merge.status === "contradiction" ? (
          <TriangleAlert size={12} />
        ) : (
          <ShieldQuestion size={12} />
        )}
        {merge.text}
      </p>
      {merge.unsafe.length > 0 && merge.status !== "proven" && (
        <ul className="merge-issues">
          {merge.unsafe.slice(0, 3).map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}
      {merge.status === "proven" && merge.details.length > 0 && (
        <ul className="merge-details">
          {merge.details.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {merge.branches.length > 0 && (
        <div className="merge-lines">
          {merge.branches.map((line) => (
            <span
              key={line.id}
              className={
                line.agrees ? "ok" : line.infeasible ? "empty" : "bad"
              }
              title={
                line.agrees
                  ? "该分支的布局已核验，可作为合并支持"
                  : line.infeasible
                    ? "该分支的假设组合本身无解（只作为空情形标注，不计入支持）"
                    : "该分支未算完或与合并结论相反，不计入支持"
              }
            >
              {line.name} {line.agrees ? `${line.covered} 布局` : "不计票"}
            </span>
          ))}
        </div>
      )}
      <div className="merge-controls">
        <label className="merge-toggle">
          <input
            type="checkbox"
            checked={directSelected}
            onChange={() => send({ type: "branch-merge", id: DIRECT_BRANCH })}
          />
          纳入直接推断
        </label>
        <button
          className="outline-button small"
          onClick={() =>
            send({
              type: "branch-merge-set",
              ids: e.hypotheses.merge.length
                ? []
                : [
                    DIRECT_BRANCH,
                    ...e.hypotheses.branches.map((b) => b.id),
                  ],
            })
          }
        >
          <ArrowRightLeft size={10} />
          {e.hypotheses.merge.length ? "全部取消" : "全部纳入"}
        </button>
      </div>
      {merge.status === "proven" && conclusionCells.length > 0 && (
        <div className="merge-cells">
          {conclusionCells.slice(0, 8).map(([cell, kind]) => (
            <button
              key={cell}
              className={kind}
              onClick={() => onLocate(Number(cell))}
            >
              {coordinate(Number(cell), e.board.width)}
              {kind === "safe" ? " 安全" : " 危险"}
            </button>
          ))}
          {conclusionCells.length > 8 && (
            <span>+{conclusionCells.length - 8}</span>
          )}
        </div>
      )}
      <p className="merge-caution">
        合并会枚举所选假设格的全部情形（不止你建的组合），逐个核对是否覆盖所有符合公开数字的布局；矛盾、空或未算完的分支不计入支持。只有“可提交”的合并结论才用于安全探索。
      </p>
    </section>
  );
}

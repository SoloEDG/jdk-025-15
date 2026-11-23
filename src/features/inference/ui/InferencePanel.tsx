import {
  ScanSearch,
  Lightbulb,
  TriangleAlert,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import type { Analysis, Expedition } from "../../../shared/types";
import { coordinate } from "../../../shared/geometry";
import { HypothesisPanel } from "./HypothesisPanel";
import type { Command } from "../../../shared/commands";

function summary(a: Analysis, e: Expedition) {
  if (e.status === "ready") return "第一步始终安全，选择一块石板开始。";
  if (a.base.status === "conflict")
    return "公开数字互相矛盾，请核对探针信息与已揭数字。";
  const merged = a.merge.actionable ? Object.keys(a.merge.cells).length : 0;
  if (merged)
    return `合并结论已验证（覆盖 ${a.merge.feasibleCases} 个可行情形），可采用 ${merged} 条。`;
  if (a.base.status === "pending" && a.merge.status === "pending")
    return "整体布局未算完；用假设分支拆分后，合并可对每个小情形分别穷举并证明覆盖。";
  if (a.base.status === "pending")
    return "整体布局未枚举完，直接结论只显示已证实的部分，可拆分假设分支推进。";
  if (a.base.conclusions.length)
    return `无条件推断已给出 ${a.base.conclusions.length} 条结论；也可用假设分支比较。`;
  if (a.unknown.length)
    return `还有 ${a.unknown.length} 格没有数字触及，任何分支都无法判断；先扩大边界。`;
  return "暂无可提交结论，试试探针或建立假设分支比较。";
}

export function InferencePanel({
  analysis: a,
  expedition: e,
  showHints,
  onHints,
  onLocate,
  send,
}: {
  analysis: Analysis;
  expedition: Expedition;
  showHints: boolean;
  onHints: () => void;
  onLocate: (id: number) => void;
  send: (c: Command) => void;
}) {
  const base = a.base.conclusions;
  return (
    <>
      <section className="inference-panel">
        <div className="panel-heading">
          <ScanSearch size={15} />
          <h2>推断笔记</h2>
          <span>LOGIC NOTES</span>
        </div>
        <div
          className={
            "logic-status " +
            (a.base.status === "conflict" ? "conflict" : "")
          }
        >
          <Lightbulb size={16} />
          <p>{summary(a, e)}</p>
        </div>
        <div className="logic-counts">
          <div>
            <b>{String(a.base.worlds).padStart(2, "0")}</b>
            <span>可行布局</span>
          </div>
          <div>
            <b>{String(base.length).padStart(2, "0")}</b>
            <span>直接结论</span>
          </div>
          <div>
            <b>{String(a.unknown.length).padStart(2, "0")}</b>
            <span>无约束格</span>
          </div>
        </div>
        <button
          className={"outline-button " + (showHints ? "active" : "")}
          aria-pressed={showHints}
          onClick={onHints}
        >
          <ScanSearch size={13} />
          {showHints ? "隐藏推断高亮" : "在地图上高亮"}
        </button>
        <div className="deduction-list">
          {base.slice(0, 4).map((d) => (
            <button key={d.cell} onClick={() => onLocate(d.cell)}>
              <i className={d.kind} />
              <span>
                {coordinate(d.cell, e.board.width)} ·{" "}
                {d.kind === "safe" ? "可探索" : "需警惕"}
              </span>
              <ArrowUpRight size={12} />
            </button>
          ))}
          {base.length === 0 && (
            <span className="deduction-none">没有无需假设的直接结论。</span>
          )}
        </div>
        <p className="logic-caution">
          <TriangleAlert size={11} />
          推断只读取已公开数字与探针信息，绝不读取暗格答案；真实旗标未经探针确认时不当作事实。
        </p>
      </section>
      <HypothesisPanel
        analysis={a}
        expedition={e}
        send={send}
        onLocate={onLocate}
      />
      <section className="inference-legend">
        <ShieldCheck size={12} />
        <span>
          地图高亮只展示两类已证明信息：不带任何假设的直接结论，以及“合并结论 · 可提交”的格子。分支内的假设用虚线单独显示，绝不当作事实。
        </span>
      </section>
    </>
  );
}

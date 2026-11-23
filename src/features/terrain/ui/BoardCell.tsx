import {
  Flag,
  HelpCircle,
  TriangleAlert,
  ShieldCheck,
  Gem,
  Eye,
  GitBranch,
} from "lucide-react";
import type { Cell, HypothesisValue } from "../../../shared/types";
import { coordinate } from "../../../shared/geometry";
import type { CellHint } from "./BoardView";

export function BoardCell({
  cell: c,
  width,
  terminal,
  hint,
  assumption,
  assumptionBranch,
  selected,
  onOpen,
  onMark,
  onChord,
  onNavigate,
}: {
  cell: Cell;
  width: number;
  terminal: boolean;
  hint: CellHint | undefined;
  assumption: HypothesisValue | undefined;
  assumptionBranch: string | null;
  selected: boolean;
  onOpen: () => void;
  onMark: () => void;
  onChord: () => void;
  onNavigate: (key: string) => void;
}) {
  const hazard = c.mine && (c.revealed || terminal);
  // Truth layer first: an exploded trap, a revealed tile, a real flag or a
  // probe badge is never replaced by a hypothesis. Assumptions render as a
  // dashed outline plus a corner tag on top of whatever truth is visible.
  const content = hazard ? (
    <TriangleAlert size={18} />
  ) : c.revealed ? (
    c.relic ? (
      <Gem size={17} />
    ) : (
      c.adjacent || ""
    )
  ) : c.mark === "flag" ? (
    <Flag size={17} />
  ) : c.mark === "question" ? (
    <HelpCircle size={17} />
  ) : c.intel === "danger" ? (
    <TriangleAlert size={15} />
  ) : c.intel === "safe" ? (
    <ShieldCheck size={15} />
  ) : assumption === "danger" ? (
    <GitBranch size={15} className="assume-icon danger" />
  ) : assumption === "safe" ? (
    <GitBranch size={15} className="assume-icon safe" />
  ) : hint ? (
    <ShieldCheck size={14} className="hint-icon" />
  ) : null;
  let label = `${coordinate(c.id, width)}，`;
  label += hazard
    ? "已发现陷阱，真实危险"
    : c.revealed
      ? `已探索，邻近危险${c.adjacent}${c.relic ? "，发现文物" : ""}`
      : c.mark === "flag"
        ? "真实旗标，未验证"
        : c.mark === "question"
          ? "疑问标记"
          : c.intel === "safe"
            ? "探针确认安全，未探索"
            : c.intel === "danger"
              ? "探针确认危险，未探索"
              : "未探索";
  if (assumption)
    label += `；当前假设分支「${assumptionBranch}」把它设为${assumption === "danger" ? "危险" : "安全"}（不是事实）`;
  if (hint)
    label += `；${
      hint.source === "merged"
        ? "合并结论已验证"
        : "直接推断结论（未使用假设）"
    }${hint.kind === "safe" ? "安全" : "危险"}`;
  return (
    <button
      role="gridcell"
      id={"tile-" + c.id}
      tabIndex={selected ? 0 : -1}
      aria-label={label}
      data-cell={c.id}
      className={[
        "tile",
        c.revealed ? "open" : "closed",
        hazard ? "hazard" : "",
        c.revealed ? "terrain-" + c.terrain : "",
        c.mark === "flag" ? "flagged" : "",
        c.intel !== "unknown" ? "intel-" + c.intel : "",
        hint ? "hint-" + hint.kind : "",
        hint ? "hint-src-" + hint.source : "",
        assumption ? "assumed-" + assumption : "",
        selected ? "tile-selected" : "",
        c.revealed && !c.mine ? "number-" + c.adjacent : "",
      ].join(" ")}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onMark();
      }}
      onDoubleClick={onChord}
      onKeyDown={(e) => {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "f",
            "F",
          ].includes(e.key)
        ) {
          e.preventDefault();
          if (e.key.toLowerCase() === "f") onMark();
          else onNavigate(e.key);
        }
      }}
    >
      {content}
      {!c.revealed && assumption && (
        <span className={"assume-tag " + assumption}>
          {assumption === "danger" ? "危" : "安"}
        </span>
      )}
      {!c.revealed && assumption && (c.mark === "flag" || c.mark === "question") && (
        <span className="intel-badge assume-marker" title="真实标记与假设同时存在">
          ·
        </span>
      )}
      {c.revealed && c.relic && c.adjacent > 0 && (
        <span className="relic-number">{c.adjacent}</span>
      )}
      {c.revealed && c.adjacent === 0 && !c.relic && (
        <span className="stone-dot">·</span>
      )}
      {!c.revealed &&
        c.mark === "none" &&
        c.intel === "unknown" &&
        c.id % 13 === 0 && <span className="glyph">⌑</span>}
      {c.intel !== "unknown" && !c.revealed && (
        <Eye className="intel-badge" size={7} />
      )}
    </button>
  );
}

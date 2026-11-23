import { X, Pickaxe, Flag, ScanSearch, GitBranch } from "lucide-react";
export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="dialog guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          autoFocus
          className="icon-button close"
          onClick={onClose}
          aria-label="关闭指南"
        >
          <X size={18} />
        </button>
        <span className="eyebrow">THE EXPLORER’S HANDBOOK</span>
        <h2 id="guide-title">读懂遗迹的低语。</h2>
        <div className="guide-step">
          <Pickaxe />
          <p>
            <strong>揭开石板</strong>
            点击探索安全格，数字表示周围八格里的危险总数。空白安全区会自动展开，首步和相邻八格始终安全。
          </p>
        </div>
        <div className="guide-step">
          <Flag />
          <p>
            <strong>真实标记与推断</strong>
            右键或标记模式循环旗标、疑问和清除。旗标只是你的判断，未经探针确认不会被推断当作事实。双击已揭数字且周围旗标数相等时展开其余格；错误旗标可能造成伤害。方向键移焦点，F标记，回车探索。
          </p>
        </div>
        <div className="guide-step">
          <GitBranch />
          <p>
            <strong>假设分支与合并</strong>
            新建分支并在“假设”模式下给格子写安全/危险；分支不会揭格、不花道具、不收文物，可自由改名、切换、删除。合并时求解器会把所选假设格拆成全部情形（2ⁿ 个组合，不止你手建的组合），逐一枚举符合公开数字的布局：每个可行情形都必须被覆盖，且每个可行分支都得到同一结论，合并才「可提交」。矛盾分支、空分支和未算完的分支不计入支持；重复覆盖与遗漏都会给出计数。只有可提交的结论用于安全探索，分支内的安/危始终只是假设。新数字出现后自动重算，未算完只显示待证。
          </p>
        </div>
        <div className="guide-step">
          <ScanSearch />
          <p>
            <strong>有限道具</strong>
            探针确认一格但不揭开；火把安全揭开或确认危险；守护符石抵挡一次伤害。信息会进入推断；推断仍以你插的旗标为条件。
          </p>
        </div>
        <p className="guide-foot">
          有三点生命。揭开全部安全格即可完成；也能提前撤离结算。每安全格10分、文物50分、全图奖励200分，触发陷阱扣30分、每道具扣15分，最低0分。自动存档保留整局，后台不计时。
        </p>
        <button className="primary" onClick={onClose}>
          开始我的探险
        </button>
      </section>
    </div>
  );
}

import { t as tr } from "../lib/i18n";
import { adviceLines } from "../lib/errorAdvice";
import { el } from "./dom";

/**
 * 错误 tips 泡泡（TD-PROBE-006）。
 *
 * 用户诉求：hover 在错误上时弹出**多行**解释，把"为什么失败 / 怎么办"讲清楚，
 * 而不是只丢一句"解析失败"。所以是"多段结构 + 可悬浮 + 不遮挡"，
 * 不是 toast（toast 会自己消失，用户还没读完就没了）。
 *
 * 三个交互细节：
 * - 鼠标从触发元素移入泡泡时**不能断**（否则移向提示的瞬间泡泡消失），
 *   所以延迟关闭，并让泡泡自身能承接 hover。
 * - 定位用 fixed +视口翻转，靠近右/下边缘时翻到另一侧，避免出屏。
 * - Esc 关闭：键盘可达，不只依赖鼠标。
 */
export class ErrorTip {
  private bubble: HTMLElement;
  private timer: number | null = null;
  private onKey: (e: KeyboardEvent) => void;

  constructor(
    private anchor: HTMLElement,
    code: string | null,
    lang: "zh" | "en"
  ) {
    const lines = adviceLines(code, lang);
    this.bubble = el(
      "div",
      { class: "err-tip", role: "tooltip" },
      ...lines.map((text) => el("div", { class: "err-tip-line", text }))
    );
    // 泡泡自身也要能承接 hover：移进去时取消关闭
    this.bubble.addEventListener("mouseenter", () => this.cancelClose());
    this.bubble.addEventListener("mouseleave", () => this.scheduleClose());
    document.body.append(this.bubble);
    this.position();
    this.onKey = (e) => {
      if (e.key === "Escape") this.dispose();
    };
    document.addEventListener("keydown", this.onKey);
  }

  /** 贴着触发元素定位；越界则翻到另一侧。 */
  private position() {
    const a = this.anchor.getBoundingClientRect();
    const b = this.bubble.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 下方优先，放不下就上方；左右同理
    let top = a.bottom + gap;
    if (top + b.height > vh - 8) top = Math.max(8, a.top - b.height - gap);
    let left = a.left;
    if (left + b.width > vw - 8) left = Math.max(8, vw - b.width - 8);

    this.bubble.style.top = `${Math.round(top)}px`;
    this.bubble.style.left = `${Math.round(left)}px`;
  }

  scheduleClose() {
    this.cancelClose();
    this.timer = window.setTimeout(() => this.dispose(), 180);
  }

  cancelClose() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose() {
    this.cancelClose();
    document.removeEventListener("keydown", this.onKey);
    this.bubble.remove();
  }
}

/**
 * 给错误节点挂上 hover tips。返回解绑函数。
 *
 * 刻意做成"挂载函数"而不是组件类：错误节点由 keyed 增量渲染频繁重建，
 * 由渲染方决定何时挂/解绑，避免泡泡状态跟着 DOM 重建而泄漏。
 */
export function attachErrorTip(
  node: HTMLElement,
  code: string | null,
  lang: "zh" | "en"
): () => void {
  node.classList.add("has-tip");
  node.setAttribute("aria-label", tr("errTipHint"));
  let tip: ErrorTip | null = null;
  const show = () => {
    if (tip) return;
    tip = new ErrorTip(node, code, lang);
  };
  const hide = () => {
    tip?.scheduleClose();
  };
  node.addEventListener("mouseenter", show);
  node.addEventListener("mouseleave", hide);
  node.addEventListener("focus", show);
  node.addEventListener("blur", hide);
  return () => {
    node.removeEventListener("mouseenter", show);
    node.removeEventListener("mouseleave", hide);
    node.removeEventListener("focus", show);
    node.removeEventListener("blur", hide);
    tip?.dispose();
    tip = null;
  };
}

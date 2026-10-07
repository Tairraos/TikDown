import { invoke } from "../lib/ipc";
import type { Task } from "../lib/types";
import { formatBytes, formatDuration, qualityLabel } from "../lib/types";
import { t as tr } from "../lib/i18n";
import { icon, type IconName } from "../lib/icons";
import { clear, el } from "./dom";

const statusLabel = (status: Task["status"]): string => tr(`status.${status}`);

export interface TaskListCallbacks {
  onFormat: (id: string, formatId: string | null) => void;
  onStart: (task: Task) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}

type RowParts = {
  barSlot: HTMLElement;
  qualitySlot: HTMLElement;
  ops: HTMLElement;
  stateSpan: HTMLElement;
  msgSpan: HTMLElement;
  titleSpan: HTMLElement;
};

/** 图标按钮(▶/⏸/✕/📁,TD-FE-021 参考图)。 */
function iconBtn(name: IconName, title: string, onclick: () => void): HTMLElement {
  return el("button", { class: "icon-btn small", title, "aria-label": title, onclick }, icon(name, 15));
}

/**
 * 任务列表(TD-FE-021 参考图):缩略图 + URL/作者-标题/大小+内联绿色进度,
 * 操作图标 ▶ 开始 ↻ 重试 ⏸ 取消 ✕ 移除 📁 定位,状态文字靠右缘。
 * 按任务 id 做 keyed 增量更新——进度事件高频到达时只改动对应行,避免整列重绘。
 */
export class TaskListView {
  private rows = new Map<string, HTMLElement>();
  private rowParts = new Map<string, RowParts>();

  constructor(
    private container: HTMLElement,
    private platformOf: (url: string) => string | null,
    private cb: TaskListCallbacks
  ) {}

  render(tasks: Task[]) {
    const ids = new Set(tasks.map((t) => t.id));
    for (const [id, node] of this.rows) {
      if (!ids.has(id)) {
        node.remove();
        this.rows.delete(id);
        this.rowParts.delete(id);
      }
    }

    if (tasks.length === 0) {
      this.container.querySelector(".empty")?.remove();
      this.container.append(el("div", { class: "empty", text: tr("emptyHint") }));
      return;
    }
    this.container.querySelector(".empty")?.remove();

    // 从尾到头 insertBefore,保证 DOM 顺序与任务数组一致
    let ref: Node | null = null;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      let row = this.rows.get(t.id);
      const parts = this.rowParts.get(t.id);
      if (!row || !parts) {
        const built = this.buildRow(t);
        this.rows.set(t.id, built.row);
        this.rowParts.set(t.id, built.parts);
        row = built.row;
      } else {
        this.updateRow(row, t, parts);
      }
      this.container.insertBefore(row, ref);
      ref = row;
    }
  }

  private buildRow(t: Task): { row: HTMLElement; parts: RowParts } {
    const platform = this.platformOf(t.url);
    const barSlot = el("span", { class: "bar-slot" });
    const qualitySlot = el("div", { class: "qualities-slot" });
    const ops = el("div", { class: "ops" });
    const stateSpan = el("span", { class: `state ${t.status}` }, statusLabel(t.status));
    const msgSpan = el("span", { class: "msg" });
    const titleSpan = el("span", { class: "title", text: this.displayTitle(t) });
    const row = el(
      "div",
      { class: `task ${t.status}`, title: t.status === "done" ? tr("titlePlay") : undefined },
      el(
        "div",
        { class: "thumb" },
        t.info?.thumbnail
          ? el("img", { src: httpToHttps(t.info.thumbnail), alt: "", loading: "lazy" })
          : el("div", { class: "ph", text: platform ? platform[0] : "?" })
      ),
      el(
        "div",
        { class: "body" },
        el("div", { class: "url", text: t.url }),
        el("div", { class: "title-row" }, platform ? el("span", { class: "tag", text: platform }) : null, titleSpan),
        el(
          "div",
          { class: "meta" },
          doneSizeSpan(t) ?? sizeSpan(t),
          resolutionSpan(t),
          t.info?.duration ? el("span", { class: "dim", text: formatDuration(t.info.duration) }) : null,
          t.doneElapsedSec ? el("span", { class: "dim", text: tr("elapsed", { n: t.doneElapsedSec }) }) : null,
          barSlot,
          msgSpan
        ),
        qualitySlot
      ),
      ops
    );
    this.updateRow(row, t, { barSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan });
    return { row, parts: { barSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan } };
  }

  /** 第二行展示:作者 - 标题(TD-FE-021 参考图);无作者时只显示标题。 */
  private displayTitle(t: Task): string {
    const title = t.info?.title ?? t.url;
    const uploader = t.info?.uploader?.trim();
    return uploader && uploader !== title ? `${uploader} - ${title}` : title;
  }

  private updateRow(row: HTMLElement, t: Task, parts: RowParts) {
    row.className = `task ${t.status}`;
    // 下载完成:点击行用系统播放器播放(TD-FE-012)
    row.onclick = t.status === "done" && t.donePath ? () => void invoke("open_with_system", { path: t.donePath }) : null;
    // 状态与错误信息随事件更新(E2E 发现的增量更新盲区)
    parts.stateSpan.replaceChildren(statusLabel(t.status));
    parts.stateSpan.className = `state ${t.status}`;
    parts.msgSpan.textContent = t.error ?? "";
    parts.titleSpan.textContent = this.displayTitle(t);

    // 内联进度条(下载中/合并中):total 缺失(DASH 常见)时改不确定动画(TD-FE-013)
    clear(parts.barSlot);
    if (t.status === "downloading" || t.status === "merging") {
      const indeterminate = t.percent <= 0;
      parts.barSlot.append(
        el(
          "span",
          { class: "progress" },
          el("span", {
            class: indeterminate ? "bar indeterminate" : "bar",
            style: indeterminate ? undefined : `width:${Math.min(100, t.percent)}%`,
          })
        )
      );
    }

    clear(parts.qualitySlot);
    const qualities = t.status === "ready" ? (t.info?.qualities ?? []) : [];
    if (qualities.length > 1) {
      const box = el("div", { class: "qualities" });
      box.append(
        el("button", {
          class: t.formatId === null ? "chip on" : "chip",
          text: tr("chipBest"),
          onclick: () => this.cb.onFormat(t.id, null),
        })
      );
      for (const q of qualities.slice(0, 6)) {
        box.append(
          el("button", {
            class: t.formatId === q.formatId ? "chip on" : "chip",
            text: q.resolution,
            title: `${q.vcodec}${q.filesize ? " · " + formatBytes(q.filesize) : ""}`,
            onclick: () => this.cb.onFormat(t.id, q.formatId),
          })
        );
      }
      parts.qualitySlot.append(box);
    }

    // 操作图标(TD-FE-021):▶ 开始 ↻ 重试 ⏸ 取消 📁 定位 ✕ 移除(运行中不可移除)
    clear(parts.ops);
    const running = t.status === "downloading" || t.status === "merging";
    if (t.status === "ready") {
      parts.ops.append(iconBtn("play", tr("btnDownload"), () => this.cb.onStart(t)));
    } else if (t.status === "failed") {
      parts.ops.append(iconBtn("rotate-cw", tr("btnRetry"), () => this.cb.onStart(t)));
    } else if (t.status === "done" && t.donePath) {
      parts.ops.append(iconBtn("play", tr("btnPlay"), () => void invoke("open_with_system", { path: t.donePath })));
      parts.ops.append(
        iconBtn("folder-open", tr("titleReveal"), () => void invoke("reveal_in_manager", { path: t.donePath }))
      );
    }
    if (running) {
      parts.ops.append(iconBtn("pause", tr("btnCancel"), () => this.cb.onCancel(t.id)));
    } else if (t.status !== "probing") {
      parts.ops.append(iconBtn("x", tr("btnRemove"), () => this.cb.onRemove(t.id)));
    }
    parts.ops.append(parts.stateSpan);
    if (t.status === "downloading") {
      parts.stateSpan.replaceChildren(
        t.percent > 0 ? `${statusLabel("downloading")} ${Math.round(t.percent)}%` : `${statusLabel("downloading")} ${formatBytes(t.downloaded)}`
      );
    } else if (t.status === "merging") {
      parts.stateSpan.replaceChildren(statusLabel("merging"));
    }
  }
}

/** 完成态尺寸:优先 stat 的真实大小,回退探测选中档(B 站 DASH 常无 filesize,TD-FE-012) */
function doneSizeSpan(t: Task): HTMLElement | null {
  const qs = t.info?.qualities ?? [];
  const fallback = qs.length === 0 ? null : (t.formatId ? qs.find((q) => q.formatId === t.formatId) : undefined)?.filesize ?? qs[0]?.filesize ?? null;
  const size = t.doneSize ?? fallback;
  return size ? el("span", { class: "size", text: formatBytes(size) }) : null;
}

/** 分辨率:宽×高 + 最接近的常用档标签(TD-FE-012) */
function resolutionSpan(t: Task): HTMLElement | null {
  const qs = t.info?.qualities ?? [];
  if (qs.length === 0) return null;
  const q = (t.formatId ? qs.find((x) => x.formatId === t.formatId) : undefined) ?? qs[0];
  if (!q?.height) return null;
  const label = qualityLabel(q.height);
  return el("span", { class: "dim", text: q.width ? `${q.width}×${q.height} ${label}` : label });
}

/** B 站等平台缩略图常为 http://,Tauri WebView 下升级 https(CSP img-src https:) */
function httpToHttps(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

/** 体积显示:选中画质优先,否则取最高档;探测失败不显示。 */
function sizeSpan(t: Task): HTMLElement | null {
  const qs = t.info?.qualities ?? [];
  if (qs.length === 0) return null;
  const selected = t.formatId ? qs.find((q) => q.formatId === t.formatId) : undefined;
  const size = selected?.filesize ?? qs[0]?.filesize ?? null;
  if (!size) return null;
  return el("span", { class: "size", text: formatBytes(size) });
}

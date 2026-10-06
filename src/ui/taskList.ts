import type { Task } from "../lib/types";
import { formatBytes, formatDuration } from "../lib/types";
import { icon } from "../lib/icons";
import { clear, el } from "./dom";

const STATUS_LABEL: Record<Task["status"], string> = {
  pending: "等待",
  probing: "解析中",
  ready: "待下载",
  downloading: "下载中",
  merging: "合并中",
  done: "下载完成",
  failed: "失败",
  skipped: "已跳过",
};

const STATUS_ICON: Record<Task["status"], Parameters<typeof icon>[0] | null> = {
  pending: "clock",
  probing: null,
  ready: "clock",
  downloading: "arrow-down",
  merging: "arrow-down",
  done: "circle-check",
  failed: "circle-alert",
  skipped: null,
};

export interface TaskListCallbacks {
  onFormat: (id: string, formatId: string | null) => void;
  onStart: (task: Task) => void;
  onCancel: (id: string) => void;
}

type RowParts = {
  progressSlot: HTMLElement;
  qualitySlot: HTMLElement;
  ops: HTMLElement;
  stateSpan: HTMLElement;
  msgSpan: HTMLElement;
  titleSpan: HTMLElement;
};

/**
 * 任务列表(v1 视觉):缩略图 + URL/标题/体积 + 绿色进度条 + 右侧状态。
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
      this.container.append(
        el("div", { class: "empty", text: "点击左上角「粘贴/下载」,或 Ctrl+V 直接粘贴链接。图文帖会自动跳过。" })
      );
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
    const progressSlot = el("div", { class: "progress-slot" });
    const qualitySlot = el("div", { class: "qualities-slot" });
    const ops = el("div", { class: "ops" });
    const stateSpan = el("span", { class: `state ${t.status}` }, STATUS_LABEL[t.status]);
    const msgSpan = el("span", { class: "msg" });
    const titleSpan = el("span", { class: "title", text: t.info?.title ?? t.url });
    const row = el(
      "div",
      { class: `task ${t.status}` },
      el(
        "div",
        { class: "thumb" },
        t.info?.thumbnail
          ? el("img", { src: t.info.thumbnail, alt: "", loading: "lazy" })
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
          sizeSpan(t),
          t.info?.duration ? el("span", { class: "dim", text: formatDuration(t.info.duration) }) : null,
          msgSpan
        ),
        progressSlot,
        qualitySlot
      ),
      ops
    );
    this.updateRow(row, t, { progressSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan });
    return { row, parts: { progressSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan } };
  }

  private updateRow(row: HTMLElement, t: Task, parts: RowParts) {
    row.className = `task ${t.status}`;
    // 状态与错误信息随事件更新(E2E 发现的增量更新盲区)
    parts.stateSpan.replaceChildren(STATUS_LABEL[t.status]);
    parts.stateSpan.className = `state ${t.status}`;
    const st = STATUS_ICON[t.status];
    if (st) parts.stateSpan.prepend(icon(st, 13));
    parts.msgSpan.textContent = t.error ?? "";
    parts.titleSpan.textContent = t.info?.title ?? t.url;

    clear(parts.progressSlot);
    if (t.status === "downloading" || t.status === "merging") {
      parts.progressSlot.append(
        el("div", { class: "progress" }, el("div", { class: "bar", style: `width:${Math.min(100, t.percent)}%` }))
      );
    }

    clear(parts.qualitySlot);
    const qualities = t.status === "ready" ? (t.info?.qualities ?? []) : [];
    if (qualities.length > 1) {
      const box = el("div", { class: "qualities" });
      box.append(
        el("button", {
          class: t.formatId === null ? "chip on" : "chip",
          text: "最佳",
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

    clear(parts.ops);
    // 右侧状态文字(v1:任务行右缘显示「下载完成」等),下载中带百分比
    parts.ops.append(parts.stateSpan);
    if (t.status === "downloading" || t.status === "merging") {
      parts.stateSpan.replaceChildren(`${STATUS_LABEL[t.status]} ${Math.round(t.percent)}%`);
    }
    if (t.status === "ready") {
      parts.ops.append(el("button", { class: "btn small", text: "下载", onclick: () => this.cb.onStart(t) }));
    } else if (t.status === "failed") {
      parts.ops.append(
        el("button", { class: "btn small ghost", text: "重试", title: "重新下载", onclick: () => this.cb.onStart(t) })
      );
    }
    if (t.status === "downloading" || t.status === "merging") {
      parts.ops.append(
        el("button", { class: "icon-btn small", title: "取消", "aria-label": "取消", onclick: () => this.cb.onCancel(t.id) }, icon("x", 14))
      );
    }
  }
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

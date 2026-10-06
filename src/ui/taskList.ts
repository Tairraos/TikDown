import { invoke } from "../lib/ipc";
import type { Task } from "../lib/types";
import { formatBytes, formatDuration, qualityLabel } from "../lib/types";
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
        el("div", { class: "empty", text: "点击顶部中间「粘贴/下载」,或 Ctrl+V 直接粘贴链接。图文帖会自动跳过。" })
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
      { class: `task ${t.status}`, title: t.status === "done" ? "点击播放" : undefined },
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
          t.doneElapsedSec ? el("span", { class: "dim", text: `用时 ${t.doneElapsedSec}秒` }) : null,
          msgSpan
        ),
        progressSlot,
        qualitySlot
      ),
      ops
    );
    if (t.status === "done" && t.donePath) {
      row.onclick = () => void invoke("open_with_system", { path: t.donePath });
    }
    this.updateRow(row, t, { progressSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan });
    return { row, parts: { progressSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan } };
  }

  private updateRow(row: HTMLElement, t: Task, parts: RowParts) {
    row.className = `task ${t.status}`;
    // 下载完成:点击行用系统播放器播放(TD-FE-012)
    row.onclick = t.status === "done" && t.donePath ? () => void invoke("open_with_system", { path: t.donePath }) : null;
    // 状态与错误信息随事件更新(E2E 发现的增量更新盲区)
    parts.stateSpan.replaceChildren(STATUS_LABEL[t.status]);
    parts.stateSpan.className = `state ${t.status}`;
    const st = STATUS_ICON[t.status];
    if (st) parts.stateSpan.prepend(icon(st, 13));
    parts.msgSpan.textContent = t.error ?? "";
    parts.titleSpan.textContent = t.info?.title ?? t.url;

    clear(parts.progressSlot);
    if (t.status === "downloading" || t.status === "merging") {
      // total 缺失(DASH 常见)时 percent 恒 0:进度条改为不确定动画,状态显示已下载 MB(TD-FE-013)
      const indeterminate = t.percent <= 0;
      parts.progressSlot.append(
        el(
          "div",
          { class: "progress" },
          el("div", {
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
    if (t.status === "downloading") {
      parts.stateSpan.replaceChildren(
        t.percent > 0 ? `下载中 ${Math.round(t.percent)}%` : `下载中 ${formatBytes(t.downloaded)}`
      );
    } else if (t.status === "merging") {
      parts.stateSpan.replaceChildren("合成中");
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
    if (t.status === "done" && t.donePath) {
      parts.ops.append(
        el("button", {
          class: "btn small ghost",
          text: "定位",
          title: "在 Finder 中显示",
          onclick: (e: Event) => {
            e.stopPropagation(); // 不触发行点击播放
            void invoke("reveal_in_manager", { path: t.donePath });
          },
        })
      );
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

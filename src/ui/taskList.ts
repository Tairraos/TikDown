import { invoke, toAssetUrl } from "../lib/ipc";
import type { Task } from "../lib/types";
import { formatBytes, formatDuration, qualityLabel } from "../lib/types";
import { lang, t as tr } from "../lib/i18n";
import { icon, type IconName } from "../lib/icons";
import { attachErrorTip } from "./errorTip";
import { clear, el } from "./dom";

const statusLabel = (status: Task["status"]): string => tr(`status.${status}`);

export interface TaskListCallbacks {
  onFormat: (id: string, formatId: string | null) => void;
  onStart: (task: Task) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  /** 打开应用内播放器（TD-FE-025）；不在列表内自己弹窗，保持视图无状态 */
  onPlay: (task: Task) => void;
}

type RowParts = {
  barSlot: HTMLElement;
  qualitySlot: HTMLElement;
  ops: HTMLElement;
  stateSpan: HTMLElement;
  msgSpan: HTMLElement;
  titleSpan: HTMLElement;
  thumbSlot: HTMLElement;
  /** 已发起过缩略图请求的路径，避免每次渲染都去调 ffmpeg */
  thumbTried: string;
  /** 错误 tips 的解绑函数（换任务/重建行时必须先解，否则泡泡泄漏） */
  detachTip: (() => void) | null;
  /** 当前已挂 tips 的 code，用于跳过无意义的重挂 */
  tipCode: string | null;
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
        // 行被移除：必须解绑 tips，否则泡泡监听器与已脱离文档的节点一起泄漏
        this.rowParts.get(id)?.detachTip?.();
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
    const thumbSlot = el("div", { class: "thumb" }, thumbPlaceholder(platform));
    const parts: RowParts = {
      barSlot, qualitySlot, ops, stateSpan, msgSpan, titleSpan, thumbSlot, thumbTried: "",
      detachTip: null, tipCode: null,
    };
    const row = el(
      "div",
      { class: `task ${t.status}`, title: t.status === "done" ? tr("titlePlay") : undefined },
      thumbSlot,
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
    this.updateRow(row, t, parts);
    return { row, parts };
  }

  /** 第二行展示:作者 - 标题(TD-FE-021 参考图);无作者时只显示标题。 */
  private displayTitle(t: Task): string {
    const title = t.info?.title ?? t.url;
    const uploader = t.info?.uploader?.trim();
    return uploader && uploader !== title ? `${uploader} - ${title}` : title;
  }

  private updateRow(row: HTMLElement, t: Task, parts: RowParts) {
    row.className = `task ${t.status}`;
    // 下载完成:点击行进应用内播放器(TD-FE-025 改:不再丢给系统播放器)
    row.onclick = t.status === "done" && t.donePath ? () => this.cb.onPlay(t) : null;
    // 状态与错误信息随事件更新(E2E 发现的增量更新盲区)
    parts.stateSpan.replaceChildren(statusLabel(t.status));
    parts.stateSpan.className = `state ${t.status}`;
    parts.msgSpan.textContent = t.error ?? "";
    this.syncErrorTip(t, parts);
    parts.titleSpan.textContent = this.displayTitle(t);

    this.updateThumb(t, parts);

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
      parts.ops.append(iconBtn("play", tr("btnPlay"), () => this.cb.onPlay(t)));
      parts.ops.append(
        iconBtn("folder-open", tr("titleReveal"), () => void invoke("reveal_in_manager", { path: t.donePath }))
      );
    }
    if (running) {
      parts.ops.append(iconBtn("pause", tr("btnCancel"), () => this.cb.onCancel(t.id)));
    } else {
      // 解析中/待下载/终态都可移除(TD-FE-022):探测结果回来时任务已不在,handleEvent 自动忽略
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

  /**
   * 挂载/更新错误 tips（TD-PROBE-006）。
   *
   * 只在「有错误 + 有 code」时挂，且 code 变化才重挂——否则每次渲染都会
   * 新建一个泡泡监听器，旧的不解，事件监听与 DOM 节点一起泄漏
   * （错误节点是 keyed 增量渲染里被反复复用的）。
   */
  private syncErrorTip(t: Task, parts: RowParts) {
    const code = t.status === "failed" ? t.errorCode : null;
    if (parts.tipCode === code) return;
    parts.detachTip?.();
    parts.detachTip = null;
    parts.tipCode = code;
    if (code) parts.detachTip = attachErrorTip(parts.msgSpan, code, lang());
  }

  /**
   * 缩略图（TD-FE-024）。
   *
   * 优先级：完成态用**本地抽帧** > 远端封面 > 平台字母占位。
   *
   * 为什么完成态要换成抽帧：平台封面图常带防盗链（Referer/签名校验），
   * WebView 里 `<img>` 直接拉会稳定失败——用户看到的就是"下载完了却没缩略图"。
   * 本地文件已在磁盘上，ffmpeg 抽一帧不依赖网络、不可能被拦。
   *
   * 抽帧是异步且带一次 ffmpeg 开销，所以按路径去重（thumbTried），
   * 否则每次进度事件重渲染都会重跑一遍。
   */
  private updateThumb(t: Task, parts: RowParts) {
    const done = t.status === "done" && t.donePath;
    // 未完成态：远端封面能用就用（此时视频还没落盘，抽帧无从谈起）
    if (!done) {
      const url = t.info?.thumbnail;
      parts.thumbSlot.replaceChildren(
        url
          ? el("img", { src: httpToHttps(url), alt: "", loading: "lazy" })
          : thumbPlaceholder(this.platformOf(t.url))
      );
      return;
    }
    const path = t.donePath as string;
    if (parts.thumbTried === path) return;
    parts.thumbTried = path;
    const platform = this.platformOf(t.url);
    // 后端返回磁盘路径，这里转成 asset:// 才能被 <img> 加载（见 toAssetUrl 注释）
    void invoke<string>("video_thumbnail", { path })
      .then((diskPath) => toAssetUrl(diskPath))
      .then((url) => {
        // 任务可能已被移除/重试换了文件，过期结果不再上屏
        if (parts.thumbTried !== path) return;
        parts.thumbSlot.replaceChildren(el("img", { src: url, alt: "" }));
      })
      .catch(() => {
        // ffmpeg 缺失或抽帧失败：回落到远端封面，再退到占位，绝不留空洞
        if (parts.thumbTried !== path) return;
        const url = t.info?.thumbnail;
        parts.thumbSlot.replaceChildren(
          url
            ? el("img", { src: httpToHttps(url), alt: "", loading: "lazy" })
            : thumbPlaceholder(platform)
        );
      });
  }
}

/** 占位缩略图：平台首字母，认出"这是哪个平台" */
function thumbPlaceholder(platform: string | null): HTMLElement {
  return el("div", { class: "ph", text: platform ? platform[0] : "?" });
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

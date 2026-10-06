import { invoke, listen } from "../lib/ipc";
import type { ComponentStatus, FetchDone, FetchEvent } from "../lib/types";
import { formatBytes } from "../lib/types";
import { clear, el } from "./dom";

/**
 * 核心组件面板：组件状态徽标 + 按需下载入口 + 进度/失败提示。
 * 事件载荷自带组件名（FetchProgress.name），按 name 路由（TD-CORE-002）。
 */
export class CorePanelView {
  private progress = new Map<string, FetchEvent>();

  constructor(
    private container: HTMLElement,
    private onRefresh: () => void,
    private onOpenSettings: () => void
  ) {
    void this.watch();
  }

  private async watch() {
    await listen<FetchEvent>("core://progress", (payload) => {
      this.progress.set(payload.name, payload);
      this.renderCurrent();
    });
    await listen<FetchDone>("core://done", (payload) => {
      this.progress.delete(payload.name);
      this.onRefresh();
    });
  }

  private rows: ComponentStatus[] = [];

  render(statuses: ComponentStatus[]) {
    this.rows = statuses;
    this.renderCurrent();
  }

  private renderCurrent() {
    clear(this.container);
    for (const s of this.rows) {
      this.container.append(this.buildRow(s, this.progress.get(s.name)));
    }
    const blocking = this.rows.filter((s) => s.name === "yt-dlp" && ["missing", "outdated"].includes(s.state.state));
    if (blocking.length > 0) {
      this.container.append(el("div", { class: "core-hint", text: `需要 ${blocking[0].name} 才能开始下载视频。` }));
    }
  }

  private buildRow(status: ComponentStatus, progress: FetchEvent | undefined): HTMLElement {
    const st = status.state.state;
    const badge =
      st === "ready" || st === "readyExternal"
        ? { cls: "ok", text: (status.state as { version: string }).version }
        : st === "outdated"
          ? {
              cls: "warn",
              text: `${(status.state as { version: string }).version} → 需 ${(status.state as { required: string }).required}`,
            }
          : { cls: "err", text: "未安装" };

    const progSlot = el("div", { class: "core-prog-slot" });
    const ops = el("div", { class: "core-ops" });
    const row = el(
      "div",
      { class: "core-row" },
      el(
        "div",
        { class: "core-name" },
        el("span", { class: "dot" }),
        el("span", { text: status.name })
      ),
      el("span", { class: `badge ${badge.cls}`, text: badge.text }),
      progSlot,
      ops,
      status.hint ? el("div", { class: "core-note", text: status.hint }) : null
    );

    if (progress?.state === "running") {
      progSlot.append(
        el("span", { class: "core-prog" }, `${formatBytes(progress.received)}${progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ""} · ${progress.speedMbps.toFixed(1)} MB/s`)
      );
    }
    if (progress?.state === "failed") {
      progSlot.append(el("div", { class: "msg", text: progress.message }));
    }

    const downloadBtn =
      (st === "missing" || st === "outdated") && progress?.state !== "running"
        ? el("button", {
            class: "btn tiny",
            text: `${st === "missing" ? "下载" : "更新"}${status.downloadSize ? ` ${formatBytes(status.downloadSize)}` : ""}`,
            onclick: () => void invoke("fetch_component", { name: status.name }),
          })
        : null;
    if (downloadBtn) ops.append(downloadBtn);
    ops.append(
      el("button", { class: "btn tiny ghost", text: "指定", title: "手动指定路径", onclick: this.onOpenSettings })
    );
    return row;
  }
}

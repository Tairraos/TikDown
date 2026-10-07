import { invoke, listen } from "../lib/ipc";
import type { ComponentStatus, FetchDone, FetchEvent } from "../lib/types";
import { formatBytes } from "../lib/types";
import { t } from "../lib/i18n";
import { clear, el } from "./dom";

/**
 * 核心组件面板(用户要求极简,TD-FE-014):两个 tag——
 * 就绪 = 绿框「yt-dlp 勾」;未安装/版本过旧 = 红框「名 叉」。
 * 不显示版本号(见设置弹层)与常驻"指定"入口(在设置里)。
 * 未就绪保留下载/更新入口;组件下载失败显示一行原因。
 */
export class CorePanelView {
  private progress = new Map<string, FetchEvent>();
  private rows: ComponentStatus[] = [];

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

  render(statuses: ComponentStatus[]) {
    this.rows = statuses;
    this.renderCurrent();
  }

  private renderCurrent() {
    clear(this.container);
    for (const s of this.rows) {
      this.container.append(this.buildTag(s));
    }
    // 未就绪组件的下载入口 + 失败原因(保留最小操作面)
    for (const s of this.rows) {
      const st = s.state.state;
      const progress = this.progress.get(s.name);
      if ((st === "missing" || st === "outdated") && progress?.state !== "running") {
        this.container.append(
          el(
            "div",
            { class: "core-ops-row" },
            el("button", {
              class: "btn tiny",
              text: t("btnDownloadCore", { name: s.name, size: s.downloadSize ? `(${formatBytes(s.downloadSize)})` : "" }),
              onclick: () => void invoke("fetch_component", { name: s.name }),
            }),
            el("button", { class: "btn tiny ghost", text: t("btnSpecify"), onclick: this.onOpenSettings })
          )
        );
      }
      if (progress?.state === "running") {
        this.container.append(
          el("span", { class: "core-prog" }, t("coreDownloading", { name: s.name, received: formatBytes(progress.received), speed: progress.speedMbps.toFixed(1) }))
        );
      }
      if (progress?.state === "failed") {
        this.container.append(el("span", { class: "check-msg-text fail", text: progress.message }));
      }
    }
  }

  private buildTag(s: ComponentStatus): HTMLElement {
    const st = s.state.state;
    const ready = st === "ready" || st === "readyExternal";
    const title = ready
      ? t("ctagReady", { name: s.name })
      : t(st === "outdated" ? "ctagOutdated" : "ctagMissing", { name: s.name });
    return el("span", { class: `core-tag ${ready ? "ok" : "err"}`, title }, s.name, ready ? " ✓" : " ✗");
  }
}

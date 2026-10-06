import { open } from "@tauri-apps/plugin-dialog";
import type { ComponentStatus, Settings } from "../lib/types";
import { clear, el } from "./dom";

/**
 * 设置弹层：组件路径 / Cookie（规格见 docs/product-specs/cookie-access.md）/
 * 并发上限（默认 1，极限 4，用户决策）。
 */
export class SettingsPanelView {
  container: HTMLElement;

  constructor(
    parent: HTMLElement,
    private statuses: () => ComponentStatus[],
    private settings: () => Settings,
    private onChange: (s: Settings) => void,
    private onClose: () => void,
    private onRefresh: () => void
  ) {
    this.container = el("div", { class: "overlay" });
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) this.onClose();
    });
    parent.append(this.container);
  }

  render() {
    const c = this.container;
    clear(c);
    const s = this.settings();

    const sheet = el("div", { class: "sheet" });
    sheet.addEventListener("click", (e) => e.stopPropagation());
    c.append(sheet);

    sheet.append(el("h2", { text: "设置" }));

    // ---- 核心组件 ----
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "核心组件",
          el("span", { class: "set-note", text: "留空则使用 ~/.tikdown 下的副本，或自动查找系统已安装的版本" })
        ),
        this.pathRow("yt-dlp", this.versionOf("yt-dlp"), s.ytdlpPath, () => { void this.pickPath("ytdlpPath"); }, () => this.clearPath("ytdlpPath")),
        this.pathRow("ffmpeg", this.versionOf("ffmpeg"), s.ffmpegPath, () => { void this.pickPath("ffmpegPath"); }, () => this.clearPath("ffmpegPath"))
      )
    );

    // ---- Cookie ----
    const cookieBlock = el(
      "section",
      { class: "set-block" },
      el(
        "div",
        { class: "set-label" },
        "Cookie（登录墙内容）",
        el(
          "span",
          { class: "set-note" },
          "二选一：在常用浏览器里登录平台后选「浏览器登录态」；或用「Get cookies.txt LOCALLY」扩展导出后选「文件」。读取失败时先完全退出浏览器再试。隐私说明：登录态只在本机与 yt-dlp 之间传递，应用不保存不上传。"
        )
      )
    );
    cookieBlock.append(
      this.radioRow(
        "不使用 Cookie",
        s.cookieMode === "none",
        () => this.set({ ...s, cookieMode: "none" })
      )
    );
    const browserRow = el(
      "label",
      { class: "check" },
      (() => {
        const r = el("input", { type: "radio", name: "cookieMode" });
        r.checked = s.cookieMode === "browser";
        r.onchange = () => this.set({ ...s, cookieMode: "browser" });
        return r;
      })(),
      "读取浏览器登录态"
    );
    if (s.cookieMode === "browser") {
      const sel = el("select", {
        onchange: (e: Event) => this.set({ ...s, cookieBrowser: (e.target as HTMLSelectElement).value }),
      }) as HTMLSelectElement;
      for (const b of ["chrome", "firefox", "edge", "brave", "safari"]) {
        const opt = el("option", { value: b, text: b === "safari" ? "Safari（实验性）" : b[0].toUpperCase() + b.slice(1) });
        sel.append(opt);
      }
      sel.value = s.cookieBrowser;
      browserRow.append(sel);
    }
    cookieBlock.append(browserRow);
    const fileRow = el(
      "label",
      { class: "check" },
      (() => {
        const r = el("input", { type: "radio", name: "cookieMode" });
        r.checked = s.cookieMode === "file";
        r.onchange = () => this.set({ ...s, cookieMode: "file" });
        return r;
      })(),
      "cookies.txt 文件"
    );
    if (s.cookieMode === "file") {
      fileRow.append(
        el("span", { class: "path-custom", text: s.cookieFile ?? "未选择" }),
        el("button", { class: "btn tiny ghost", text: "选择…", onclick: () => void this.pickCookieFile() })
      );
    }
    cookieBlock.append(fileRow);
    sheet.append(cookieBlock);

    // ---- 并发上限 ----
    const num = el("input", { type: "number", min: "1", max: "4" }) as HTMLInputElement;
    num.value = String(s.maxConcurrent);
    num.onchange = () => {
      const v = Math.max(1, Math.min(4, Number(num.value) || 1));
      num.value = String(v);
      this.set({ ...s, maxConcurrent: v });
    };
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "并发下载上限",
          el("span", { class: "set-note", text: "同时进行的下载数（1–4），过高可能触发平台风控" })
        ),
        num
      )
    );

    // ---- 底部 ----
    sheet.append(
      el(
        "div",
        { class: "set-foot" },
        el("span", { class: "set-path", text: "组件目录：~/.tikdown" }),
        el("button", { class: "btn", text: "完成", onclick: this.onClose })
      )
    );
  }

  private set(s: Settings) {
    this.onChange(s);
    this.render(); // 重渲染以反映模式切换
  }

  private versionOf(name: string): string {
    const st = this.statuses().find((x) => x.name === name)?.state;
    if (!st) return "未检测到";
    return "version" in st ? String(st.version) : "未安装";
  }

  private async pickPath(key: "ytdlpPath" | "ffmpegPath") {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    this.set({ ...this.settings(), [key]: picked });
    this.onRefresh();
  }

  private clearPath(key: "ytdlpPath" | "ffmpegPath") {
    this.set({ ...this.settings(), [key]: null });
    this.onRefresh();
  }

  private async pickCookieFile() {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    this.set({ ...this.settings(), cookieMode: "file", cookieFile: picked });
  }

  private radioRow(label: string, checked: boolean, onChange: () => void): HTMLElement {
    const r = el("input", { type: "radio", name: "cookieMode" });
    r.checked = checked;
    r.onchange = onChange;
    return el("label", { class: "check" }, r, label);
  }

  private pathRow(
    label: string,
    version: string,
    value: string | null,
    onPick: () => void,
    onClear: () => void
  ): HTMLElement {
    return el(
      "div",
      { class: "path-row" },
      el(
        "div",
        { class: "path-info" },
        el("span", { class: "path-name", text: label }),
        el("span", { class: "path-ver", text: version }),
        value ? el("span", { class: "path-custom", text: value }) : null
      ),
      el(
        "div",
        { class: "path-ops" },
        el("button", { class: "btn tiny ghost", text: "选择…", onclick: onPick }),
        value ? el("button", { class: "btn tiny ghost", text: "清除", onclick: () => onClear() }) : null
      )
    );
  }
}

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "../lib/ipc";
import type { CheckResult, ComponentStatus, Settings } from "../lib/types";
import { clear, el } from "./dom";

type CheckName = "ytdlp" | "ffmpeg" | "dir";

type CheckState = {
  /** 输入框当前值(空 = 自动模式) */
  value: string;
  /** empty:无值;pending:有值未验证;checking:检测中;ok/fail:已验证 */
  status: "empty" | "pending" | "checking" | "ok" | "fail";
  message: string;
  /** 该行的「检测」按钮(verify 中禁用,防重复点击) */
  checkBtn?: HTMLButtonElement;
};

/**
 * 设置弹层（v1 交互 + 手贴路径门禁,TD-FE-010）:
 * - yt-dlp/ffmpeg/下载目录都支持**手贴地址**（/opt 等 Finder 不可见路径）+ 检测按钮
 * - **检测不通过不允许关闭**:点完成或点弹层外时,未验证的路径自动检测,
 *   任何失败都会把弹层留在屏幕上并显示原因
 * - 检测通过立即保存;清空 = 回落自动探测
 * - Cookie 三选项同一行（规格见 docs/product-specs/cookie-access.md）
 * - 并发上限默认 1、极限 4（用户决策）
 */
export class SettingsPanelView {
  container: HTMLElement;
  private pathStates: Record<CheckName, CheckState>;

  constructor(
    parent: HTMLElement,
    private statuses: () => ComponentStatus[],
    private settings: () => Settings,
    private targetDir: () => string,
    private onTargetDir: (d: string) => void,
    private onChange: (s: Settings) => void,
    private onClose: () => void,
    private onRefresh: () => void
  ) {
    this.container = el("div", { class: "overlay" });
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) void this.attemptClose();
    });
    this.pathStates = {
      ytdlp: this.initState(settings().ytdlpPath ?? ""),
      ffmpeg: this.initState(settings().ffmpegPath ?? ""),
      dir: this.initState(targetDir()),
    };
    parent.append(this.container);
  }

  private initState(value: string): CheckState {
    return { value, status: value === "" ? "empty" : "ok", message: "" };
  }

  render() {
    const c = this.container;
    clear(c);
    const s = this.settings();

    const sheet = el("div", { class: "sheet" });
    sheet.addEventListener("click", (e) => e.stopPropagation());
    c.append(sheet);

    sheet.append(el("h2", { text: "设置" }));

    // ---- 下载目录 ----
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "下载目录",
          el("span", { class: "set-note", text: "可直接粘贴地址（Finder 打不开的目录如 /opt 也可以）" })
        ),
        this.buildCheckRow("dir", "位置", this.versionOfDir()),
        this.checkMsgRow("dir")
      )
    );

    // ---- 核心组件 ----
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "核心组件",
          el("span", { class: "set-note", text: "留空则按 系统 PATH → ~/.tikdown 副本 自动查找；可粘贴地址后点「检测」" })
        ),
        this.buildCheckRow("ytdlp", "yt-dlp", this.versionOf("yt-dlp"), true),
        this.checkMsgRow("ytdlp"),
        this.buildCheckRow("ffmpeg", "ffmpeg", this.versionOf("ffmpeg"), true),
        this.checkMsgRow("ffmpeg")
      )
    );

    // ---- Cookie(三选项同一行,用户要求) ----
    const cookieRow = el("div", { class: "cookie-row" });
    cookieRow.append(this.radio("不使用", s.cookieMode === "none", () => this.set({ ...s, cookieMode: "none" })));
    const browserRadio = this.radio("浏览器登录态", s.cookieMode === "browser", () =>
      this.set({ ...s, cookieMode: "browser" })
    );
    if (s.cookieMode === "browser") {
      const sel = el("select", {
        onchange: (e: Event) => this.set({ ...s, cookieBrowser: (e.target as HTMLSelectElement).value }),
      }) as HTMLSelectElement;
      for (const b of ["chrome", "firefox", "edge", "brave", "safari"]) {
        sel.append(el("option", { value: b, text: b === "safari" ? "Safari(实验)" : b[0].toUpperCase() + b.slice(1) }));
      }
      sel.value = s.cookieBrowser;
      browserRadio.append(sel);
    }
    cookieRow.append(browserRadio);
    const fileRadio = this.radio("cookies.txt", s.cookieMode === "file", () => this.set({ ...s, cookieMode: "file" }));
    if (s.cookieMode === "file") {
      fileRadio.append(
        el("button", { class: "btn tiny ghost", text: "选择文件…", onclick: () => void this.pickCookieFile() })
      );
    }
    cookieRow.append(fileRadio);
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "Cookie（登录墙内容）",
          el(
            "span",
            { class: "set-note" },
            "二选一:常用浏览器登录平台后选「浏览器登录态」;或用「Get cookies.txt LOCALLY」扩展导出后选文件。读取失败先完全退出浏览器再试。登录态只在本机与 yt-dlp 间传递,不保存不上传。"
          )
        ),
        cookieRow
      )
    );

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

    // ---- 底部:完成 = 关闭门禁入口 ----
    const doneBtn = el("button", { class: "btn", text: "完成", onclick: () => void this.attemptClose() });
    this.doneBtn = doneBtn;
    sheet.append(
      el("div", { class: "set-foot" }, el("span", { class: "set-path", text: "组件目录：~/.tikdown" }), doneBtn)
    );
  }

  private doneBtn: HTMLButtonElement | null = null;

  // ---- 路径检测行 ----

  private buildCheckRow(name: CheckName, label: string, info: string, withFilePicker = false): HTMLElement {
    const st = this.pathStates[name];
    const input = el("input", {
      class: "check-input",
      placeholder: "粘贴完整路径,或点「选择…」",
      spellcheck: "false",
    }) as HTMLInputElement;
    input.value = st.value;
    input.oninput = () => {
      st.value = input.value.trim();
      st.status = st.value === "" ? "empty" : "pending";
      st.message = "";
      this.updateMsgRow(name);
    };

    const checkBtn = el("button", {
      class: "btn tiny",
      text: "检测",
      onclick: () => void this.verify(name),
    });
    st.checkBtn = checkBtn;

    const ops = el("div", { class: "path-ops" }, checkBtn);
    if (withFilePicker) {
      ops.append(
        el("button", {
          class: "btn tiny ghost",
          text: "选择…",
          onclick: () => void this.pickFile(name),
        })
      );
    }

    const row = el(
      "div",
      { class: "path-row" },
      el(
        "div",
        { class: "path-info" },
        el("span", { class: "path-name" }, label, el("span", { class: "path-ver", text: info ? ` · ${info}` : "" }))
      ),
      input,
      ops
    );
    // 清除(检测通过后才出现清除,避免误触丢已验证配置)
    if (st.value !== "" && st.status === "ok") {
      ops.append(
        el("button", {
          class: "btn tiny ghost",
          text: "清除",
          onclick: () => {
            st.value = "";
            st.status = "empty";
            st.message = "";
            this.saveChecked(name);
            this.render();
          },
        })
      );
    }
    return row;
  }

  private msgRows: Partial<Record<CheckName, HTMLElement>> = {};

  private checkMsgRow(name: CheckName): HTMLElement {
    const row = el("div", { class: "check-msg" });
    this.msgRows[name] = row;
    this.updateMsgRow(name);
    return row;
  }

  private updateMsgRow(name: CheckName) {
    const row = this.msgRows[name];
    if (!row) return;
    const st = this.pathStates[name];
    clear(row);
    if (st.status === "empty") return;
    const cls = st.status === "ok" ? "ok" : st.status === "fail" ? "fail" : "dim";
    const text =
      st.status === "pending"
        ? "未检测——关闭前会自动检测"
        : st.status === "checking"
          ? "检测中…"
          : st.message;
    row.append(el("span", { class: `check-msg-text ${cls}`, text }));
  }

  /** 检测一行:通过即保存,失败标红并阻止关闭。返回是否通过。 */
  private async verify(name: CheckName): Promise<boolean> {
    const st = this.pathStates[name];
    if (st.value === "") {
      st.status = "empty";
      this.saveChecked(name);
      return true;
    }
    st.status = "checking";
    st.message = "";
    this.updateMsgRow(name);
    if (st.checkBtn) st.checkBtn.disabled = true;
    this.setDoneBusy(true);

    const apiName = name === "dir" ? "download-dir" : name;
    let res: CheckResult;
    try {
      res = await invoke<CheckResult>("check_component", { name: apiName, path: st.value });
    } catch (e) {
      res = { ok: false, version: null, message: String(e) };
    }

    if (st.checkBtn) st.checkBtn.disabled = false;
    this.setDoneBusy(false);
    st.status = res.ok ? "ok" : "fail";
    st.message = res.message;
    if (res.ok) this.saveChecked(name);
    this.updateMsgRow(name);
    this.render(); // 通过后出现「清除」按钮
    return res.ok;
  }

  private saveChecked(name: CheckName) {
    const st = this.pathStates[name];
    if (name === "dir") {
      this.onTargetDir(st.status === "empty" ? "" : st.value);
    } else {
      const key = name === "ytdlp" ? "ytdlpPath" : "ffmpegPath";
      this.onChange({ ...this.settings(), [key]: st.status === "empty" ? null : st.value });
    }
    this.onRefresh();
  }

  /** 关闭门禁:所有有值但未通过的行先检测;存在失败 → 弹层留在屏幕上 */
  private async attemptClose() {
    const names: CheckName[] = ["dir", "ytdlp", "ffmpeg"];
    const pending = names.filter((n) => {
      const st = this.pathStates[n];
      return st.value !== "" && st.status !== "ok" && st.status !== "checking";
    });
    if (pending.length > 0) {
      await Promise.all(pending.map((n) => this.verify(n)));
    }
    const checking = names.some((n) => this.pathStates[n].status === "checking");
    if (checking) return; // 已有检测在跑(理论不可达,防御)
    const failed = names.some((n) => {
      const st = this.pathStates[n];
      return st.value !== "" && st.status !== "ok";
    });
    if (failed) {
      this.render();
      return;
    }
    this.onClose();
  }

  private setDoneBusy(busy: boolean) {
    if (this.doneBtn) {
      this.doneBtn.disabled = busy;
      this.doneBtn.textContent = busy ? "检测中…" : "完成";
    }
  }

  private async pickFile(name: CheckName) {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    const st = this.pathStates[name];
    st.value = picked;
    st.status = "pending";
    await this.verify(name); // 选择器选完立即检测,结果上屏
  }

  private async pickCookieFile() {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    this.set({ ...this.settings(), cookieMode: "file" });
  }

  private set(s: Settings) {
    this.onChange(s);
    this.render();
  }

  private versionOf(name: string): string {
    const st = this.statuses().find((x) => x.name === name)?.state;
    if (!st) return "未检测到";
    return "version" in st ? String(st.version) : "未安装";
  }

  private versionOfDir(): string {
    const d = this.targetDir();
    return d ? "已设置" : "未设置";
  }

  private radio(label: string, checked: boolean, onChange: () => void): HTMLElement {
    const r = el("input", { type: "radio", name: "cookieMode" });
    r.checked = checked;
    r.onchange = onChange;
    return el("label", { class: "check" }, r, label);
  }
}

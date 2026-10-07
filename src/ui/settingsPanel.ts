import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "../lib/ipc";
import type { CheckResult, ComponentStatus, Language, Settings } from "../lib/types";
import { t } from "../lib/i18n";
import { initCheckState, type CheckState } from "./checkState";
import { buildPathCheckRow, type PathCheckRowHandle } from "./pathCheckRow";
import { clear, el } from "./dom";

type CheckName = "dir" | "ytdlp" | "ffmpeg";

/**
 * 设置弹层（v1 交互 + 手贴路径门禁,TD-FE-010/011）:
 * - yt-dlp/ffmpeg/下载目录都支持**手贴地址**（/opt 等 Finder 不可见路径）+ 检测按钮
 * - **探测到的路径自动回填输入框**并标注来源;用户编辑后不再被覆盖,「清除」回到自动跟随
 * - **检测不通过不允许关闭**:点完成或点弹层外时,未验证的路径自动检测,
 *   任何失败都会把弹层留在屏幕上并显示原因;检测通过立即保存
 * - Cookie 三选项同一行;并发上限默认 1、极限 4（用户决策）
 * - 语言三选项（TD-FE-019）:跟随系统/中文/English,默认跟随系统
 */
export class SettingsPanelView {
  container: HTMLElement;
  private pathStates: Record<CheckName, CheckState>;
  private rows: Partial<Record<CheckName, PathCheckRowHandle>> = {};
  private doneBtn: HTMLButtonElement | null = null;

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
      ytdlp: initCheckState(settings().ytdlpPath ?? ""),
      ffmpeg: initCheckState(settings().ffmpegPath ?? ""),
      dir: initCheckState(targetDir()),
    };
    parent.append(this.container);
  }

  /**
   * 自动探测结果回填输入框（TD-FE-011）:组件被探测到（无论来源）就把实际使用的
   * 路径写进输入框——它已经过 core_status 的版本门槛。用户编辑过（userTouched）
   * 后不再覆盖;点「清除」重置 userTouched 即回到自动跟随。
   * 注意:内部 key（ytdlp）与组件真名（yt-dlp）不同,查 statuses 必须经 apiName 映射。
   */
  private syncAutoState(name: Exclude<CheckName, "dir">) {
    const st = this.pathStates[name];
    if (st.userTouched) return;
    const apiName = name === "ytdlp" ? "yt-dlp" : name;
    const s = this.statuses().find((x) => x.name === apiName)?.state;
    if (!s || s.state === "missing") {
      st.value = "";
      st.auto = true;
      st.status = "empty";
      st.message = "";
      return;
    }
    if (s.state === "ready" || s.state === "readyExternal") {
      const src =
        "source" in s
          ? ({ managed: t("srcManaged"), configured: t("srcConfigured"), systemPath: t("srcSystemPath") } as Record<string, string>)[
              s.source as string
            ] ?? t("srcUnknown")
          : t("srcUnknown");
      st.value = s.path;
      st.auto = true;
      st.status = "ok";
      st.message = t("autoDetectMsg", { src });
    } else if (s.state === "outdated") {
      st.value = s.path;
      st.auto = true;
      st.status = "fail";
      st.message = t("outdatedMsg", { v: s.version, r: s.required });
    }
  }

  render() {
    this.syncAutoState("ytdlp");
    this.syncAutoState("ffmpeg");
    const c = this.container;
    clear(c);
    const s = this.settings();

    const sheet = el("div", { class: "sheet" });
    sheet.addEventListener("click", (e) => e.stopPropagation());
    c.append(sheet);

    sheet.append(el("h2", { text: t("setTitle") }));

    // ---- 下载目录 ----
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el("div", { class: "set-label" }, t("secDir"), el("span", { class: "set-note", text: t("dirNote") })),
        this.buildRow("dir", t("locLabel"), this.targetDir() ? t("dirSet") : t("dirUnset")).row,
        this.rows.dir?.msgRow ?? el("div")
      )
    );

    // ---- 核心组件 ----
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el("div", { class: "set-label" }, t("secCore"), el("span", { class: "set-note", text: t("coreNote") })),
        this.buildRow("ytdlp", "yt-dlp", this.versionOf("yt-dlp"), true).row,
        this.rows.ytdlp?.msgRow ?? el("div"),
        this.buildRow("ffmpeg", "ffmpeg", this.versionOf("ffmpeg"), true).row,
        this.rows.ffmpeg?.msgRow ?? el("div")
      )
    );

    // ---- Cookie(三选项同一行,用户要求) ----
    const cookieRow = el("div", { class: "cookie-row" });
    cookieRow.append(this.radio("cookieMode", t("cookieNone"), s.cookieMode === "none", () => this.set({ ...s, cookieMode: "none" })));
    const browserRadio = this.radio("cookieMode", t("cookieBrowser"), s.cookieMode === "browser", () =>
      this.set({ ...s, cookieMode: "browser" })
    );
    if (s.cookieMode === "browser") {
      const sel = el("select", {
        onchange: (e: Event) => this.set({ ...s, cookieBrowser: (e.target as HTMLSelectElement).value }),
      }) as HTMLSelectElement;
      for (const b of ["chrome", "firefox", "edge", "brave", "safari"]) {
        sel.append(el("option", { value: b, text: b === "safari" ? t("safariExp") : b[0].toUpperCase() + b.slice(1) }));
      }
      sel.value = s.cookieBrowser;
      browserRadio.append(sel);
    }
    cookieRow.append(browserRadio);
    const fileRadio = this.radio("cookieMode", "cookies.txt", s.cookieMode === "file", () => this.set({ ...s, cookieMode: "file" }));
    if (s.cookieMode === "file") {
      fileRadio.append(el("button", { class: "btn tiny ghost", text: t("btnChooseFile"), onclick: () => void this.pickCookieFile() }));
    }
    cookieRow.append(fileRadio);
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el("div", { class: "set-label" }, t("secCookie"), el("span", { class: "set-note", text: t("cookieNote") })),
        cookieRow
      )
    );

    // ---- 优先分辨率(TD-FE-015) ----
    const qualityRow = el("div", { class: "cookie-row" });
    for (const q of ["原画", "4K", "1080P", "720P"] as const) {
      // 设置值保持中文枚举(与后端 -S res 参数、已存 localStorage 兼容),文案仅"原画"需翻译
      qualityRow.append(this.radio("preferredQuality", q === "原画" ? t("qOriginal") : q, s.preferredQuality === q, () => this.set({ ...s, preferredQuality: q })));
    }
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el("div", { class: "set-label" }, t("secQuality"), el("span", { class: "set-note", text: t("qualityNote") })),
        qualityRow
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
        el("div", { class: "set-label" }, t("secConcurrency"), el("span", { class: "set-note", text: t("concurrencyNote") })),
        num
      )
    );

    // ---- 语言(TD-FE-019):跟随系统/中文/English,默认跟随系统 ----
    const langRow = el("div", { class: "cookie-row" });
    const langs: { value: Language; label: string }[] = [
      { value: "system", label: t("langSystem") },
      { value: "zh", label: t("langZh") },
      { value: "en", label: t("langEn") },
    ];
    for (const l of langs) {
      langRow.append(this.radio("language", l.label, s.language === l.value, () => this.set({ ...s, language: l.value })));
    }
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el("div", { class: "set-label" }, t("secLanguage"), el("span", { class: "set-note", text: t("langSystem") + " / zh / en" })),
        langRow
      )
    );

    // ---- 底部:完成 = 关闭门禁入口 ----
    this.doneBtn = el("button", { class: "btn", text: t("btnDone"), onclick: () => void this.attemptClose() });
    sheet.append(el("div", { class: "set-foot" }, el("span", { class: "set-path", text: t("footComponents") }), this.doneBtn));
  }

  private buildRow(name: CheckName, label: string, info = "", withFilePicker = false): PathCheckRowHandle {
    const handle = buildPathCheckRow({
      name,
      label,
      info,
      state: this.pathStates[name],
      onInput: () => {},
      onVerify: () => void this.verify(name),
      onPickFile: withFilePicker ? () => void this.pickFile(name) : undefined,
      onClear: () => {
        this.pathStates[name] = initCheckState("");
        this.saveChecked(name);
        this.render(); // userTouched 重置,自动探测回显接管
      },
    });
    this.rows[name] = handle;
    return handle;
  }

  /** 检测一行:通过即保存,失败标红并阻止关闭。返回是否通过。 */
  private async verify(name: CheckName): Promise<boolean> {
    const st = this.pathStates[name];
    st.auto = false; // 主动检测 = 接管该路径(不再被自动回显覆盖)
    if (st.value === "") {
      st.status = "empty";
      this.saveChecked(name);
      this.rows[name]?.updateMsg();
      return true;
    }
    st.status = "checking";
    st.message = "";
    this.rows[name]?.updateMsg();
    if (st.checkBtn) st.checkBtn.disabled = true;
    this.setDoneBusy(true);

    // 内部 key（ytdlp/dir）与后端检测对象名（yt-dlp/download-dir）映射
    const apiName = name === "dir" ? "download-dir" : name === "ytdlp" ? "yt-dlp" : name;
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
    this.rows[name]?.updateMsg();
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
      return st.value !== "" && st.status !== "ok" && !st.auto;
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
      this.doneBtn.textContent = busy ? t("btnChecking") : t("btnDone");
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
    if (!st) return t("notDetected");
    return "version" in st ? String(st.version) : t("notInstalled");
  }

  private radio(name: string, label: string, checked: boolean, onChange: () => void): HTMLElement {
    const r = el("input", { type: "radio", name });
    r.checked = checked;
    r.onchange = onChange;
    return el("label", { class: "check" }, r, label);
  }
}

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "../lib/ipc";
import type { CheckResult, ComponentStatus, Settings } from "../lib/types";
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
      const sourceCn =
        "source" in s
          ? ({ managed: "应用副本", configured: "手动指定", systemPath: "系统 PATH" } as Record<string, string>)[
              s.source as string
            ] ?? ""
          : "";
      st.value = s.path;
      st.auto = true;
      st.status = "ok";
      st.message = `自动探测(来源:${sourceCn || "未知"})`;
    } else if (s.state === "outdated") {
      st.value = s.path;
      st.auto = true;
      st.status = "fail";
      st.message = `系统版本 ${s.version} 低于要求 ${s.required},当前使用 ~/.tikdown 副本;如需强制使用请更换路径后点「检测」`;
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
        this.buildRow("dir", "位置", this.targetDir() ? "已设置" : "未设置").row,
        this.rows.dir?.msgRow ?? el("div")
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
        this.buildRow("ytdlp", "yt-dlp", this.versionOf("yt-dlp"), true).row,
        this.rows.ytdlp?.msgRow ?? el("div"),
        this.buildRow("ffmpeg", "ffmpeg", this.versionOf("ffmpeg"), true).row,
        this.rows.ffmpeg?.msgRow ?? el("div")
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
      fileRadio.append(el("button", { class: "btn tiny ghost", text: "选择文件…", onclick: () => void this.pickCookieFile() }));
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

    // ---- 优先分辨率(TD-FE-015) ----
    const qualityRow = el("div", { class: "cookie-row" });
    for (const q of ["原画", "4K", "1080P", "720P"] as const) {
      qualityRow.append(
        this.radio(q, s.preferredQuality === q, () => this.set({ ...s, preferredQuality: q }))
      );
    }
    sheet.append(
      el(
        "section",
        { class: "set-block" },
        el(
          "div",
          { class: "set-label" },
          "优先下载分辨率",
          el("span", { class: "set-note", text: "画质可选的源按最接近此高度下载;任务里手动选过画质则以手动为准" })
        ),
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
    this.doneBtn = el("button", { class: "btn", text: "完成", onclick: () => void this.attemptClose() });
    sheet.append(
      el("div", { class: "set-foot" }, el("span", { class: "set-path", text: "组件目录：~/.tikdown" }), this.doneBtn)
    );
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

  private radio(label: string, checked: boolean, onChange: () => void): HTMLElement {
    const r = el("input", { type: "radio", name: "cookieMode" });
    r.checked = checked;
    r.onchange = onChange;
    return el("label", { class: "check" }, r, label);
  }
}

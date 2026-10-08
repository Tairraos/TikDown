import { invoke, toAssetUrl } from "../lib/ipc";
import { t as tr } from "../lib/i18n";
import { clear, el } from "./dom";

/**
 * 应用内视频预览弹窗（TD-FE-025）。
 *
 * 为什么自己起播放器而不丢给系统：丢给 `open` 会跳出应用、丢失下载上下文，
 * 用户看完还要切回来；应用内 `<video>` 能连着列表看下一条。
 *
 * 关键取舍：**用 asset:// 直读本地文件**而不是把字节读进 JS 变成 blob URL。
 * 视频动辄几十上百 MB，走 IPC 读进前端会占一份内存、还要自己实现 Range
 * 才能拖进度条；asset protocol 原生支持 206（tauri protocol/asset.rs），
 * 拖动与按需读取都由它处理。
 *
 * 已知限制：WKWebView 只能解自己支持的编码。若视频是 WebM/AV1 之类装不下的
 * 格式，`video.onerror` 会触发——此时给出「用系统播放器打开」的出口，
 * 而不是让用户对着黑屏发呆。
 */
export class VideoPlayerView {
  container: HTMLElement;
  private video: HTMLVideoElement;
  private statusLine: HTMLElement;

  constructor(
    parent: HTMLElement,
    private path: string,
    title: string,
    private onClose: () => void
  ) {
    this.video = el("video", { class: "player-video", controls: true, preload: "metadata" });
    this.video.addEventListener("error", () => this.showDecodeError());

    const closeBtn = el(
      "button",
      { class: "icon-btn player-close", "aria-label": tr("playerClose"), onclick: () => this.close() },
      el("span", { class: "player-x", text: "✕" })
    );
    this.statusLine = el("div", { class: "player-status" });

    const head = el(
      "div",
      { class: "player-head", "data-tauri-drag-region": "deep" },
      el("div", { class: "player-titles" },
        el("div", { class: "player-title", text: title }),
        el("div", { class: "player-sub", text: shortName(path) })
      ),
      closeBtn
    );

    const revealBtn = el("button", {
      class: "btn small",
      text: tr("titleReveal"),
      onclick: () => void invoke("reveal_in_manager", { path }),
    });
    const externalBtn = el("button", {
      class: "btn small",
      text: tr("btnOpenExternal"),
      onclick: () => void invoke("open_with_system", { path }),
    });
    const foot = el(
      "div",
      { class: "player-foot" },
      this.statusLine,
      el("div", { class: "player-btns" }, revealBtn, externalBtn)
    );

    this.container = el(
      "div",
      { class: "overlay player-overlay" },
      el(
        "div",
        { class: "sheet player-sheet", onclick: (e) => e.stopPropagation() },
        head,
        el("div", { class: "player-stage" }, this.video),
        foot
      )
    );
    // 点遮罩关闭（与设置弹层一致的手感）
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) this.close();
    });
    // Esc 关闭：键盘可达性，不绑在具体按钮上
    this.onKey = (e) => {
      if (e.key === "Escape") this.close();
    };
    document.addEventListener("keydown", this.onKey);

    parent.append(this.container);
    void this.load();
  }

  private onKey: ((e: KeyboardEvent) => void) | null = null;

  /** 取可播放 URL 并自动起播；拿不到就走系统播放器兜底。 */
  private async load() {
    try {
      // 后端返回磁盘路径（并已放入 asset scope），转 asset:// 才能被 <video> 加载
      const diskPath = await invoke<string>("local_media_url", { path: this.path });
      this.video.src = await toAssetUrl(diskPath);
      // autoplay 带 playsinline：Chromium/WebKit 在部分策略下会拒纯 autoplay，
      // 被拒也不影响用户手动点播放，这里不静默吞掉——状态行会提示。
      void this.video.play().catch(() => {
        this.statusLine.textContent = tr("playerTapToPlay");
      });
    } catch {
      this.showDecodeError();
    }
  }

  /** 解码失败/文件不可读：不留黑屏，给出去处。 */
  private showDecodeError() {
    clear(this.statusLine);
    this.statusLine.append(
      el("span", { class: "player-err", text: tr("playerCannotPlay") }),
      el("button", {
        class: "btn tiny",
        text: tr("btnOpenExternal"),
        onclick: () => void invoke("open_with_system", { path: this.path }),
      })
    );
  }

  close() {
    // 关闭必须彻底：暂停 + 清 src + 摘监听，否则关掉的视频还在后台解码。
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    if (this.onKey) document.removeEventListener("keydown", this.onKey);
    this.onKey = null;
    this.container.remove();
    this.onClose();
  }
}

/** 弹层标题栏只显示文件名，全路径太长会挤掉按钮 */
function shortName(p: string): string {
  const parts = p.split(/[/\\]/);
  const name = parts[parts.length - 1] || p;
  const parent = parts[parts.length - 2];
  return parent ? `${parent}/${name}` : name;
}
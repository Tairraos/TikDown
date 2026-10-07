/**
 * 极简 i18n：zh/en 两份扁平字典 + t() 取词（带 {name} 插值）。
 * 语言设置存于 Settings.language（system/zh/en，默认 system，仅前端使用）；
 * system 跟随 navigator.language。字典 key 必须两份齐全（单测锁定）。
 */
import type { Language } from "./types";

export type Lang = Language;
export type ResolvedLang = "zh" | "en";

const zh: Record<string, string> = {
  // 侧栏
  pasteDownload: "粘贴/下载",
  pasteTitle: "读取剪贴板并解析（支持一次多条链接）",
  settings: "设置",
  stat7dTotal: "7天/总下载次数",
  reset: "重置",
  resetTitle: "清零下载计数",
  diskFree: "系统剩余空间",
  themeToDark: "切换到黑色主题",
  themeToLight: "切换到白色主题",
  // 空态
  emptyHint: "点击右上角「粘贴/下载」添加链接，图文帖会自动跳过。",
  // 任务状态
  "status.pending": "等待",
  "status.probing": "解析中",
  "status.ready": "待下载",
  "status.downloading": "下载中",
  "status.merging": "合并中",
  "status.done": "下载完成",
  "status.failed": "失败",
  "status.skipped": "已跳过",
  // 队列汇总
  qReady: "待下载",
  qActive: "下载中",
  qDone: "完成",
  qFailed: "失败",
  qSkipped: "已跳过",
  // 任务行
  btnDownload: "下载",
  btnRetry: "重试",
  btnCancel: "取消",
  btnLocate: "定位",
  btnRemove: "移除",
  btnPlay: "播放",
  chipBest: "最佳",
  elapsed: "用时 {n}秒",
  titlePlay: "点击播放",
  titleReveal: "在文件管理器中显示",
  // 消息
  msgNoLink: "剪贴板里没有链接。复制视频链接后再点「粘贴/下载」。",
  msgAdded: "已添加 {n} 个新任务，图文帖会自动跳过。",
  msgNoNew: "没有发现新链接（可能已添加过）。",
  msgRemoved: "已移除 {n} 个任务。",
  msgCoreNotReady: "核心组件未就绪：请先安装 yt-dlp。",
  msgParseFailed: "解析失败：{msg}",
  msgImageOnly: "该内容为图文，没有可下载的视频",
  msgChooseDir: "请先在设置里选择下载目录",
  msgDownloadFailed: "下载失败",
  msgCancelled: "已取消",
  // 组件 tag（状态栏）
  ctagReady: "{name} 就绪",
  ctagMissing: "{name} 未安装",
  ctagOutdated: "{name} 版本过旧",
  btnDownloadCore: "下载 {name}{size}",
  btnSpecify: "手动指定路径…",
  coreDownloading: "下载 {name} {received} · {speed} MB/s",
  // 设置弹层
  setTitle: "设置",
  secDir: "下载目录",
  dirNote: "可直接粘贴地址（Finder 打不开的目录如 /opt 也可以）",
  locLabel: "位置",
  dirSet: "已设置",
  dirUnset: "未设置",
  secCore: "核心组件",
  coreNote: "留空则按 系统 PATH → ~/.tikdown 副本 自动查找；可粘贴地址后点「检测」",
  btnCheck: "检测",
  btnChecking: "检测中…",
  btnClear: "清除",
  btnChooseFile: "选择文件…",
  btnDone: "完成",
  secCookie: "Cookie（登录墙内容）",
  cookieNote:
    "二选一:常用浏览器登录平台后选「浏览器登录态」;或用「Get cookies.txt LOCALLY」扩展导出后选文件。读取失败先完全退出浏览器再试。登录态只在本机与 yt-dlp 间传递,不保存不上传。",
  cookieNone: "不使用",
  cookieBrowser: "浏览器登录态",
  safariExp: "Safari(实验)",
  secQuality: "优先下载分辨率",
  qualityNote: "画质可选的源按最接近此高度下载；任务里手动选过画质则以手动为准",
  qOriginal: "原画",
  secConcurrency: "并发下载上限",
  concurrencyNote: "同时进行的下载数（1–4），过高可能触发平台风控",
  secLanguage: "语言 / Language",
  langSystem: "跟随系统",
  langZh: "中文",
  langEn: "English",
  footComponents: "组件目录：~/.tikdown",
  notDetected: "未检测到",
  notInstalled: "未安装",
  autoDetectMsg: "自动探测(来源:{src})",
  srcManaged: "应用副本",
  srcConfigured: "手动指定",
  srcSystemPath: "系统 PATH",
  srcUnknown: "未知",
  outdatedMsg:
    "系统版本 {v} 低于要求 {r}，当前使用 ~/.tikdown 副本；如需强制使用请更换路径后点「检测」",
};

const en: Record<string, string> = {
  pasteDownload: "Paste & Download",
  pasteTitle: "Read the clipboard and parse (multiple links supported)",
  settings: "Settings",
  stat7dTotal: "7-day / total downloads",
  reset: "Reset",
  resetTitle: "Reset download counters",
  diskFree: "Free space",
  themeToDark: "Switch to dark theme",
  themeToLight: "Switch to light theme",
  emptyHint: "Click「Paste & Download」at the top-right to add links. Image-only posts are skipped.",
  "status.pending": "Queued",
  "status.probing": "Probing",
  "status.ready": "Ready",
  "status.downloading": "Downloading",
  "status.merging": "Merging",
  "status.done": "Completed",
  "status.failed": "Failed",
  "status.skipped": "Skipped",
  qReady: "Ready",
  qActive: "Active",
  qDone: "Done",
  qFailed: "Failed",
  qSkipped: "Skipped",
  btnDownload: "Download",
  btnRetry: "Retry",
  btnCancel: "Cancel",
  btnLocate: "Reveal",
  btnRemove: "Remove",
  btnPlay: "Play",
  chipBest: "Best",
  elapsed: "{n}s",
  titlePlay: "Click to play",
  titleReveal: "Show in file manager",
  msgNoLink: "No links in the clipboard. Copy a video link, then click「Paste & Download」.",
  msgAdded: "Added {n} new task(s). Image-only posts are skipped automatically.",
  msgNoNew: "No new links found (they may already be added).",
  msgRemoved: "Removed {n} task(s).",
  msgCoreNotReady: "Core components not ready: install yt-dlp first.",
  msgParseFailed: "Parse failed: {msg}",
  msgImageOnly: "Image-only post — no video to download",
  msgChooseDir: "Choose a download directory in Settings first",
  msgDownloadFailed: "Download failed",
  msgCancelled: "Cancelled",
  ctagReady: "{name} ready",
  ctagMissing: "{name} missing",
  ctagOutdated: "{name} outdated",
  btnDownloadCore: "Download {name}{size}",
  btnSpecify: "Specify path…",
  coreDownloading: "Downloading {name} {received} · {speed} MB/s",
  setTitle: "Settings",
  secDir: "Download directory",
  dirNote: "Paste a path directly (works for folders Finder can't open, e.g. /opt)",
  locLabel: "Location",
  dirSet: "Set",
  dirUnset: "Not set",
  secCore: "Core components",
  coreNote: "Leave empty to auto-find (system PATH → ~/.tikdown copy); or paste a path and click Check",
  btnCheck: "Check",
  btnChecking: "Checking…",
  btnClear: "Clear",
  btnChooseFile: "Choose file…",
  btnDone: "Done",
  secCookie: "Cookies (login-walled content)",
  cookieNote:
    "Pick one: log into the platform in your usual browser and choose Browser cookies; or export with the Get cookies.txt LOCALLY extension and pick the file. If reading fails, fully quit the browser and retry. Cookies stay on this machine and only pass to yt-dlp — never stored or uploaded.",
  cookieNone: "None",
  cookieBrowser: "Browser cookies",
  safariExp: "Safari (experimental)",
  secQuality: "Preferred resolution",
  qualityNote: "Sources with selectable qualities download at the closest height to this; a per-task manual pick always wins",
  qOriginal: "Best",
  secConcurrency: "Concurrent downloads",
  concurrencyNote: "Simultaneous downloads (1–4); too high may trigger platform rate limiting",
  secLanguage: "语言 / Language",
  langSystem: "System",
  langZh: "中文",
  langEn: "English",
  footComponents: "Components directory: ~/.tikdown",
  notDetected: "Not detected",
  notInstalled: "Not installed",
  autoDetectMsg: "Auto-detected (source: {src})",
  srcManaged: "managed copy",
  srcConfigured: "custom path",
  srcSystemPath: "system PATH",
  srcUnknown: "unknown",
  outdatedMsg:
    "System version {v} is below required {r}; the ~/.tikdown copy is used instead. To force the system one, change the path and click Check",
};

export const dictionaries: Record<ResolvedLang, Record<string, string>> = { zh, en };

let current: ResolvedLang = "zh";

/** 系统语言 → 界面语言（zh* 一律中文，其余英文）。navLang 参数化便于单测。 */
export function systemLang(navLang: string | undefined = navigator?.language): ResolvedLang {
  return (navLang ?? "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLang(lang: Lang): ResolvedLang {
  return lang === "system" ? systemLang() : lang;
}

/** 当前生效语言（解析后）。 */
export function lang(): ResolvedLang {
  return current;
}

/** 切换语言并同步 <html lang>。启动与设置变更共用。 */
export function setLang(lang: Lang): void {
  current = resolveLang(lang);
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

/** 取词：current → zh 兜底 → key 原样（缺翻译时可见，单测锁定字典齐全）。 */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dictionaries[current][key] ?? dictionaries.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

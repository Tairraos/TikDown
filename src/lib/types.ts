export type ComponentState =
  | { state: "ready"; path: string; version: string; source: "managed" | "configured" | "systemPath" }
  | { state: "readyExternal"; path: string; version: string }
  | { state: "outdated"; path: string; version: string; required: string }
  | { state: "missing" };

export interface ComponentStatus {
  name: string;
  state: ComponentState;
  downloadSize: number | null;
  hint: string | null;
}

export type FetchEvent =
  | { state: "running"; name: string; received: number; total: number; speedMbps: number }
  | { state: "failed"; name: string; message: string };

export interface FetchDone {
  name: string;
  path: string;
  version: string;
}

export interface Settings {
  ytdlpPath: string | null;
  ffmpegPath: string | null;
  /** Cookie 模式（docs/product-specs/cookie-access.md）：探测与下载同源（TD-PROBE-001） */
  cookieMode: "none" | "browser" | "file";
  cookieBrowser: string;
  cookieFile: string | null;
  /** 并发下载上限（1–4，默认 1）——前端队列使用，不同步后端 */
  maxConcurrent: number;
}

export const DEFAULT_SETTINGS: Settings = {
  ytdlpPath: null,
  ffmpegPath: null,
  cookieMode: "none",
  cookieBrowser: "chrome",
  cookieFile: null,
  maxConcurrent: 1,
};

export interface Quality {
  formatId: string;
  ext: string;
  resolution: string;
  height: number | null;
  vcodec: string;
  filesize: number | null;
  note: string | null;
}

export interface MediaInfo {
  url: string;
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  extractor: string;
  /** 至少有一个真实视频流 */
  hasVideo: boolean;
  /** 纯图文帖，无视频 */
  isImageOnly: boolean;
  qualities: Quality[];
}

export interface BatchResult {
  url: string;
  info: MediaInfo | null;
  error: string | null;
}

export type DownloadOptions = {
  url: string;
  targetDir: string;
  formatId: string | null;
  /** Cookie 等设置与后端 State 同源（set_settings 已同步），随任务携带一份保证原子性 */
  settings: Settings;
};

/** 与 Rust 侧 TaskEvent 对应 */
export type TaskEvent =
  | { state: "starting" }
  | {
      state: "progress";
      percent: number;
      downloaded: number;
      total: number;
      speed: string;
      eta: string;
      filename: string;
    }
  | { state: "merging" }
  | { state: "done"; path: string }
  | { state: "failed"; message: string };

export type TaskEventWrapper = TaskEvent & { id: string };

export type TaskStatus =
  | "pending"
  | "probing"
  | "ready"
  | "downloading"
  | "merging"
  | "done"
  | "failed"
  | "skipped";

export interface Task {
  id: string;
  url: string;
  status: TaskStatus;
  info: MediaInfo | null;
  error: string | null;
  percent: number;
  speed: string;
  eta: string;
  formatId: string | null;
}

/** 平台识别：用于 UI 上打标签，让用户一眼知道这条是哪个平台的 */
export const PLATFORMS: { key: string; label: string; hosts: string[] }[] = [
  { key: "douyin", label: "抖音", hosts: ["douyin.com", "iesdouyin.com"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com", "tiktokv.com"] },
  { key: "xhs", label: "小红书", hosts: ["xiaohongshu.com", "xhslink.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { key: "pinterest", label: "Pinterest", hosts: ["pinterest.com", "pin.it"] },
  { key: "x", label: "X", hosts: ["twitter.com", "x.com"] },
  { key: "bilibili", label: "B站", hosts: ["bilibili.com", "b23.tv"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
];

export function detectPlatform(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith("." + h)))?.label ?? null;
}

/** 从一段可能混着文字的粘贴内容里抽出所有 http 链接（中文标点视为边界，TD-FE-006） */
export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s"'<>）)】\]。，、；：！？「」『』（）《》]+/g;
  return Array.from(new Set(text.match(re) ?? []));
}

export function formatBytes(n: number | null): string {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
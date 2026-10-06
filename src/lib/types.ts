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
  /** 优先下载分辨率:自动画质时按最接近该高度下载(TD-FE-015) */
  preferredQuality: "原画" | "4K" | "1080P" | "720P";
}

/** 优先分辨率 → yt-dlp -S res:H 的高度;原画 = null(不限) */
export const PREFERRED_HEIGHT: Record<Settings["preferredQuality"], number | null> = {
  "原画": null,
  "4K": 2160,
  "1080P": 1080,
  "720P": 720,
};

/** 高度 → 展示标签(取最接近的常用档,TD-FE-012) */
export function qualityLabel(height: number | null): string {
  if (!height) return "";
  if (height >= 4320) return "8K";
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return `${height}p`;
}

export const DEFAULT_SETTINGS: Settings = {
  ytdlpPath: null,
  ffmpegPath: null,
  cookieMode: "none",
  cookieBrowser: "chrome",
  cookieFile: null,
  maxConcurrent: 1,
  preferredQuality: "原画",
};

export interface Quality {
  formatId: string;
  ext: string;
  resolution: string;
  height: number | null;
  width: number | null;
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
  /** 优先分辨率高度(原画 null);自动画质时经 -S res:H 生效 */
  preferredHeight: number | null;
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
  | { state: "done"; path: string; size: number | null }
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
  /** 下载开始时间(用于计算耗时) */
  startedAt: number | null;
  /** 完成态:最终文件路径(点击播放)/真实尺寸(stat)/耗时秒 */
  donePath: string | null;
  doneSize: number | null;
  doneElapsedSec: number | null;
  /** 下载中最近一次已读字节(total 缺失时按 MB 展示,TD-FE-013) */
  downloaded: number;
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
/** 设置弹层的路径检测结果(Rust check_candidate,serde camelCase) */
export interface CheckResult {
  ok: boolean;
  version: string | null;
  message: string;
}

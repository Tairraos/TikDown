/**
 * Tauri IPC 封装层（前端唯一允许直接触碰 invoke/listen 的模块）。
 *
 * 非 Tauri 环境（`npm run dev` 在普通浏览器里打开、vitest、浏览器自动化 E2E）
 * 自动切换到内置 mock 后端——它模拟 core_status / probe_batch / start_download
 * 的完整事件流，让 UI 在真浏览器里可开发、可测试。打包进 Tauri 后走真实 IPC。
 */

type Handler = (payload: unknown) => void;

const isTauri = typeof (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined";

// ---- mock 后端（仅非 Tauri 环境生效） ----

type MockTask = { id: string; timer: number; step: number };

const mockBus = new Map<string, Set<Handler>>();
const mockTasks = new Map<string, MockTask>();

function busEmit(event: string, payload: unknown) {
  mockBus.get(event)?.forEach((h) => h(payload));
}

function mockCannedStatuses() {
  return [
    {
      name: "yt-dlp",
      state: { state: "ready", path: "~/.tikdown/yt-dlp", version: "2026.08.19", source: "managed" },
      downloadSize: null,
      hint: null,
    },
    {
      name: "ffmpeg",
      state: { state: "ready", path: "~/.tikdown/ffmpeg", version: "7.1.1", source: "managed" },
      downloadSize: null,
      hint: null,
    },
  ];
}

function mockCannedInfo(url: string) {
  const isImage = url.includes("image-only");
  const title = `Mock 视频 ${new URL(url).pathname || url}`.slice(0, 40);
  return {
    url,
    title,
    uploader: "MockUploader",
    duration: 213,
    thumbnail: null,
    extractor: "mock",
    hasVideo: !isImage,
    isImageOnly: isImage,
    qualities: isImage
      ? []
      : [
          { formatId: "137", ext: "mp4", resolution: "1080p", height: 1080, vcodec: "avc1", filesize: 21_500_000, note: null },
          { formatId: "136", ext: "mp4", resolution: "720p", height: 720, vcodec: "avc1", filesize: 11_200_000, note: null },
          { formatId: "135", ext: "mp4", resolution: "480p", height: 480, vcodec: "avc1", filesize: 6_100_000, note: null },
        ],
  };
}

function mockInvoke(cmd: string, args: Record<string, unknown> | undefined): Promise<unknown> {
  switch (cmd) {
    case "core_status":
      return Promise.resolve(mockCannedStatuses());
    case "get_settings":
      return Promise.resolve({});
    case "set_settings":
    case "cancel_download":
      if (cmd === "cancel_download") {
        const t = mockTasks.get(String(args?.id));
        if (t) {
          clearInterval(t.timer);
          mockTasks.delete(String(args?.id));
          busEmit("task://event", { id: args?.id, state: "failed", message: "已取消" });
        }
      }
      return Promise.resolve(null);
    case "probe_batch":
      return new Promise((resolve) => {
        const urls = (args?.urls as string[]) ?? [];
        setTimeout(() => {
          resolve(
            urls.map((url) => ({
              url,
              info: mockCannedInfo(url),
              error: null,
            }))
          );
        }, 400);
      });
    case "start_download": {
      const id = String(args?.id);
      const step = { n: 0 };
      const timer = window.setInterval(() => {
        step.n += 10;
        if (step.n >= 100) {
          clearInterval(timer);
          mockTasks.delete(id);
          busEmit("task://event", {
            id,
            state: "done",
            path: `/mock/${id}.mp4`,
          });
        } else {
          busEmit("task://event", {
            id,
            state: "progress",
            percent: step.n,
            downloaded: step.n * 100_000,
            total: 1_000_000,
            speed: "8.0 MB/s",
            eta: "1秒",
            filename: "mock.mp4",
          });
        }
      }, 150);
      mockTasks.set(id, { id, timer, step: 0 });
      void step;
      return Promise.resolve(null);
    }
    case "fetch_component":
      return Promise.resolve(null);
    default:
      return Promise.reject(new Error(`mock IPC 未实现命令: ${cmd}`));
  }
}

// ---- 公开接口 ----

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return mockInvoke(cmd, args) as Promise<T>;
}

export function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (isTauri) {
    return import("@tauri-apps/api/event").then(({ listen }) =>
      listen<T>(event, (e) => handler(e.payload))
    );
  }
  let set = mockBus.get(event);
  if (!set) {
    set = new Set();
    mockBus.set(event, set);
  }
  const h = handler as Handler;
  const current = set;
  current.add(h);
  return Promise.resolve(() => {
    current.delete(h);
  });
}

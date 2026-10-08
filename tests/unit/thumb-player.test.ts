// @vitest-environment jsdom
/**
 * 缩略图与播放器行为测试(TD-FE-024/025)。
 *
 * 跑在 jsdom 下：这两块是「DOM 结构 + 异步回落」的组合，纯逻辑测不到，
 * 而它们出错的典型表现恰好是用户可见的坏体验（黑屏 / 空缩略图）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayerView } from "../../src/ui/playerDialog";
import { TaskListView } from "../../src/ui/taskList";
import type { Task } from "../../src/lib/types";
import "./jsdom-media-stub";

const mock = vi.hoisted(() => ({
  thumb: (async (_p: string) => "/tmp/thumb-out.jpg") as (p: string) => Promise<string>,
  mediaUrl: (async (_p: string) => "/tmp/v.mp4") as (p: string) => Promise<string>,
  invoked: [] as string[],
  reset: () => {
    mock.invoked.length = 0;
  },
}));

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    mock.invoked.push(cmd);
    if (cmd === "video_thumbnail") return mock.thumb(String(args?.path));
    if (cmd === "local_media_url") return mock.mediaUrl(String(args?.path));
    return Promise.resolve(null);
  },
  // 后端返回磁盘路径，前端经 convertFileSrc 转 asset:// —— 模拟这个转换，
  // 以便断言 <img>/<video> 拿到的是 asset:// 而不是 file://
  toAssetUrl: async (p: string) => `asset://localhost${p}`,
  listen: () => Promise.resolve(() => {}),
}));

const defaultThumb = mock.thumb;
const defaultMedia = mock.mediaUrl;
const noop = () => {};

/** 排空微任务队列：mock 的 toAssetUrl 是 async，promise 链有若干层 .then，
 *  靠数 `await Promise.resolve()` 的层数太脆弱（加一层 await 就红），这里主动排空。 */
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
beforeEach(() => {
  mock.reset();
  mock.thumb = defaultThumb;
  mock.mediaUrl = defaultMedia;
});
afterEach(() => vi.restoreAllMocks());

const doneTask = (over: Partial<Task> = {}): Task => ({
  id: "1",
  url: "https://v.douyin.com/x/",
  status: "done",
  info: { url: "https://v.douyin.com/x/", title: "标题", uploader: "作者", duration: 12, thumbnail: null, extractor: "e", hasVideo: true, isImageOnly: false, qualities: [] },
  error: null,
  errorCode: null,
  percent: 100,
  speed: "",
  eta: "",
  formatId: null,
  startedAt: null,
  donePath: "/tmp/v.mp4",
  doneSize: 1000,
  doneElapsedSec: 3,
  downloaded: 1000,
  ...over,
});

describe("完成态缩略图(TD-FE-024)", () => {
  let list: HTMLElement;
  let view: TaskListView;

  beforeEach(() => {
    document.body.innerHTML = "";
    list = document.createElement("section");
    document.body.append(list);
    view = new TaskListView(list, () => "抖音", { onFormat: noop, onStart: noop, onCancel: noop, onRemove: noop, onPlay: noop });
  });

  it("完成态取本地抽帧图（不依赖平台 CDN）", async () => {
    view.render([doneTask()]);
    await flush();
    const img = list.querySelector(".thumb img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("asset://localhost/tmp/thumb-out.jpg");
    expect(mock.invoked).toContain("video_thumbnail");
  });

  it("抽帧失败回落到远端封面，而不是留空洞", async () => {
    mock.thumb = async () => {
      throw new Error("ffmpeg 不可用");
    };
    const base = doneTask();
    if (!base.info) throw new Error("fixture 缺 info");
    const task = doneTask({ info: { ...base.info, thumbnail: "http://cdn.example/cover.jpg" } });
    view.render([task]);
    await flush();
    const img = list.querySelector(".thumb img");
    expect(img?.getAttribute("src")).toBe("https://cdn.example/cover.jpg");
  });

  it("抽帧失败且无远端封面时退到平台字母占位", async () => {
    mock.thumb = async () => {
      throw new Error("ffmpeg 不可用");
    };
    view.render([doneTask()]);
    await flush();
    expect(list.querySelector(".thumb .ph")?.textContent).toBe("抖");
  });

  it("缩略图 src 必须是 asset:// 而不是 file://（CSP 拦 file://）", async () => {
    // 回归锁定：曾经后端直接返回 Url::from_file_path 的 file:// URL，
    // 结果 <img> 被 CSP 静默拦掉——缩略图和视频都不显示且毫无报错。
    // 现在后端只返磁盘路径，由前端 toAssetUrl 转 asset://。
    view.render([doneTask()]);
    await flush();
    const src = list.querySelector(".thumb img")?.getAttribute("src") ?? "";
    expect(src.startsWith("asset://")).toBe(true);
    expect(src.startsWith("file://")).toBe(false);
  });

  it("未完成态不去抽帧（视频还没落盘，抽帧无从谈起）", () => {
    mock.invoked.length = 0;
    view.render([doneTask({ status: "downloading", donePath: null })]);
    expect(mock.invoked).not.toContain("video_thumbnail");
  });

  it("重复渲染同一路径不重复抽帧（ffmpeg 开销不随进度事件重跑）", async () => {
    view.render([doneTask()]);
    await flush();
    const first = mock.invoked.filter((c) => c === "video_thumbnail").length;
    for (let i = 0; i < 5; i++) {
      view.render([doneTask({ doneElapsedSec: i })]);
    await flush();
    }
    const total = mock.invoked.filter((c) => c === "video_thumbnail").length;
    expect(first).toBe(1);
    expect(total).toBe(1);
  });
});

describe("应用内播放器(TD-FE-025)", () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.append(host);
  });

  it("点完成行打开弹层而不是丢给系统播放器", () => {
    let played: Task | null = null;
    document.body.innerHTML = "";
    const list = document.createElement("section");
    document.body.append(list);
    const view = new TaskListView(list, () => "抖音", {
      onFormat: noop, onStart: noop, onCancel: noop, onRemove: noop,
      onPlay: (t) => {
        played = t;
      },
    });
    view.render([doneTask()]);
    (list.querySelector(".task") as HTMLElement).click();
    expect(played).not.toBeNull();
    expect(mock.invoked).not.toContain("open_with_system");
  });

  it("弹层用 asset:// 直读本地文件并挂上 video 元素", async () => {
    const view = new VideoPlayerView(host, "/tmp/v.mp4", "标题", () => {});
    await flush();
    const video = host.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("asset://localhost/tmp/v.mp4");
    // 应用内播放：不该有任何 open_with_system 调用
    expect(mock.invoked).not.toContain("open_with_system");
    view.close();
  });

  it("Esc 与点遮罩都能关闭，且关闭时彻底摘掉 video", async () => {
    new VideoPlayerView(host, "/tmp/v.mp4", "标题", () => {});
    await flush();
    expect(host.querySelector(".player-overlay")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.querySelector(".player-overlay")).toBeNull();
    expect(host.querySelector("video")).toBeNull();

    const p2 = new VideoPlayerView(host, "/tmp/v.mp4", "标题", () => {});
    await flush();
    (host.querySelector(".player-overlay") as HTMLElement).click();
    expect(host.querySelector(".player-overlay")).toBeNull();
    p2.close();
  });

  it("取不到可播放 URL 时给系统播放器出口，不留黑屏", async () => {
    mock.mediaUrl = async () => {
      throw new Error("文件不存在");
    };
    const p = new VideoPlayerView(host, "/tmp/gone.mp4", "标题", () => {});
    await flush();
    const status = host.querySelector(".player-status");
    expect(status?.textContent).toContain("无法解码");
    // 必须留一个能走的出口
    expect(status?.querySelector("button")).not.toBeNull();
    p.close();
  });

  it("关闭回调被调用（上层据此清空实例）", () => {
    let closed = 0;
    const p = new VideoPlayerView(host, "/tmp/v.mp4", "标题", () => {
      closed++;
    });
    p.close();
    expect(closed).toBe(1);
  });
});
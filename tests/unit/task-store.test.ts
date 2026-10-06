import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStore } from "../../src/state/tasks";
import type { Settings, Task } from "../../src/lib/types";

const settings: Settings = {
  ytdlpPath: null,
  ffmpegPath: null,
  cookieMode: "none",
  cookieBrowser: "chrome",
  cookieFile: null,
  maxConcurrent: 1,
  preferredQuality: "原画",
};

/** mock IPC 层:可编程的 probe_batch / start_download,驱动 store 的纯逻辑测试 */
const mock = vi.hoisted(() => {
  const m = {
    cancelled: [] as string[],
    probe: (async (urls: string[]) =>
      urls.map((url) => ({
        url,
        info: {
          url,
          title: `t-${url}`,
          uploader: "u",
          duration: 10,
          thumbnail: null,
          extractor: "mock",
          hasVideo: !url.includes("image-only"),
          isImageOnly: url.includes("image-only"),
          qualities: url.includes("image-only")
            ? []
            : [{ formatId: "f1", ext: "mp4", resolution: "720p", height: 720, vcodec: "avc", filesize: 1, note: null }],
        },
        error: null,
      }))) as (urls: string[]) => Promise<unknown>,
    start: (_id: string): Promise<unknown> => Promise.resolve(null),
    reset: () => (m.cancelled.length = 0),
  };
  return m;
});

// 默认实现的引用:单个测试可替换 probe/start,beforeEach 恢复,避免跨测试污染
const defaultProbe = mock.probe;
const defaultStart = mock.start;

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "probe_batch") return mock.probe((args?.urls as string[]) ?? []);
    if (cmd === "start_download") return mock.start(String(args?.id));
    if (cmd === "cancel_download") {
      mock.cancelled.push(String(args?.id));
      return Promise.resolve(null);
    }
    if (cmd === "core_status") return Promise.resolve([]);
    if (cmd === "set_settings") return Promise.resolve(null);
    return Promise.reject(new Error(`unexpected cmd ${cmd}`));
  },
  listen: () => Promise.resolve(() => {}),
}));

function storeWith(max: number) {
  const s = { ...settings, maxConcurrent: max };
  return new TaskStore(() => s, () => "/tmp/dl");
}

beforeEach(() => {
  mock.reset();
  mock.probe = defaultProbe;
  mock.start = defaultStart;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaskStore.addUrls", () => {
  it("正常解析后创建 ready 任务,图文帖置为 skipped", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/1\nhttps://a.com/image-only");
    expect(store.tasks.map((t) => t.status)).toEqual(["ready", "skipped"]);
    expect(store.tasks[1].error).toContain("图文");
  });

  it("提取不出链接时不产生任务", async () => {
    const store = storeWith(1);
    await store.addUrls("没有链接");
    expect(store.tasks).toHaveLength(0);
  });

  it("probe_batch 整体失败时 busy 复位且逐条标记失败(TD-FE-002)", async () => {
    const store = storeWith(1);
    mock.probe = () => Promise.reject(new Error("backend boom"));
    await store.addUrls("https://a.com/1");
    expect(store.busy).toBe(false);
    expect(store.tasks[0].status).toBe("failed");
    expect(store.tasks[0].error).toContain("backend boom");
  });

  it("重复 URL 不会产生重复任务", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/1");
    await store.addUrls("https://a.com/1");
    expect(store.tasks).toHaveLength(1);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("TaskStore 并发调度(TD-DL-004)", () => {
  it("maxConcurrent=1 时同时只有一个任务在下载", async () => {
    const store = storeWith(1);
    const gates = [deferred(), deferred()];
    let started = 0;
    mock.start = (id) => {
      started++;
      return gates[Number(id) - 1].promise;
    };
    await store.addUrls("https://a.com/1\nhttps://a.com/2");
    store.startAll();
    await vi.waitFor(() => expect(started).toBe(1));
    // 任务1收到 done 事件(槽位释放)→ 任务2补位启动
    store.handleEvent({ id: "1", state: "done", path: "/x.mp4" } as never);
    await vi.waitFor(() => expect(started).toBe(2));
  });

  it("maxConcurrent=3 时同时启动三个", async () => {
    const store = storeWith(3);
    let started = 0;
    mock.start = () => {
      started++;
      return new Promise(() => {}); // 永不完成
    };    await store.addUrls("https://a.com/1\nhttps://a.com/2\nhttps://a.com/3\nhttps://a.com/4");
    store.startAll();
    await vi.waitFor(() => expect(started).toBe(3)); // 第4个排队
  });

  it("超上限的手动启动被拒绝排队,不越过上限", async () => {
    const store = storeWith(1);
    mock.start = () => new Promise(() => {});
    await store.addUrls("https://a.com/1\nhttps://a.com/2");
    store.startOne(store.tasks[0]);
    store.startOne(store.tasks[1]);
    const statuses = store.tasks.map((t) => t.status).sort();
    expect(statuses).toEqual(["downloading", "ready"]);
  });
});

describe("TaskStore 事件路由", () => {
  it("done 事件置为完成并腾出并发槽位,补位任务自动启动", async () => {
    const store = storeWith(1);
    const gate = deferred();
    mock.start = () => gate.promise;
    await store.addUrls("https://a.com/1\nhttps://a.com/2");
    store.startAll();
    await vi.waitFor(() => expect(store.tasks[0].status).toBe("downloading"));

    store.handleEvent({ id: "1", state: "done", path: "/x.mp4" } as never);
    await vi.waitFor(() => {
      expect(store.tasks[0].status).toBe("done");
      expect(store.tasks[1].status).toBe("downloading"); // 补位
    });
  });

  it("done 事件记录真实尺寸与耗时", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/1");
    store.startOne(store.tasks[0]);
    expect(store.tasks[0].startedAt).not.toBeNull();
    store.handleEvent({ id: "1", state: "done", path: "/x.mp4", size: 21_500_000 } as never);
    expect(store.tasks[0].donePath).toBe("/x.mp4");
    expect(store.tasks[0].doneSize).toBe(21_500_000);
    expect(store.tasks[0].doneElapsedSec).toBeGreaterThanOrEqual(1);
  });

  it("failed 事件写入错误信息", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/1");
    store.startOne(store.tasks[0]);
    store.handleEvent({ id: "1", state: "failed", message: "已取消" } as never);
    expect(store.tasks[0].status).toBe("failed");
    expect(store.tasks[0].error).toBe("已取消");
  });
});

describe("TaskStore 取消与失败分支", () => {
  it("cancel 调用 cancel_download 命令", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/1");
    store.cancel("1");
    expect(mock.cancelled).toContain("1");
  });

  it("单条探测错误不中断整批,失败任务保留 URL", async () => {
    const store = storeWith(1);
    mock.probe = async (urls: string[]) =>
      urls.map((url) => ({
        url,
        info: null,
        error: url.includes("bad") ? "该内容需要登录" : null,
      }));
    await store.addUrls("https://a.com/bad\nhttps://a.com/ok");
    const bad = store.tasks.find((t) => t.url.includes("bad"));
    const ok = store.tasks.find((t) => t.url.includes("ok"));
    expect(bad?.status).toBe("failed");
    expect(bad?.error).toBe("该内容需要登录");
    expect(ok?.status).toBe("ready");
  });
});

describe("TaskStore 启动失败路径", () => {
  it("start_download 被后端拒绝时任务置为失败并释放并发槽位", async () => {
    const store = storeWith(1);
    mock.start = () => Promise.reject(new Error("yt-dlp 不可用"));
    await store.addUrls("https://a.com/1\nhttps://a.com/2");
    store.startAll();
    await vi.waitFor(() => {
      expect(store.tasks[0].status).toBe("failed");
      expect(store.tasks[0].error).toContain("yt-dlp 不可用");
      // 失败释放槽位后,第二个任务立即补位并同样失败
      expect(store.tasks[1].status).toBe("failed");
    });
  });
});

describe("事件到状态机的完整映射", () => {
  const base = {
    id: "1",
    url: "https://a.com/1",
    info: null,
    error: null,
    percent: 0,
    speed: "",
    eta: "",
    formatId: null,
  } as Task;

  function storeWithTask() {
    const store = storeWith(1);
    store.tasks = [{ ...base, status: "ready" }];
    return store;
  }

  it.each([
    [{ state: "starting" }, "downloading"],
    [{ state: "progress", percent: 50, speed: "1 MB/s", eta: "3秒" }, "downloading"],
    [{ state: "merging" }, "merging"],
    [{ state: "done", path: "/x" }, "done"],
    [{ state: "failed", message: "x" }, "failed"],
    [{ state: "unknown-future-event" }, "ready"],
  ])("事件 %j → 状态 %s", (evt, expected) => {
    const store = storeWithTask();
    store.handleEvent({ id: "1", ...evt } as never);
    expect(store.tasks[0].status).toBe(expected);
  });

  it("progress 事件携带速度与剩余时间", () => {
    const store = storeWithTask();
    store.handleEvent({ id: "1", state: "progress", percent: 50, speed: "2.0 MB/s", eta: "30秒" } as never);
    expect(store.tasks[0].percent).toBe(50);
    expect(store.tasks[0].speed).toBe("2.0 MB/s");
    expect(store.tasks[0].eta).toBe("30秒");
  });

  it("setFormat 更新指定任务的画质选择", () => {
    const store = storeWithTask();
    store.tasks = [{ ...base, status: "ready", info: { qualities: [] } } as unknown as Task];
    store.setFormat("1", "137");
    expect(store.tasks[0].formatId).toBe("137");
  });
});

describe("Task 状态标签与重试入口(与 UI 契约一致)", () => {
  it("failed 任务保留 info,可作重试输入", async () => {
    const store = storeWith(1);
    await store.addUrls("https://a.com/image-only");
    const t: Task = store.tasks[0];
    expect(t.status).toBe("skipped");
    expect(t.info).not.toBeNull();
  });
});

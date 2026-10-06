import { invoke, listen } from "../lib/ipc";
import type {
  BatchResult,
  ComponentStatus,
  Settings,
  Task,
  TaskEventWrapper,
} from "../lib/types";
import { extractUrls } from "../lib/types";

type Listener = () => void;

/**
 * 任务队列仓：任务状态机 + 事件路由 + **有界并发调度**（TD-DL-004）。
 *
 * 并发上限来自设置（默认 1，极限 4，用户决策 2026-10-06）。
 * 调度规则：ready 任务按加入顺序起跑；任务终结（成败皆然）后自动补位。
 */
export class TaskStore {
  tasks: Task[] = [];
  /** 组件状态缓存（CorePanel 渲染用） */
  statuses: ComponentStatus[] = [];
  busy = false;

  private listeners = new Set<Listener>();
  private running = new Set<string>();
  private seq = 1;

  constructor(
    private settings: () => Settings,
    private targetDir: () => string
  ) {
    void this.watchEvents();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** 订阅下载事件：按 id 路由到对应任务 */
  private async watchEvents() {
    await listen<TaskEventWrapper>("task://event", (evt) => this.handleEvent(evt));
  }

  /**
   * 任务事件处理（公开：便于测试与未来事件重放）。
   * 终态任务从并发槽位移除并立即补位调度（TD-DL-004）。
   */
  handleEvent({ id, ...event }: TaskEventWrapper) {
    this.tasks = this.tasks.map((t) => (t.id !== id ? t : applyEvent(t, event)));
    const task = this.tasks.find((t) => t.id === id);
    if (task && isTerminal(task.status)) {
      this.running.delete(id);
      this.startNext();
    }
    this.emit();
  }

  async refreshStatus() {
    try {
      this.statuses = await invoke<ComponentStatus[]>("core_status");
    } catch {
      this.statuses = [];
    }
    this.emit();
  }

  /** 核心组件可用性：yt-dlp 就绪才允许探测 */
  get coreReady(): boolean {
    return this.statuses.some(
      (s) => s.name === "yt-dlp" && (s.state.state === "ready" || s.state.state === "readyExternal")
    );
  }

  counts() {
    const c = { total: this.tasks.length, done: 0, failed: 0, skipped: 0, ready: 0 };
    for (const t of this.tasks) {
      if (t.status === "done") c.done++;
      else if (t.status === "failed") c.failed++;
      else if (t.status === "skipped") c.skipped++;
      else if (t.status === "ready") c.ready++;
    }
    return c;
  }

  /** 解析粘贴内容并创建任务（try/finally 保证 busy 复位，TD-FE-002） */
  async addUrls(raw: string) {
    const urls = extractUrls(raw);
    if (urls.length === 0) return;
    this.busy = true;
    this.emit();
    try {
      const results = await invoke<BatchResult[]>("probe_batch", { urls });
      this.tasks = [
        ...results.map((r) => this.buildTask(r)),
        ...this.tasks.filter((p) => !results.some((r) => r.url === p.url)),
      ];
    } catch (e) {
      // 整批探测失败也要让用户看见,而不是输入框静默卡死
      this.tasks = [
        ...urls.map(
          (url) =>
            ({
              id: this.nextId(),
              url,
              status: "failed",
              info: null,
              error: `解析失败：${String(e)}`,
              percent: 0,
              speed: "",
              eta: "",
              formatId: null,
            }) satisfies Task
        ),
        ...this.tasks,
      ];
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  private buildTask(r: BatchResult): Task {
    const id = this.nextId();
    if (r.error) {
      return { id, url: r.url, status: "failed", info: null, error: r.error, percent: 0, speed: "", eta: "", formatId: null };
    }
    const status = r.info?.isImageOnly ? "skipped" : "ready";
    return {
      id,
      url: r.url,
      status,
      info: r.info,
      error: r.info?.isImageOnly ? "该内容为图文，没有可下载的视频" : null,
      percent: 0,
      speed: "",
      eta: "",
      formatId: null,
    };
  }

  private nextId(): string {
    return String(this.seq++);
  }

  setFormat(id: string, formatId: string | null) {
    this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, formatId } : t));
    this.emit();
  }

  /** 手动单条启动（也作为失败后的重试入口） */
  startOne(task: Task) {
    if (!task.info?.hasVideo) return;
    const dir = this.targetDir();
    if (!dir) {
      // 默认目录解析失败且用户未设置时,明确提示而不是向文件系统根写文件
      this.tasks = this.tasks.map((t) =>
        t.id === task.id ? { ...t, status: "failed", error: "请先在设置里选择下载目录" } : t
      );
      this.emit();
      return;
    }
    if (this.running.size >= Math.max(1, Math.min(4, this.settings().maxConcurrent))) {
      // 超出并发上限:置回 ready 让调度器排队
      return;
    }
    this.running.add(task.id);
    this.tasks = this.tasks.map((t) =>
      t.id === task.id ? { ...t, status: "downloading", percent: 0, error: null } : t
    );
    this.emit();
    void invoke("start_download", {
      id: task.id,
      opts: {
        url: task.url,
        targetDir: dir,
        formatId: task.formatId,
        settings: this.settings(),
      },
    }).catch((e) => {
      // 后端拒收(如 yt-dlp 不可用)同样是终态:释放槽位并补位,与 failed 事件路径一致
      this.running.delete(task.id);
      this.tasks = this.tasks.map((t) =>
        t.id === task.id ? { ...t, status: "failed", error: String(e) } : t
      );
      this.emit();
      this.startNext();
    });
  }

  /** 全部下载:ready 任务按顺序进入并发调度（TD-DL-004） */
  startAll() {
    for (const t of this.tasks) {
      if (t.status === "ready") this.startOne(t);
    }
    this.startNext();
  }

  /** 按并发上限补位启动排队的 ready 任务 */
  private startNext() {
    const limit = Math.max(1, Math.min(4, this.settings().maxConcurrent));
    while (this.running.size < limit) {
      const next = this.tasks.find((t) => t.status === "ready" && !this.running.has(t.id));
      if (!next) break;
      this.startOne(next);
    }
  }

  cancel(id: string) {
    void invoke("cancel_download", { id });
  }
}

function isTerminal(status: Task["status"]): boolean {
  return status === "done" || status === "failed";
}

function applyEvent(task: Task, evt: Record<string, unknown>): Task {
  switch (evt.state) {
    case "starting":
      return { ...task, status: "downloading", percent: 0 };
    case "progress": {
      const p = evt as unknown as { percent: number; speed: string; eta: string };
      return { ...task, status: "downloading", percent: p.percent, speed: p.speed, eta: p.eta };
    }
    case "merging":
      return { ...task, status: "merging" };
    case "done":
      return { ...task, status: "done", percent: 100 };
    case "failed":
      return { ...task, status: "failed", error: String(evt.message ?? "下载失败") };
    default:
      return task;
  }
}


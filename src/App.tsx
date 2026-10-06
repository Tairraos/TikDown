import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  type ComponentStatus,
  type MediaInfo,
  type Settings,
  type Task,
  type TaskEventWrapper,
  detectPlatform,
  extractUrls,
} from "./lib/types";
import TaskRow from "./components/TaskRow";
import CorePanel from "./components/CorePanel";
import SettingsPanel from "./components/SettingsPanel";

let seq = 1;

const LS_SETTINGS = "tikdown.settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ytdlpPath: null, ffmpegPath: null, ...JSON.parse(raw) };
  } catch {
    /* 存储损坏就用默认值 */
  }
  return { ytdlpPath: null, ffmpegPath: null };
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [useCookies, setUseCookies] = useState(false);
  const [browser, setBrowser] = useState("chrome");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [statuses, setStatuses] = useState<ComponentStatus[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(() => {
    invoke<ComponentStatus[]>("core_status")
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // 订阅下载事件：按 id 路由到对应任务
  useEffect(() => {
    const un = listen<TaskEventWrapper>("task://event", (e) => {
      const { id, ...evt } = e.payload as TaskEventWrapper;
      const state = (evt as { state: string }).state;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          switch (state) {
            case "starting":
              return { ...t, status: "downloading", percent: 0 };
            case "progress": {
              const p = evt as Extract<TaskEventWrapper, { state: "progress" }>;
              return {
                ...t,
                status: "downloading",
                percent: p.percent,
                speed: p.speed,
                eta: p.eta,
              };
            }
            case "merging":
              return { ...t, status: "merging" };
            case "done":
              return { ...t, status: "done", percent: 100 };
            case "failed": {
              const f = evt as Extract<TaskEventWrapper, { state: "failed" }>;
              return { ...t, status: "failed", error: f.message };
            }
            default:
              return t;
          }
        })
      );
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  /** yt-dlp 不可用时禁止探测 —— 省得用户点了只得到一句「未安装」 */
  const coreReady = statuses.some(
    (s) => s.name === "yt-dlp" && (s.state.state === "ready" || s.state.state === "readyExternal")
  );

  const addUrls = useCallback(
    async (raw: string) => {
      const urls = extractUrls(raw);
      if (urls.length === 0) return;
      setBusy(true);

      const results = await invoke<{ url: string; info: MediaInfo | null; error: string | null }[]>(
        "probe_batch",
        { urls }
      );

      setTasks((prev) => [
        ...results.map((r) => {
          const known = prev.find((p) => p.url === r.url);
          if (known) return known;
          const id = String(seq++);
          if (r.error) {
            return {
              id, url: r.url, status: "failed", info: null, error: r.error,
              percent: 0, speed: "", eta: "", formatId: null,
            } as Task;
          }
          const status = r.info?.isImageOnly ? "skipped" : "ready";
          return {
            id, url: r.url, status, info: r.info,
            error: r.info?.isImageOnly ? "该内容为图文，没有可下载的视频" : null,
            percent: 0, speed: "", eta: "", formatId: null,
          } as Task;
        }),
        ...prev.filter((p) => !results.some((r) => r.url === p.url)),
      ]);
      setBusy(false);
      setInput("");
    },
    []
  );

  const startOne = useCallback(
    async (task: Task) => {
      if (!task.info?.hasVideo) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "downloading", percent: 0, error: null } : t
        )
      );
      try {
        await invoke("start_download", {
          id: task.id,
          opts: {
            url: task.url,
            targetDir,
            formatId: task.formatId,
            useCookies,
            browser,
            settings,
          },
        });
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: "failed", error: String(e) } : t))
        );
      }
    },
    [targetDir, useCookies, browser, settings]
  );

  const startAll = useCallback(() => {
    tasks.filter((t) => t.status === "ready").forEach(startOne);
  }, [tasks, startOne]);

  const cancel = (id: string) => invoke("cancel_download", { id });

  const pickDir = async () => {
    const d = await open({ directory: true });
    if (d && typeof d === "string") setTargetDir(d);
  };

  const saveSettings = (s: Settings) => {
    setSettings(s);
    localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
  };

  const counts = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    skipped: tasks.filter((t) => t.status === "skipped").length,
    ready: tasks.filter((t) => t.status === "ready").length,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TikDown</div>
        <div className="actions">
          <button className="btn ghost" onClick={pickDir}>
            {targetDir ? `目录：${shorten(targetDir)}` : "选择下载目录"}
          </button>
          <button className="btn ghost" onClick={() => setShowSettings(true)}>
            设置
          </button>
        </div>
      </header>

      <CorePanel
        statuses={statuses}
        onRefresh={refreshStatus}
        onOpenSettings={() => setShowSettings(true)}
      />

      <section className="input-panel">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (extractUrls(text).length) {
              e.preventDefault();
              addUrls(text);
            }
          }}
          placeholder={
            coreReady
              ? "粘贴链接，支持多行批量（抖音 / TikTok / 小红书 / Instagram / Pinterest / X / B站 / YouTube）"
              : "请先在下方安装 yt-dlp"
          }
          rows={3}
          disabled={busy || !coreReady}
        />
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={useCookies}
              onChange={(e) => setUseCookies(e.target.checked)}
            />
            读取本机浏览器登录态
            {useCookies && (
              <select value={browser} onChange={(e) => setBrowser(e.target.value)}>
                <option value="chrome">Chrome</option>
                <option value="safari">Safari</option>
                <option value="firefox">Firefox</option>
                <option value="edge">Edge</option>
                <option value="brave">Brave</option>
              </select>
            )}
          </label>
          <div className="spacer" />
          <button className="btn" disabled={busy || !coreReady} onClick={() => addUrls(input)}>
            {busy ? "解析中…" : "解析"}
          </button>
          <button
            className="btn primary"
            disabled={!targetDir || counts.ready === 0}
            onClick={startAll}
            title={!targetDir ? "先选择下载目录" : `下载 ${counts.ready} 条`}
          >
            全部下载{counts.ready > 0 ? `（${counts.ready}）` : ""}
          </button>
        </div>
      </section>

      <section className="list">
        {tasks.length === 0 && (
          <div className="empty">粘贴链接开始。只下载视频，图文帖会自动跳过。</div>
        )}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            platform={detectPlatform(t.url)}
            onFormat={(fid) =>
              setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, formatId: fid } : x)))
            }
            onStart={() => startOne(t)}
            onCancel={() => cancel(t.id)}
          />
        ))}
      </section>

      <footer className="statusbar">
        <span>共 {counts.total}</span>
        <span className="ok">完成 {counts.done}</span>
        <span className="warn">跳过 {counts.skipped}</span>
        <span className="err">失败 {counts.failed}</span>
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          statuses={statuses}
          onChange={saveSettings}
          onClose={() => setShowSettings(false)}
          onRefresh={refreshStatus}
        />
      )}
    </div>
  );
}

function shorten(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? "…/" + parts.slice(-2).join("/") : p;
}
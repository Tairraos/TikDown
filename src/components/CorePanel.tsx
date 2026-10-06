import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ComponentStatus, FetchDone, FetchEvent } from "../lib/types";
import { formatBytes } from "../lib/types";

const NAME_CN: Record<string, string> = {
  "yt-dlp": "yt-dlp",
  ffmpeg: "ffmpeg",
};

export default function CorePanel({
  statuses,
  onRefresh,
  onOpenSettings,
}: {
  statuses: ComponentStatus[];
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const [progress, setProgress] = useState<Record<string, FetchEvent>>({});

  useEffect(() => {
    const u1 = listen<FetchEvent>("core://progress", (e) => {
      const st = e.payload.state;
      if (st === "failed") return;
      const target = currentTarget();
      if (target) {
        setProgress((p) => ({ ...p, [target]: e.payload as FetchEvent }));
      }
    });
    const u2 = listen<FetchDone>("core://done", (e) => {
      setProgress((p) => {
        const n = { ...p };
        delete n[e.payload.name];
        return n;
      });
      onRefresh();
    });
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
    };
  }, [onRefresh]);

  // 下载中只有一个组件，记住当前是哪个
  let currentTarget: () => string | null = () => null;

  const blocking = statuses.filter((s) => s.name === "yt-dlp").filter((s) => {
    const st = s.state.state;
    return st === "missing" || st === "outdated";
  });

  return (
    <div className="core-panel">
      {statuses.map((s) => (
        <CoreRow
          key={s.name}
          status={s}
          progress={progress[s.name]}
          onDownload={() => {
            currentTarget = () => s.name;
            invoke("fetch_component", { name: s.name });
          }}
          onOpenSettings={onOpenSettings}
        />
      ))}
      {blocking.length > 0 && (
        <div className="core-hint">
          需要 {NAME_CN[blocking[0].name]} 才能开始下载视频。
        </div>
      )}
    </div>
  );
}

function CoreRow({
  status,
  progress,
  onDownload,
  onOpenSettings,
}: {
  status: ComponentStatus;
  progress?: FetchEvent;
  onDownload: () => void;
  onOpenSettings: () => void;
}) {
  const st = status.state.state;

  const badge =
    st === "ready" || st === "readyExternal"
      ? { cls: "ok", text: status.state.version }
      : st === "outdated"
      ? { cls: "warn", text: `${status.state.version} → 需 ${status.state.required}` }
      : { cls: "err", text: "未安装" };

  const downloading = progress?.state === "running";

  return (
    <div className="core-row">
      <div className="core-name">
        <span className="dot" />
        <span>{NAME_CN[status.name] ?? status.name}</span>
      </div>

      <span className={`badge ${badge.cls}`}>{badge.text}</span>

      {downloading && progress.state === "running" && (
        <span className="core-prog">
          {formatBytes(progress.received)} · {progress.speedMbps.toFixed(1)} MB/s
        </span>
      )}

      <div className="core-ops">
        {(st === "missing" || st === "outdated") && !downloading && (
          <button className="btn tiny" onClick={onDownload}>
            {st === "missing" ? "下载" : "更新"}
            {status.downloadSize && ` ${formatBytes(status.downloadSize)}`}
          </button>
        )}
        <button className="btn tiny ghost" onClick={onOpenSettings} title="手动指定路径">
          指定
        </button>
      </div>

      {status.hint && <div className="core-note">{status.hint}</div>}
    </div>
  );
}
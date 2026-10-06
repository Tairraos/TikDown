import type { Task } from "../lib/types";
import { formatBytes, formatDuration } from "../lib/types";

const STATUS_LABEL: Record<Task["status"], string> = {
  pending: "等待",
  probing: "解析中",
  ready: "待下载",
  downloading: "下载中",
  merging: "合并中",
  done: "完成",
  failed: "失败",
  skipped: "已跳过",
};

export default function TaskRow({
  task,
  platform,
  onFormat,
  onStart,
  onCancel,
}: {
  task: Task;
  platform: string | null;
  onFormat: (fid: string | null) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const showQ = task.status === "ready" && (task.info?.qualities.length ?? 0) > 1;

  return (
    <div className={`task ${task.status}`}>
      <div className="thumb">
        {task.info?.thumbnail ? (
          <img src={task.info.thumbnail} alt="" loading="lazy" />
        ) : (
          <div className="ph">{platform ? platform[0] : "?"}</div>
        )}
      </div>

      <div className="body">
        <div className="line1">
          {platform && <span className="tag">{platform}</span>}
          <span className="title">{task.info?.title ?? task.url}</span>
        </div>

        <div className="line2">
          <span className={`state ${task.status}`}>{STATUS_LABEL[task.status]}</span>
          {task.info?.uploader && <span className="dim">{task.info.uploader}</span>}
          {task.info?.duration ? <span className="dim">{formatDuration(task.info.duration)}</span> : null}
          {task.error && <span className="msg">{task.error}</span>}
        </div>

        {(task.status === "downloading" || task.status === "merging") && (
          <div className="progress">
            <div className="bar" style={{ width: `${Math.min(100, task.percent)}%` }} />
            <span className="pct">
              {task.status === "merging" ? "合并音视频…" : `${task.percent.toFixed(1)}%`}
              {task.speed && ` · ${task.speed}`}
              {task.eta && ` · 剩余 ${task.eta}`}
            </span>
          </div>
        )}

        {showQ && (
          <div className="qualities">
            <button className={task.formatId === null ? "chip on" : "chip"} onClick={() => onFormat(null)}>
              最佳
            </button>
            {task.info!.qualities.slice(0, 6).map((q) => (
              <button
                key={q.formatId}
                className={task.formatId === q.formatId ? "chip on" : "chip"}
                onClick={() => onFormat(q.formatId)}
                title={`${q.vcodec}${q.filesize ? " · " + formatBytes(q.filesize) : ""}`}
              >
                {q.resolution}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ops">
        {task.status === "ready" && (
          <button className="btn small" onClick={onStart}>
            下载
          </button>
        )}
        {(task.status === "downloading" || task.status === "merging") && (
          <button className="btn small ghost" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}
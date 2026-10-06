import { open } from "@tauri-apps/plugin-dialog";
import type { ComponentStatus, Settings } from "../lib/types";

export default function SettingsPanel({
  settings,
  statuses,
  onChange,
  onClose,
  onRefresh,
}: {
  settings: Settings;
  statuses: ComponentStatus[];
  onChange: (s: Settings) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const pick = async (which: "ytdlp" | "ffmpeg") => {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    const key = which === "ytdlp" ? "ytdlpPath" : "ffmpegPath";
    onChange({ ...settings, [key]: picked });
    onRefresh();
  };

  const clear = (which: "ytdlp" | "ffmpeg") => {
    const key = which === "ytdlp" ? "ytdlpPath" : "ffmpegPath";
    onChange({ ...settings, [key]: null });
    onRefresh();
  };

  const versionOf = (name: string) => {
    const s = statuses.find((x) => x.name === name);
    const st = s?.state;
    if (!s || !st) return "未检测到";
    return "version" in st ? st.version : "未安装";
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>设置</h2>

        <section className="set-block">
          <div className="set-label">
            核心组件
            <span className="set-note">
              留空则使用 ~/.tikdown 下的副本，或自动查找系统已安装的版本
            </span>
          </div>

          <PathRow
            label="yt-dlp"
            version={versionOf("yt-dlp")}
            value={settings.ytdlpPath}
            onPick={() => pick("ytdlp")}
            onClear={() => clear("ytdlp")}
          />
          <PathRow
            label="ffmpeg"
            version={versionOf("ffmpeg")}
            value={settings.ffmpegPath}
            onPick={() => pick("ffmpeg")}
            onClear={() => clear("ffmpeg")}
          />
        </section>

        <section className="set-block">
          <div className="set-label">下载选项</div>
          <label className="check">
            <input type="checkbox" defaultChecked />
            读取本机浏览器登录态（应对小红书 / Instagram 登录墙）
          </label>
          <label className="check">
            <input type="checkbox" defaultChecked />
            尽量请求无水印版本
          </label>
        </section>

        <div className="set-foot">
          <span className="set-path">组件目录：~/.tikdown</span>
          <button className="btn" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

function PathRow({
  label,
  version,
  value,
  onPick,
  onClear,
}: {
  label: string;
  version: string;
  value: string | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="path-row">
      <div className="path-info">
        <span className="path-name">{label}</span>
        <span className="path-ver">{version}</span>
        {value && <span className="path-custom">{value}</span>}
      </div>
      <div className="path-ops">
        <button className="btn tiny ghost" onClick={onPick}>
          选择…
        </button>
        {value && (
          <button className="btn tiny ghost" onClick={onClear}>
            清除
          </button>
        )}
      </div>
    </div>
  );
}
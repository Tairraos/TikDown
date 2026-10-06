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

  const pickCookieFile = async () => {
    const picked = await open({ multiple: false });
    if (!picked || Array.isArray(picked)) return;
    onChange({ ...settings, cookieMode: "file", cookieFile: picked });
  };

  const versionOf = (name: string) => {
    const s = statuses.find((x) => x.name === name);
    const st = s?.state;
    if (!s || !st) return "未检测到";
    return "version" in st ? st.version : "未安装";
  };

  const setMode = (mode: Settings["cookieMode"]) => onChange({ ...settings, cookieMode: mode });

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
          <div className="set-label">
            Cookie（登录墙内容）
            <span className="set-note">
              二选一即可：在常用浏览器里登录平台后选「浏览器登录态」；或用「Get cookies.txt
              LOCALLY」扩展导出后选「文件」。读取失败时先完全退出浏览器再试（详见
              docs/product-specs/cookie-access.md）
            </span>
          </div>
          <label className="check">
            <input
              type="radio"
              name="cookieMode"
              checked={settings.cookieMode === "none"}
              onChange={() => setMode("none")}
            />
            不使用 Cookie
          </label>
          <label className="check">
            <input
              type="radio"
              name="cookieMode"
              checked={settings.cookieMode === "browser"}
              onChange={() => setMode("browser")}
            />
            读取浏览器登录态
            {settings.cookieMode === "browser" && (
              <select
                value={settings.cookieBrowser}
                onChange={(e) => onChange({ ...settings, cookieBrowser: e.target.value })}
              >
                <option value="chrome">Chrome</option>
                <option value="firefox">Firefox</option>
                <option value="edge">Edge</option>
                <option value="brave">Brave</option>
                <option value="safari">Safari（实验性）</option>
              </select>
            )}
          </label>
          <label className="check">
            <input
              type="radio"
              name="cookieMode"
              checked={settings.cookieMode === "file"}
              onChange={() => setMode("file")}
            />
            cookies.txt 文件
            {settings.cookieMode === "file" && (
              <span className="path-custom">
                {settings.cookieFile ?? "未选择"}
                <button className="btn tiny ghost" onClick={pickCookieFile}>
                  选择…
                </button>
              </span>
            )}
          </label>
        </section>

        <section className="set-block">
          <div className="set-label">
            并发下载上限
            <span className="set-note">同时进行的下载数（1–4），过高可能触发平台风控</span>
          </div>
          <input
            type="number"
            min={1}
            max={4}
            value={settings.maxConcurrent}
            onChange={(e) =>
              onChange({
                ...settings,
                maxConcurrent: Math.min(4, Math.max(1, Number(e.target.value) || 1)),
              })
            }
          />
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

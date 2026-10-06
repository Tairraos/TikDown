import { DEFAULT_SETTINGS, type Settings } from "../lib/types";
import { defaultDownloadDir, invoke } from "../lib/ipc";

const LS_SETTINGS = "tikdown.settings";
const LS_TARGET_DIR = "tikdown.targetDir";

/** 用户设置：localStorage 持久化 + 启动/保存时同步后端（探测/组件检测/下载三入口同源，TD-CORE-001） */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* 存储损坏就用默认值 */
  }
  return { ...DEFAULT_SETTINGS };
}

export function loadTargetDir(): string {
  return localStorage.getItem(LS_TARGET_DIR) ?? "";
}

type Listener = () => void;

/** 应用级设置仓。targetDir 一并持久化（TD-FE-005）。 */
export class SettingsStore {
  settings: Settings;
  targetDir: string;

  private listeners = new Set<Listener>();

  constructor() {
    this.settings = loadSettings();
    this.targetDir = loadTargetDir();
    // 启动即同步后端；失败不阻塞界面
    void invoke("set_settings", { newSettings: this.settings }).catch(() => {});
    // 主界面不再有目录选择:未持久化过目录时,默认落到系统下载目录(TD-FE-008)
    if (!this.targetDir) void this.initDefaultDir();
  }

  private async initDefaultDir() {
    const dir = await defaultDownloadDir();
    if (dir && !localStorage.getItem(LS_TARGET_DIR)) {
      this.targetDir = dir;
      this.emit();
    }
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  save(next: Settings) {
    this.settings = next;
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
    void invoke("set_settings", { newSettings: next }).catch(() => {});
    this.emit();
  }

  setTargetDir(dir: string) {
    this.targetDir = dir;
    localStorage.setItem(LS_TARGET_DIR, dir);
    this.emit();
  }
}

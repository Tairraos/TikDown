/**
 * 下载次数统计（TD-FE-020，参考图"7天/总下载次数 [重置]"）。
 * localStorage 持久化 { total, days: 按本地日期计数 }；
 * recent7 = 本地日期回溯 7 天（含今天）求和；reset 清零。
 * 计数口径 = 下载成功（done）次数，由 TaskStore.onDone 驱动。
 */

const LS_STATS = "tikdown.stats";
/** 保留天数：只需 7 天窗口，多留余量应对系统时钟回拨 */
const KEEP_DAYS = 60;

/** 本地时区日期键 YYYY-MM-DD（不用 toISOString——那是 UTC，跨时区会错天） */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 最近 n 天（含今天）的计数和。days 可为任意子集。 */
export function sumLastDays(days: Record<string, number>, n = 7): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    sum += days[dateKey(d)] ?? 0;
  }
  return sum;
}

type Listener = () => void;

export class StatsStore {
  total = 0;
  days: Record<string, number> = {};

  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  get recent7(): number {
    return sumLastDays(this.days, 7);
  }

  /** 记一次成功下载（或显式 +n）。 */
  add(n = 1): void {
    this.total += n;
    const key = dateKey();
    this.days[key] = (this.days[key] ?? 0) + n;
    this.prune();
    this.persist();
    this.emit();
  }

  /** [重置] 入口：总数与按日计数全部清零。 */
  reset(): void {
    this.total = 0;
    this.days = {};
    this.persist();
    this.emit();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(LS_STATS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { total?: unknown; days?: unknown };
      this.total = typeof parsed.total === "number" && Number.isFinite(parsed.total) ? parsed.total : 0;
      this.days = typeof parsed.days === "object" && parsed.days !== null ? (parsed.days as Record<string, number>) : {};
    } catch {
      /* 存储损坏就从零开始 */
    }
  }

  private persist(): void {
    localStorage.setItem(LS_STATS, JSON.stringify({ total: this.total, days: this.days }));
  }

  /** 只保留 KEEP_DAYS 天内的按日计数。 */
  private prune(): void {
    const keep = new Set<string>();
    for (let i = 0; i < KEEP_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keep.add(dateKey(d));
    }
    this.days = Object.fromEntries(Object.entries(this.days).filter(([k]) => keep.has(k)));
  }
}

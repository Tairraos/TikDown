/**
 * 黑白双主题（TD-FE-018）：light=白底黑框 / dark=黑底白框。
 * 持久化 localStorage；未持久化时跟随系统 prefers-color-scheme。
 * 应用方式 = <html data-theme="...">，CSS 变量按属性切换。
 */
export type Theme = "light" | "dark";

const LS_THEME = "tikdown.theme";

export function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 已保存的选择优先；否则跟随系统。 */
export function loadTheme(): Theme {
  const raw = localStorage.getItem(LS_THEME);
  if (raw === "light" || raw === "dark") return raw;
  return systemPrefersDark() ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** 持久化并立即生效。 */
export function saveTheme(theme: Theme): void {
  localStorage.setItem(LS_THEME, theme);
  applyTheme(theme);
}

/** 侧栏按钮入口：亮暗互换。 */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  saveTheme(next);
  return next;
}

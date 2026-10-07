/**
 * 图标注册表:lucide-static 原始 SVG(vite ?raw 内联)。
 * 全部 stroke="currentColor",颜色随文字色;统一经 icon() 输出以控制尺寸。
 * 新增图标:先确认 lucide-static/icons/<name>.svg 存在,再登记到 import 表。
 */
import clipboardPaste from "lucide-static/icons/clipboard-paste.svg?raw";
import folderOpen from "lucide-static/icons/folder-open.svg?raw";
import settings from "lucide-static/icons/settings.svg?raw";
import download from "lucide-static/icons/download.svg?raw";
import x from "lucide-static/icons/x.svg?raw";
import rotateCw from "lucide-static/icons/rotate-cw.svg?raw";
import circleCheck from "lucide-static/icons/circle-check.svg?raw";
import circleAlert from "lucide-static/icons/circle-alert.svg?raw";
import clock from "lucide-static/icons/clock.svg?raw";
import arrowDown from "lucide-static/icons/arrow-down.svg?raw";
import moon from "lucide-static/icons/moon.svg?raw";
import sun from "lucide-static/icons/sun.svg?raw";

export type IconName =
  | "clipboard-paste"
  | "folder-open"
  | "settings"
  | "download"
  | "x"
  | "rotate-cw"
  | "circle-check"
  | "circle-alert"
  | "clock"
  | "arrow-down"
  | "moon"
  | "sun";

const REGISTRY: Record<IconName, string> = {
  "clipboard-paste": clipboardPaste,
  "folder-open": folderOpen,
  settings,
  download,
  x,
  "rotate-cw": rotateCw,
  "circle-check": circleCheck,
  "circle-alert": circleAlert,
  clock,
  "arrow-down": arrowDown,
  moon,
  sun,
};

/** 返回内联 SVG 的元素。size 单位 px,默认 16。 */
export function icon(name: IconName, size = 16): HTMLElement {
  const span = document.createElement("span");
  span.className = "icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = REGISTRY[name];
  const svg = span.firstElementChild as SVGElement | null;
  if (svg) {
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
  }
  return span;
}

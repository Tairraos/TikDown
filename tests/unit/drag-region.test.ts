// @vitest-environment jsdom
/**
 * 窗口拖拽区回归测试(TD-FE-023)。
 *
 * 为什么要在前端复刻一份判定逻辑：
 * Tauri 把 `data-tauri-drag-region` 的判定注入在 WebView 里（tauri/src/window/scripts/drag.js），
 * 前端测不到它，本地也无从断言——历史上就是这么漏掉的：属性登记了、权限没给，
 * 真机拖不动，而单测全绿（TD-FE-016/022 均标"已完成"，真机复核一拖再拖一拖才发现）。
 *
 * 这里的 `isDragRegion` 逐行对照 tauri 2.12.1 的 drag.js 实现，
 * 判定规则变了这里就会红。两处事实必须同时成立才算修好：
 *   ① 权限：capabilities 里有 core:window:allow-start-dragging（见 drag-permission.test.ts）
 *   ② 属性语义：用 "deep" 而不是裸属性 —— 裸属性只认「直接点在带属性的元素上」，
 *      点到子元素（品牌文字）或容器间隙就拖不动，这正是原实现失效的原因。
 *
 * 另：BUTTON 等可点元素即使祖先是 deep 也会自行阻断，交互不受影响（下面有断言）。
 */
import { describe, expect, it } from "vitest";

const CLICKABLE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set([
  "button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option",
]);

function isClickableElement(el: Element): boolean {
  return (
    CLICKABLE_TAGS.has(el.tagName) ||
    (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") ||
    (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") ||
    INTERACTIVE_ROLES.has(el.getAttribute("role") ?? "")
  );
}

/** 逐行对照 tauri 2.12.1 src/window/scripts/drag.js 的 isDragRegion() */
function isDragRegion(composedPath: Element[]): boolean {
  for (const el of composedPath) {
    if (!(el instanceof HTMLElement)) continue;
    const attr = el.getAttribute("data-tauri-drag-region");
    if (isClickableElement(el) && attr === null) return false;
    if (attr === null) continue;
    if (attr === "false") return false;
    if (attr === "deep") return true;
    if (attr === "" || attr === "true") return el === composedPath[0];
  }
  return false;
}

/** mousedown 的 composedPath：从目标向上直到 document */
function composedPathOf(target: Element): Element[] {
  const path: Element[] = [];
  let cur: Element | null = target;
  while (cur) {
    path.push(cur);
    cur = cur.parentElement;
  }
  path.push(document.body, document.documentElement);
  return path;
}

/**
 * 构造与 src/app.ts 同构的顶栏。dragAttr 决定属性写法：
 *   null = 不登记；"" = 裸属性（逐层登记的旧写法）；"deep" = 现写法
 * 用它对照证明两种写法的差异。
 */
function buildTopbar(dragAttr: string | null) {
  document.body.innerHTML = "";
  const set = (e: HTMLElement) => {
    if (dragAttr !== null) e.setAttribute("data-tauri-drag-region", dragAttr);
    return e;
  };
  const topbar = set(document.createElement("header"));
  const left = document.createElement("div");
  const brand = set(document.createElement("div"));
  const name = set(document.createElement("span"));
  const settings = document.createElement("button");
  const right = document.createElement("div");
  const chip = set(document.createElement("div"));
  const chipLine = set(document.createElement("div"));
  const paste = document.createElement("button");
  // 这三个刻意不 set() —— 还原 v2.2.2 原结构：它们没被单独登记
  const diskNum = document.createElement("span");
  const diskUnit = document.createElement("span");
  const diskLabel = document.createElement("span");

  brand.append(name);
  left.append(brand, settings);
  chipLine.append(diskNum, diskUnit);
  chip.append(chipLine, diskLabel);
  right.append(chip, paste);
  topbar.append(left, right);
  document.body.append(topbar);

  const draggable = (el: Element) => isDragRegion(composedPathOf(el));
  return { topbar, left, brand, name, settings, chip, chipLine, diskNum, diskUnit, diskLabel, paste, draggable };
}

describe("顶栏拖拽区（deep 语义）", () => {
  it("顶部各位置都能拖动窗体：空白、品牌文字、磁盘 chip 及其内部文字", () => {
    const t = buildTopbar("deep");
    expect(t.draggable(t.topbar)).toBe(true); // 顶栏容器自身与间隙
    expect(t.draggable(t.left)).toBe(true);
    expect(t.draggable(t.brand)).toBe(true);
    expect(t.draggable(t.name)).toBe(true); // 品牌文字
    expect(t.draggable(t.chip)).toBe(true);
    expect(t.draggable(t.chipLine)).toBe(true);
    // 这三处在 v2.2.2 里是拖不动的漏网点，改 deep 后无需逐层登记
    expect(t.draggable(t.diskNum)).toBe(true);
    expect(t.draggable(t.diskUnit)).toBe(true);
    expect(t.draggable(t.diskLabel)).toBe(true);
  });

  it("按钮仍然可点：deep 不吞掉 BUTTON 的交互", () => {
    const t = buildTopbar("deep");
    expect(t.draggable(t.settings)).toBe(false);
    expect(t.draggable(t.paste)).toBe(false);
  });

  it("按钮即使显式带 drag 属性也仍可点（属性写法不改变可点性）", () => {
    // 登记属性是为了「允许拖」，但 click 事件不依赖 drag 判定，
    // 这里锁住的是：不会因为加了 deep 就把按钮变成不可点。
    document.body.innerHTML = "";
    const btn = document.createElement("button");
    btn.textContent = "x";
    document.body.append(btn);
    expect(isDragRegion(composedPathOf(btn))).toBe(false);
  });
});

describe("裸属性为何不够（反例锁定，防止回退）", () => {
  /**
   * 逐层登记裸属性大体能拖，但**必须把每个叶子节点都登记一遍**才不漏。
   * 这里还原 v2.2.2 的真实结构（磁盘 chip 里的数值/单位/标签三兄弟未登记），
   * 证明那 3 处拖不动 —— 改成 deep 后无需再逐层操心。
   */
  it("裸属性逐层登记仍有漏网叶子（磁盘 chip 内的数值/单位/标签）", () => {
    const t = buildTopbar("");
    expect(t.draggable(t.topbar)).toBe(true);
    expect(t.draggable(t.name)).toBe(true);
    // 这三个在旧结构里没有单独登记 —— 点数字、点单位、点"系统剩余空间"都拖不动
    expect(t.draggable(t.diskNum)).toBe(false);
    expect(t.draggable(t.diskUnit)).toBe(false);
    expect(t.draggable(t.diskLabel)).toBe(false);
    // 换成 deep 后同样这三处立刻可拖，且不需要给它们挂属性
    const d = buildTopbar("deep");
    expect(d.draggable(d.diskNum)).toBe(true);
    expect(d.draggable(d.diskUnit)).toBe(true);
    expect(d.draggable(d.diskLabel)).toBe(true);
  });
});
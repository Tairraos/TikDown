import { SettingsStore } from "./state/settings";
import { TaskStore } from "./state/tasks";
import { StatsStore } from "./state/stats";
import { invoke, readClipboard } from "./lib/ipc";
import { detectPlatformEntry, extractUrls } from "./lib/types";
import { icon } from "./lib/icons";
import { lang, setLang, t } from "./lib/i18n";
import { currentTheme, toggleTheme } from "./lib/theme";
import { CorePanelView } from "./ui/corePanel";
import { SettingsPanelView } from "./ui/settingsPanel";
import { TaskListView } from "./ui/taskList";
import { clear, el } from "./ui/dom";

/** 磁盘剩余的大数字展示:数值 + 短单位(G 而非 GB,参考图样式)。 */
export function bigBytes(n: number | null): { num: string; unit: string } {
  if (!n || n <= 0) return { num: "—", unit: "" };
  const u = ["B", "K", "M", "G", "T"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return { num: i === 0 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ""), unit: u[i] };
}

/**
 * 应用装配(TD-FE-021 参考图,单列布局):
 * 顶栏 = 品牌+版本+设置/主题 ｜ 磁盘剩余黄chip + 粘贴/下载按钮;
 * 任务列表;底部黑色状态栏 = 组件tag+消息 ｜ 四组计数。
 */
export function mount(root: HTMLElement) {
  const settingsStore = new SettingsStore();
  const taskStore = new TaskStore(
    () => settingsStore.settings,
    () => settingsStore.targetDir
  );
  const statsStore = new StatsStore();

  clear(root);
  const app = el("div", { class: "app" });
  root.append(app);

  // ---- 顶栏(兼拖拽区) ----
  const brand = el(
    "div",
    { class: "brand", "data-tauri-drag-region": true },
    el("span", { class: "brand-name", text: "TikDown", "data-tauri-drag-region": true }),
    el("span", { class: "ver", text: `v${__APP_VERSION__}`, "data-tauri-drag-region": true })
  );
  const settingsBtn = el("button", { class: "icon-btn", "aria-label": t("settings") }, icon("settings", 18));
  const themeBtn = el("button", { class: "icon-btn" });
  const diskNum = el("span", { class: "disk-num" });
  const diskUnit = el("span", { class: "disk-unit" });
  const diskLabel = el("span", { class: "disk-label", text: t("diskFree") });
  const diskChip = el(
    "div",
    { class: "disk-chip", "data-tauri-drag-region": true },
    el("div", { class: "disk-line", "data-tauri-drag-region": true }, diskNum, diskUnit),
    diskLabel
  );
  const pasteBtn = el(
    "button",
    { class: "paste-btn", title: t("pasteTitle") },
    icon("clipboard-paste", 20),
    el("span", { class: "paste-label" })
  );
  // 拖拽区(TD-FE-016/022):Tauri 只认 mousedown 目标上的属性,
  // 顶栏每一层容器都要登记,否则点到容器/间隙就拖不动(按钮自身不受影响)
  const topbar = el(
    "header",
    { class: "topbar", "data-tauri-drag-region": true },
    el("div", { class: "topbar-left", "data-tauri-drag-region": true }, brand, settingsBtn, themeBtn),
    el("div", { class: "topbar-right", "data-tauri-drag-region": true }, diskChip, pasteBtn)
  );

  const list = el("section", { class: "list" });

  // ---- 底部状态栏:左 = 组件 tag + 消息;右 = 四组计数(参考图) ----
  const statusMsg = el("span", { class: "status-msg" });
  const coreContainer = el("div", { class: "core-tags" });
  const counts = {
    ready: el("span", { class: "count" }),
    downloading: el("span", { class: "count" }),
    done: el("span", { class: "count" }),
    failed: el("span", { class: "count" }),
  };
  const countItem = (ic: Parameters<typeof icon>[0], node: HTMLElement) =>
    el("span", { class: "count-item" }, icon(ic, 13), node);
  const queue = el(
    "div",
    { class: "queue" },
    countItem("clock", counts.ready),
    countItem("arrow-down", counts.downloading),
    countItem("circle-check", counts.done),
    countItem("circle-alert", counts.failed)
  );
  const statusbar = el(
    "footer",
    { class: "statusbar" },
    el("div", { class: "status-left" }, coreContainer, statusMsg),
    queue
  );

  app.append(topbar, list, statusbar);

  // ---- 消息:按 key 记录,语言切换时随 render 重翻 ----
  let msgKey: string | null = null;
  let msgParams: Record<string, string | number> | undefined;
  const setMsg = (key: string, params?: Record<string, string | number>) => {
    msgKey = key;
    msgParams = params;
    statusMsg.textContent = t(key, params);
  };

  // ---- 磁盘剩余(TD-CORE-010):启动/完成/设置变化时刷新 ----
  let diskBytes: number | null = null;
  async function refreshDisk() {
    const dir = settingsStore.targetDir;
    if (!dir) {
      diskBytes = null;
      return;
    }
    try {
      diskBytes = await invoke<number>("disk_free", { path: dir });
    } catch {
      diskBytes = null;
    }
  }
  function renderDisk() {
    const { num, unit } = bigBytes(diskBytes);
    diskNum.textContent = num;
    diskUnit.textContent = unit;
  }

  // ---- 视图 ----
  const taskListView = new TaskListView(list, (url) => {
    // 平台标签随界面语言取中/英文(TD-FE-019/021)
    const entry = detectPlatformEntry(url);
    return entry ? (lang() === "zh" ? entry.label : entry.labelEn) : null;
  }, {
    onFormat: (id, formatId) => taskStore.setFormat(id, formatId),
    onStart: (t_) => taskStore.startOne(t_),
    onCancel: (id) => taskStore.cancel(id),
    onRemove: (id) => {
      if (taskStore.remove(id)) setMsg("msgRemoved", { n: 1 });
    },
  });
  // 设置弹层延迟到首次打开时构造——构造即挂载 overlay 会把整页蒙灰(E2E 发现)
  let settingsModal: SettingsPanelView | null = null;
  function openSettings() {
    if (!settingsModal) {
      settingsModal = new SettingsPanelView(
        app,
        () => taskStore.statuses,
        () => settingsStore.settings,
        () => settingsStore.targetDir,
        (d) => settingsStore.setTargetDir(d),
        (s) => settingsStore.save(s),
        // 关闭必须连实例一起清掉:只 remove DOM 会让 openSettings 误判"已打开",
        // 弹层从此再也打不开(TD-FE-009,E2E 发现)
        () => {
          settingsModal?.container.remove();
          settingsModal = null;
        },
        () => void taskStore.refreshStatus(),
        // 统计收纳进设置弹层底行(TD-FE-021 新草图无侧栏)
        () => ({ total: statsStore.total, recent7: statsStore.recent7 }),
        () => {
          statsStore.reset();
          settingsModal?.render();
        }
      );
    }
    settingsModal.render();
  }
  const coreView = new CorePanelView(coreContainer, () => void taskStore.refreshStatus(), openSettings);
  settingsBtn.onclick = openSettings;

  // 主题切换:亮暗互换,图标/提示随状态
  const renderThemeBtn = () => {
    const dark = currentTheme() === "dark";
    themeBtn.replaceChildren(icon(dark ? "sun" : "moon", 18));
    themeBtn.title = t(dark ? "themeToLight" : "themeToDark");
    themeBtn.setAttribute("aria-label", themeBtn.title);
  };
  themeBtn.onclick = () => {
    toggleTheme();
    renderThemeBtn();
  };

  // v1 交互:粘贴按钮读取剪贴板 → 解析(支持多行批量)
  const paste = async () => {
    const text = await readClipboard();
    const urls = extractUrls(text);
    if (urls.length === 0) {
      setMsg("msgNoLink");
      return;
    }
    const added = await taskStore.addUrls(text);
    setMsg(added > 0 ? "msgAdded" : "msgNoNew", added > 0 ? { n: added } : undefined);
  };
  pasteBtn.onclick = () => void paste();

  // 下载成功 → 统计 +1,并刷新磁盘剩余(文件落盘后空间变化)
  taskStore.onDone(() => {
    statsStore.add(1);
    void refreshDisk().then(renderDisk);
  });
  settingsBtn.setAttribute("aria-label", t("settings"));

  // ---- 静态文案(语言切换时整体重刷) ----
  function applyStaticTexts() {
    diskLabel.textContent = t("diskFree");
    diskChip.title = t("diskFree");
    (pasteBtn.querySelector(".paste-label") as HTMLElement).textContent = t("pasteDownload");
    pasteBtn.title = t("pasteTitle");
    settingsBtn.title = t("settings");
    settingsBtn.setAttribute("aria-label", t("settings"));
    renderThemeBtn();
  }

  function renderQueue() {
    const c = taskStore.counts();
    counts.ready.textContent = String(c.ready);
    counts.downloading.textContent = String(taskStore.tasks.filter((x) => x.status === "downloading" || x.status === "merging").length);
    counts.done.textContent = String(c.done);
    counts.failed.textContent = String(c.failed);
  }

  // ---- 渲染循环(store → view) ----
  function render() {
    setLang(settingsStore.settings.language);
    applyStaticTexts();

    pasteBtn.disabled = taskStore.busy || !taskStore.coreReady;
    pasteBtn.classList.toggle("disabled", taskStore.busy || !taskStore.coreReady);
    if (msgKey) statusMsg.textContent = t(msgKey, msgParams);

    renderDisk();
    renderQueue();
    coreView.render(taskStore.statuses);
    taskListView.render(taskStore.tasks);
  }
  taskStore.onChange(render);
  settingsStore.onChange(() => {
    void refreshDisk().then(renderDisk); // 换下载目录后空间归属变化
    render();
  });

  void taskStore.refreshStatus().then(() => {
    if (!taskStore.coreReady) setMsg("msgCoreNotReady");
  });
  void refreshDisk().then(renderDisk);
  render();
}

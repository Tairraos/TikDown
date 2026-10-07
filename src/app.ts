import { SettingsStore } from "./state/settings";
import { TaskStore } from "./state/tasks";
import { StatsStore } from "./state/stats";
import { invoke, readClipboard } from "./lib/ipc";
import { detectPlatform, extractUrls, PLATFORMS } from "./lib/types";
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
 * 应用装配(TD-FE-017 参考图布局):
 * 左侧栏 = 品牌/统计卡/大粘贴按钮/设置+主题切换;主区 = 宣传语条/任务卡列表/状态栏+队列汇总。
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

  // ---- 侧栏 ----
  const statCount = el("span", { class: "stat-num" });
  const statLabel1 = el("span", { class: "stat-label-text", text: t("stat7dTotal") });
  const resetBtn = el("button", { class: "stat-reset", title: t("resetTitle"), text: t("reset") });
  const statDiskNum = el("span", { class: "stat-num" });
  const statDiskUnit = el("span", { class: "stat-unit" });
  const statLabel2 = el("span", { class: "stat-label-text", text: t("diskFree") });

  const brand = el(
    "div",
    { class: "brand", "data-tauri-drag-region": true },
    el("span", { class: "brand-name", text: "TikDown" }),
    el("span", { class: "ver", text: `v${__APP_VERSION__}` })
  );
  const pasteBtn = el("button", { class: "paste-btn", title: t("pasteTitle") }, el("span", { class: "paste-label" }));
  const settingsBtn = el(
    "button",
    { class: "side-settings", "aria-label": t("settings") },
    icon("settings", 16),
    el("span", { class: "side-settings-label" })
  );
  const themeBtn = el("button", { class: "theme-toggle" });

  const sidebar = el(
    "aside",
    { class: "sidebar" },
    brand,
    el(
      "div",
      { class: "stat-card" },
      el("div", { class: "stat-line" }, statCount),
      el("div", { class: "stat-label" }, statLabel1),
      resetBtn
    ),
    el(
      "div",
      { class: "stat-card" },
      el("div", { class: "stat-line" }, statDiskNum, statDiskUnit),
      el("div", { class: "stat-label" }, statLabel2)
    ),
    pasteBtn,
    el("div", { class: "side-foot" }, settingsBtn, themeBtn)
  );

  // ---- 主区:宣传语条(兼拖拽)/任务列表/状态栏 ----
  const tagline = el("header", { class: "tagline", "data-tauri-drag-region": true });
  const list = el("section", { class: "list" });
  const statusMsg = el("span", { class: "status-msg" });
  const coreContainer = el("div", { class: "core-tags" });
  const queue = el("div", { class: "queue" });
  const statusbar = el(
    "footer",
    { class: "statusbar" },
    el("div", { class: "status-left" }, coreContainer, statusMsg),
    queue
  );
  const main = el("main", { class: "main" }, tagline, list, statusbar);
  app.append(sidebar, main);

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

  // ---- 视图 ----
  const taskListView = new TaskListView(list, detectPlatform, {
    onFormat: (id, formatId) => taskStore.setFormat(id, formatId),
    onStart: (t_) => taskStore.startOne(t_),
    onCancel: (id) => taskStore.cancel(id),
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
        () => void taskStore.refreshStatus()
      );
    }
    settingsModal.render();
  }
  const coreView = new CorePanelView(coreContainer, () => void taskStore.refreshStatus(), openSettings);
  settingsBtn.onclick = openSettings;

  // 主题切换:亮暗互换,图标/提示随状态
  const renderThemeBtn = () => {
    const dark = currentTheme() === "dark";
    themeBtn.replaceChildren(icon(dark ? "sun" : "moon", 17));
    themeBtn.title = t(dark ? "themeToLight" : "themeToDark");
    themeBtn.setAttribute("aria-label", themeBtn.title);
  };
  themeBtn.onclick = () => {
    toggleTheme();
    renderThemeBtn();
  };

  // v1 交互:大按钮读取剪贴板 → 解析(支持多行批量)
  const paste = async () => {
    const text = await readClipboard();
    const urls = extractUrls(text);
    if (urls.length === 0) {
      setMsg("msgNoLink");
      return;
    }
    const before = taskStore.tasks.length;
    await taskStore.addUrls(text);
    const added = taskStore.tasks.length - before;
    setMsg(added > 0 ? "msgAdded" : "msgNoNew", added > 0 ? { n: added } : undefined);
  };
  pasteBtn.onclick = () => void paste();

  // 下载成功 → 统计 +1,并刷新磁盘剩余(文件落盘后空间变化)
  statsStore.onChange(() => {
    renderStats();
    void refreshDisk().then(renderDisk);
  });
  taskStore.onDone(() => statsStore.add(1));
  resetBtn.onclick = () => statsStore.reset();

  // ---- 静态文案(语言/主题切换时整体重刷) ----
  function applyStaticTexts() {
    statLabel1.textContent = t("stat7dTotal");
    statLabel2.textContent = t("diskFree");
    resetBtn.textContent = t("reset");
    resetBtn.title = t("resetTitle");
    (pasteBtn.firstChild as HTMLElement).textContent = t("pasteDownload");
    pasteBtn.title = t("pasteTitle");
    (settingsBtn.lastChild as HTMLElement).textContent = t("settings");
    settingsBtn.setAttribute("aria-label", t("settings"));

    const labels = PLATFORMS.map((p) => (lang() === "zh" ? p.label : p.labelEn));
    tagline.textContent = t("tagline", { list: labels.join(lang() === "zh" ? "、" : ", ") });
    renderThemeBtn();
  }

  function renderStats() {
    statCount.textContent = `${statsStore.recent7}/${statsStore.total}`;
  }

  function renderDisk() {
    const { num, unit } = bigBytes(diskBytes);
    statDiskNum.textContent = num;
    statDiskUnit.textContent = unit;
  }

  function renderQueue() {
    const c = taskStore.counts();
    const active = taskStore.tasks.filter((x) => x.status === "downloading" || x.status === "merging").length;
    const seg = (label: string, n: number) =>
      el("span", { class: "queue-seg" }, el("span", { class: "queue-num", text: String(n) }), label);
    clear(queue);
    queue.append(
      seg(t("qReady"), c.ready),
      seg(t("qActive"), active),
      seg(t("qDone"), c.done),
      seg(t("qFailed"), c.failed)
    );
    if (c.skipped > 0) queue.append(seg(t("qSkipped"), c.skipped));
  }

  // ---- 渲染循环(store → view) ----
  function render() {
    setLang(settingsStore.settings.language);
    applyStaticTexts();

    pasteBtn.disabled = taskStore.busy || !taskStore.coreReady;
    pasteBtn.classList.toggle("disabled", taskStore.busy || !taskStore.coreReady);
    if (msgKey) statusMsg.textContent = t(msgKey, msgParams);

    renderStats();
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

import { SettingsStore } from "./state/settings";
import { TaskStore } from "./state/tasks";
import { readClipboard } from "./lib/ipc";
import { detectPlatform, extractUrls } from "./lib/types";
import { icon } from "./lib/icons";
import { CorePanelView } from "./ui/corePanel";
import { SettingsPanelView } from "./ui/settingsPanel";
import { TaskListView } from "./ui/taskList";
import { clear, el } from "./ui/dom";

/** 应用装配(v1 视觉):左上大粘贴按钮 + 右上目录/设置工具条 + 任务列表 + 状态栏。 */
export function mount(root: HTMLElement) {
  const settingsStore = new SettingsStore();
  const taskStore = new TaskStore(
    () => settingsStore.settings,
    () => settingsStore.targetDir
  );

  clear(root);
  const app = el("div", { class: "app" });
  root.append(app);

  // ---- 顶栏(TD-FE-016):40px 拖拽区;左品牌版本 / 中粘贴 / 右设置 ----
  const brand = el("div", { class: "brand" }, "TikDown", el("span", { class: "ver", text: `v${__APP_VERSION__}` }));
  const pasteBtn = el(
    "button",
    { class: "paste-btn", title: "读取剪贴板并解析(支持一次多条链接)" },
    icon("clipboard-paste", 18),
    el("span", { class: "paste-label", text: "粘贴/下载" })
  );
  const settingsBtn = el("button", { class: "icon-btn", title: "设置", "aria-label": "设置" }, icon("settings", 17));

  const topbar = el(
    "header",
    { class: "topbar", "data-tauri-drag-region": true },
    brand,
    pasteBtn,
    el("div", { class: "topbar-right" }, settingsBtn)
  );
  app.append(topbar);

  const coreContainer = el("div", { class: "core-panel" });
  app.append(coreContainer);

  const list = el("section", { class: "list" });
  app.append(list);

  // ---- 状态栏:左 = 消息;右 = 彩色计数(v1 布局) ----
  const msgSpan = el("span", { class: "status-msg" });
  const counts = {
    ready: el("span", { class: "count warn" }),
    downloading: el("span", { class: "count accent" }),
    done: el("span", { class: "count ok" }),
    failed: el("span", { class: "count err" }),
  };
  const countItem = (ic: Parameters<typeof icon>[0], node: HTMLElement) =>
    el("span", { class: "count-item" }, icon(ic, 13), node);
  app.append(
    el(
      "footer",
      { class: "statusbar" },
      msgSpan,
      el("div", { class: "spacer" }),
      countItem("clock", counts.ready),
      countItem("arrow-down", counts.downloading),
      countItem("circle-check", counts.done),
      countItem("circle-alert", counts.failed)
    )
  );

  const setMsg = (text: string) => {
    msgSpan.textContent = text;
  };

  // ---- 视图 ----
  const taskListView = new TaskListView(list, detectPlatform, {
    onFormat: (id, formatId) => taskStore.setFormat(id, formatId),
    onStart: (t) => taskStore.startOne(t),
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

  // v1 交互:大按钮读取剪贴板 → 解析(支持多行批量)
  const paste = async () => {
    const text = await readClipboard();
    const urls = extractUrls(text);
    if (urls.length === 0) {      setMsg("剪贴板里没有链接。复制视频链接后再点「粘贴/下载」。");
      return;
    }
    const before = taskStore.tasks.length;
    await taskStore.addUrls(text);
    const added = taskStore.tasks.length - before;
    setMsg(added > 0 ? `已添加 ${added} 个新任务,图文帖会自动跳过。` : "没有发现新链接(可能已添加过)。");
  };
  pasteBtn.onclick = () => void paste();

  // ---- 渲染循环(store → view) ----
  function render() {
    pasteBtn.disabled = taskStore.busy || !taskStore.coreReady;
    pasteBtn.classList.toggle("disabled", taskStore.busy || !taskStore.coreReady);

    const c = taskStore.counts();
    counts.ready.textContent = String(c.ready);
    counts.downloading.textContent = String(taskStore.tasks.filter((t) => t.status === "downloading" || t.status === "merging").length);
    counts.done.textContent = String(c.done);
    counts.failed.textContent = String(c.failed);

    coreView.render(taskStore.statuses);
    taskListView.render(taskStore.tasks);
  }
  taskStore.onChange(render);
  settingsStore.onChange(render);

  void taskStore.refreshStatus().then(() => {
    if (!taskStore.coreReady) setMsg("核心组件未就绪:请先在下方安装 yt-dlp。");
  });
  render();
}

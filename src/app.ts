import { open } from "@tauri-apps/plugin-dialog";
import { SettingsStore } from "./state/settings";
import { TaskStore } from "./state/tasks";
import { detectPlatform, extractUrls } from "./lib/types";
import { CorePanelView } from "./ui/corePanel";
import { SettingsPanelView } from "./ui/settingsPanel";
import { TaskListView } from "./ui/taskList";
import { clear, el } from "./ui/dom";

/** 应用装配：把 store 与 UI 视图接到静态壳上（结构复用原 React 版的 class 命名）。 */
export function mount(root: HTMLElement) {
  const settingsStore = new SettingsStore();
  const taskStore = new TaskStore(
    () => settingsStore.settings,
    () => settingsStore.targetDir
  );

  // ---- 静态壳 ----
  clear(root);
  const app = el("div", { class: "app" });
  root.append(app);

  const dirBtn = el("button", { class: "btn ghost" });
  const settingsBtn = el("button", { class: "btn ghost", text: "设置" });
  app.append(
    el(
      "header",
      { class: "topbar" },
      el("div", { class: "brand", text: "TikDown" }),
      el("div", { class: "actions" }, dirBtn, settingsBtn)
    )
  );

  const coreContainer = el("div", { class: "core-panel" });
  app.append(coreContainer);

  const textarea = el("textarea", {
    rows: "3",
    placeholder: "粘贴链接，支持多行批量（抖音 / TikTok / 小红书 / Instagram / Pinterest / X / B站 / YouTube）",
  }) as HTMLTextAreaElement;
  const parseBtn = el("button", { class: "btn", text: "解析" });
  const downloadAllBtn = el("button", { class: "btn primary", text: "全部下载" });
  const hint = el("span", { class: "dim-hint", text: "登录墙内容？在设置里配置 Cookie" });
  app.append(
    el(
      "section",
      { class: "input-panel" },
      textarea,
      el("div", { class: "row" }, hint, el("div", { class: "spacer" }), parseBtn, downloadAllBtn)
    )
  );

  const list = el("section", { class: "list" });
  app.append(list);

  const statusbar = el(
    "footer",
    { class: "statusbar" },
    el("span", { class: "total" }),
    el("span", { class: "ok" }),
    el("span", { class: "warn" }),
    el("span", { class: "err" })
  );
  app.append(statusbar);

  // ---- 视图 ----
  const taskListView = new TaskListView(list, detectPlatform, {
    onFormat: (id, formatId) => taskStore.setFormat(id, formatId),
    onStart: (t) => taskStore.startOne(t),
    onCancel: (id) => taskStore.cancel(id),
  });
  const coreView = new CorePanelView(coreContainer, () => void taskStore.refreshStatus(), () => {
    settingsModal.render();
  });
  const settingsModal = new SettingsPanelView(
    app,
    () => taskStore.statuses,
    () => settingsStore.settings,
    (s) => settingsStore.save(s),
    () => settingsModal.container.remove(),
    () => void taskStore.refreshStatus()
  );

  const openSettings = () => {
    settingsModal.render();
  };
  settingsBtn.onclick = openSettings;

  const pickDir = async () => {
    const d = await open({ directory: true });
    if (d && typeof d === "string") settingsStore.setTargetDir(d);
  };
  dirBtn.onclick = () => void pickDir();

  const submit = () => void taskStore.addUrls(textarea.value);
  parseBtn.onclick = submit;
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });
  textarea.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (extractUrls(text).length > 0) {
      e.preventDefault();
      void taskStore.addUrls(text);
    }
  });
  downloadAllBtn.onclick = () => taskStore.startAll();

  // ---- 渲染循环（store → view） ----
  function render() {
    const dir = settingsStore.targetDir;
    dirBtn.textContent = dir ? `目录：${shorten(dir)}` : "选择下载目录";

    const ready = taskStore.coreReady;
    textarea.disabled = taskStore.busy || !ready;
    parseBtn.disabled = taskStore.busy || !ready;
    textarea.placeholder = ready
      ? "粘贴链接，支持多行批量（抖音 / TikTok / 小红书 / Instagram / Pinterest / X / B站 / YouTube）"
      : "请先在下方安装 yt-dlp";
    parseBtn.textContent = taskStore.busy ? "解析中…" : "解析";

    const c = taskStore.counts();
    downloadAllBtn.disabled = !dir || c.ready === 0;
    downloadAllBtn.title = !dir ? "先选择下载目录" : `下载 ${c.ready} 条`;
    downloadAllBtn.textContent = c.ready > 0 ? `全部下载（${c.ready}）` : "全部下载";

    const parts = statusbar.children;
    (parts[0] as HTMLElement).textContent = `共 ${c.total}`;
    (parts[1] as HTMLElement).textContent = `完成 ${c.done}`;
    (parts[2] as HTMLElement).textContent = `跳过 ${c.skipped}`;
    (parts[3] as HTMLElement).textContent = `失败 ${c.failed}`;

    coreView.render(taskStore.statuses);
    taskListView.render(taskStore.tasks);
  }
  taskStore.onChange(render);
  settingsStore.onChange(render);

  void taskStore.refreshStatus();
  render();
}

function shorten(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? "…/" + parts.slice(-2).join("/") : p;
}

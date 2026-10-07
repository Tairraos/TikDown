// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsStore } from "../../src/state/settings";
import { DEFAULT_SETTINGS, type Settings } from "../../src/lib/types";

const invoked: Array<{ cmd: string; args?: Record<string, unknown> }> = [];

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => {
    invoked.push({ cmd, args });
    return Promise.resolve(null);
  },
  listen: () => Promise.resolve(() => {}),
  defaultDownloadDir: () => Promise.resolve("/tmp/mock-downloads"),
}));

function raw(): Settings {
  return { ...DEFAULT_SETTINGS };
}

beforeEach(() => {
  localStorage.clear();
  invoked.length = 0;
});

describe("SettingsStore", () => {
  it("默认设置在构造时同步给后端(TD-CORE-001)", () => {
    new SettingsStore();
    expect(invoked[0]?.cmd).toBe("set_settings");
    expect(invoked[0]?.args?.newSettings).toMatchObject({ cookieMode: "none", maxConcurrent: 1, language: "system" });
  });

  it("语言设置默认跟随系统并可持久化(TD-FE-019)", () => {
    const store = new SettingsStore();
    expect(store.settings.language).toBe("system");
    store.save({ ...raw(), language: "en" });
    expect(JSON.parse(localStorage.getItem("tikdown.settings") ?? "{}").language).toBe("en");
    const reloaded = new SettingsStore();
    expect(reloaded.settings.language).toBe("en");
  });

  it("旧版本存储(无 language 字段)回落 system", () => {
    localStorage.setItem("tikdown.settings", JSON.stringify({ maxConcurrent: 2 }));
    const store = new SettingsStore();
    expect(store.settings.language).toBe("system");
  });

  it("save 持久化 localStorage 并再次同步后端", () => {
    const store = new SettingsStore();
    const next = { ...raw(), cookieMode: "browser" as const, cookieBrowser: "firefox" };
    store.save(next);
    const stored = JSON.parse(localStorage.getItem("tikdown.settings") ?? "{}");
    expect(stored).toMatchObject({
      cookieMode: "browser",
      cookieBrowser: "firefox",
    });
    const syncs = invoked.filter((i) => i.cmd === "set_settings");
    expect(syncs).toHaveLength(2);
    expect(syncs[1].args?.newSettings).toMatchObject({ cookieBrowser: "firefox" });
  });

  it("损坏的 localStorage 数据回落到默认设置", () => {
    localStorage.setItem("tikdown.settings", "{not json");
    const store = new SettingsStore();
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("targetDir 持久化并触发变更通知(TD-FE-005)", () => {
    const store = new SettingsStore();
    const seen: string[] = [];
    store.onChange(() => seen.push(store.targetDir));
    store.setTargetDir("/tmp/downloads");
    expect(localStorage.getItem("tikdown.targetDir")).toBe("/tmp/downloads");
    expect(seen).toEqual(["/tmp/downloads"]);
  });

  it("未持久化目录时自动解析默认下载目录(TD-FE-008)", async () => {
    const store = new SettingsStore();
    await vi.waitFor(() => expect(store.targetDir).toBe("/tmp/mock-downloads"));
    // 默认目录不写入 localStorage:下次启动重新解析,用户显式设置过的才持久化
    expect(localStorage.getItem("tikdown.targetDir")).toBeNull();
  });

  it("重启后从 localStorage 恢复设置与目录", () => {
    localStorage.setItem("tikdown.settings", JSON.stringify({ ...raw(), maxConcurrent: 3 }));
    localStorage.setItem("tikdown.targetDir", "/last/dir");
    const store = new SettingsStore();
    expect(store.settings.maxConcurrent).toBe(3);
    expect(store.targetDir).toBe("/last/dir");
  });
});

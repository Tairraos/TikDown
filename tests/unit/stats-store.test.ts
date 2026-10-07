// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { StatsStore, dateKey, sumLastDays } from "../../src/state/stats";

beforeEach(() => {
  localStorage.clear();
});

describe("dateKey/sumLastDays", () => {
  it("本地日期键格式 YYYY-MM-DD", () => {
    expect(dateKey(new Date(2026, 9, 7))).toBe("2026-10-07");
  });

  it("只累计窗口内的天", () => {
    const days = { "2026-10-07": 2, "2026-10-05": 3, "2026-09-01": 100 };
    // 从 2026-10-07 回溯 7 天:10-07..10-01,含 07 与 05
    expect(sumLastDays(days, 7)).toBe(5);
  });
});

describe("StatsStore", () => {
  it("add 计入 total 与当天,并持久化", () => {
    const store = new StatsStore();
    store.add();
    store.add();
    expect(store.total).toBe(2);
    expect(store.recent7).toBe(2);
    const stored = JSON.parse(localStorage.getItem("tikdown.stats") ?? "{}");
    expect(stored.total).toBe(2);
    expect(stored.days[dateKey()]).toBe(2);
  });

  it("recent7 只统计最近 7 天(旧数据剔除)", () => {
    const store = new StatsStore();
    const old = new Date();
    old.setDate(old.getDate() - 9);
    store.days[dateKey(old)] = 7; // 模拟历史遗留:只在 days 里,不在 total 口径
    store.add(2);
    expect(store.total).toBe(2);
    expect(store.recent7).toBe(2); // 9 天前的 7 不进 7 天窗
  });

  it("add 会清理窗口外的按日数据", () => {
    const store = new StatsStore();
    const old = new Date();
    old.setDate(old.getDate() - 120);
    store.days[dateKey(old)] = 5;
    store.add(1);
    expect(store.days[dateKey(old)]).toBeUndefined();
    // total 不回退:按日清理不影响累计
    expect(store.total).toBe(1);
  });

  it("reset 清零 total 与 days", () => {
    const store = new StatsStore();
    store.add(3);
    store.reset();
    expect(store.total).toBe(0);
    expect(store.recent7).toBe(0);
    expect(JSON.parse(localStorage.getItem("tikdown.stats") ?? "{}").total).toBe(0);
  });

  it("重启后从 localStorage 恢复", () => {
    localStorage.setItem("tikdown.stats", JSON.stringify({ total: 42, days: { [dateKey()]: 5 } }));
    const store = new StatsStore();
    expect(store.total).toBe(42);
    expect(store.recent7).toBe(5);
  });

  it("损坏数据回落零值", () => {
    localStorage.setItem("tikdown.stats", "{not json");
    const store = new StatsStore();
    expect(store.total).toBe(0);
    expect(store.days).toEqual({});
  });

  it("onChange 在 add/reset 时通知", () => {
    const store = new StatsStore();
    let calls = 0;
    store.onChange(() => calls++);
    store.add();
    store.reset();
    expect(calls).toBe(2);
  });
});

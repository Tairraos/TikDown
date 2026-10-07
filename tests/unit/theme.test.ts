// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, currentTheme, loadTheme, saveTheme, toggleTheme } from "../../src/lib/theme";

beforeEach(() => {
  localStorage.removeItem("tikdown.theme");
  document.documentElement.removeAttribute("data-theme");
});

describe("theme", () => {
  it("无持久化且无 matchMedia 时回落浅色", () => {
    expect(loadTheme()).toBe("light");
  });

  it("saveTheme 持久化并立即应用到 <html data-theme>", () => {
    saveTheme("dark");
    expect(localStorage.getItem("tikdown.theme")).toBe("dark");
    expect(currentTheme()).toBe("dark");
    expect(loadTheme()).toBe("dark");
  });

  it("toggleTheme 亮暗互换并持久化", () => {
    applyTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem("tikdown.theme")).toBe("light");
  });

  it("非法存储值回落浅色", () => {
    localStorage.setItem("tikdown.theme", "blue");
    expect(loadTheme()).toBe("light");
  });
});

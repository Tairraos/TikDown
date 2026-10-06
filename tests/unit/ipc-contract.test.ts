import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DownloadOptions, Settings } from "../../src/lib/types";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/ipc-contract.json", import.meta.url), "utf8")
) as { startDownloadOpts: DownloadOptions };

/**
 * 契约测试(TD-ARCH-001):前端发送的 payload 形状必须与 fixture 一致,
 * Rust 侧同一 fixture 反序列化(src-tauri/src/download/mod.rs)。两侧共同锁定契约。
 */
describe("ipc contract fixture", () => {
  it("fixture 形状满足前端 DownloadOptions 类型(编译期断言)", () => {
    const opts: DownloadOptions = fixture.startDownloadOpts;
    expect(opts.url).toBe("https://example.com/v");
    expect(opts.targetDir).toBe("/tmp/dl");
    expect(opts.formatId).toBeNull();
  });

  it("settings 字段满足 Settings 类型且与后端 serde camelCase 对齐", () => {
    const s: Settings = fixture.startDownloadOpts.settings;
    expect(s.cookieMode).toBe("browser");
    expect(s.cookieBrowser).toBe("chrome");
    expect(s.maxConcurrent).toBeUndefined(); // 前端本地设置不同步后端
  });

  it("settings 序列化后键名与 Rust Settings(serde camelCase)一致", () => {
    const keys = Object.keys(fixture.startDownloadOpts.settings).sort();
    expect(keys).toEqual(["cookieBrowser", "cookieFile", "cookieMode", "ffmpegPath", "ytdlpPath"]);
  });
});

// @vitest-environment jsdom
/**
 * 拖窗权限回归测试(TD-FE-023)。
 *
 * 根因：Tauri 注入的 drag.js 在 mousedown 时调 `plugin:window|start_dragging`，
 * 该命令受 capability ACL 管。capabilities/default.json 原先只有 core:default，
 * 而 core:window:default **不含** allow-start-dragging（见 acl-manifests），
 * 于是调用被静默拒绝——顶栏属性登记得再对也拖不动，且不报任何错。
 *
 * 这条测试的价值：权限是「加了才知道有效、少加就静默失效」的东西，
 * 必须由机器守着，不能靠人记得。真机回归过一次就能确认这是唯一缺失的一环。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 用 cwd 拼绝对路径而非 import.meta.url：本测试跑在 jsdom 环境下，
// 那里 import.meta.url 不是 file 协议，readFileSync 会直接抛错。
const fromRoot = (...p: string[]) => join(process.cwd(), ...p);

const capabilities = JSON.parse(
  readFileSync(fromRoot("src-tauri/capabilities/default.json"), "utf8")
) as { permissions: string[] };

describe("拖窗权限(TD-FE-023)", () => {
  it("capabilities 显式放行 start-dragging", () => {
    expect(capabilities.permissions).toContain("core:window:allow-start-dragging");
  });

  it("不会被 deny 变体反向覆盖", () => {
    expect(capabilities.permissions).not.toContain("core:window:deny-start-dragging");
  });
});

/**
 * 前提复核：core:default 展开后确实不含 start-dragging。
 * 如果上游 Tauri 哪天把它并进默认集，这条会红 —— 那时本测试与
 * capabilities 里的显式声明都变成冗余（无害），但值得知道并清理。
 *
 * gen/schemas 是构建产物且被 gitignore：CI 上必然存在，本地首次 clone 可能还没生成。
 * 缺文件时跳过前提复核而不是失败 —— 本测试的正题是上面那条
 *「capabilities 必须显式声明」，不该被构建时序连累。
 */
describe("core:window:default 不含 start-dragging（前提复核）", () => {
  it("确认默认集里没有，佐证必须显式声明", () => {
    const p = fromRoot("src-tauri/gen/schemas/acl-manifests.json");
    if (!existsSync(p)) return; // 未生成：跳过前提复核
    const manifest = JSON.parse(readFileSync(p, "utf8")) as Record<
      string,
      { default_permission?: { permissions?: string[] } }
    >;
    const perms = manifest["core:window"]?.default_permission?.permissions ?? [];
    expect(perms).not.toContain("allow-start-dragging");
    // 但双击最大化在默认集里 —— 说明"显式加 start-dragging"是精确补洞而非整体放开
    expect(perms).toContain("allow-internal-toggle-maximize");
  });
});
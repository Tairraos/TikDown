// @vitest-environment jsdom
/**
 * 错误码契约（TD-PROBE-006）。
 *
 * 后端 `src-tauri/src/errcode.rs` 的 CODES 与前端 `src/lib/errorAdvice.ts` 的
 * ERROR_CODES 必须是同一个集合：前端按 code 查翻译表，**少一个就意味着该错误
 * 永远只显示通用兜底**（用户看到"未知错误"却拿到一条有针对性的建议）。
 * 多一个则是死代码。
 *
 * 跨语言契约靠读 Rust 源码比对——不引入 Rust 构建产物做单测，
 * 保持 vitest 秒级反馈。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, adviceFor, adviceLines } from "../../src/lib/errorAdvice";

const fromRoot = (...p: string[]) => join(process.cwd(), ...p);

/** 从 Rust 源码里抠出 CODES 里的错误码字面量 */
function rustCodes(): string[] {
  const src = readFileSync(fromRoot("src-tauri/src/errcode.rs"), "utf8");
  const block = src.slice(src.indexOf("pub const CODES"));
  const end = block.indexOf("];");
  const body = block.slice(0, end);
  return [...body.matchAll(/\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
}

describe("错误码前后端契约(TD-PROBE-006)", () => {
  it("前后端错误码集合完全一致", () => {
    // 用仓库根而非 import.meta.url：jsdom 环境下前者不是 file 协议
    expect(new Set(rustCodes())).toEqual(new Set(ERROR_CODES));
  });

  it("每个错误码都有中英双语的完整解释", () => {
    for (const code of ERROR_CODES) {
      for (const lang of ["zh", "en"] as const) {
        const a = adviceFor(code, lang);
        expect(a.cause.length, `${code}/${lang} 缺 cause`).toBeGreaterThan(5);
        expect(a.fix.length, `${code}/${lang} 缺 fix`).toBeGreaterThan(5);
        // fix 必须给可执行动作，只有"请重试"这种等于没说
        expect(a.fix, `${code}/${lang} 的 fix 太空泛`).not.toMatch(/^.$/);
      }
    }
  });

  it("Unknown 是兜底且必然存在（上游文案会变，分类表必然滞后）", () => {
    expect(ERROR_CODES).toContain("Unknown");
    // 未知 code 回落 Unknown，不能返回 undefined —— 界面不能显示空白
    expect(adviceFor("SomeNewUpstreamError", "zh").cause).toBe(adviceFor("Unknown", "zh").cause);
    expect(adviceFor(null, "en").cause).toBe(adviceFor("Unknown", "en").cause);
    expect(adviceFor(undefined, "zh").fix).toBeTruthy();
  });

  it("tips 是多行结构：原因/怎么办(/注意)", () => {
    const lines = adviceLines("SignInRequired", "zh");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toMatch(/^原因：/);
    expect(lines[1]).toMatch(/^怎么办：/);
    const en = adviceLines("SignInRequired", "en");
    expect(en[0]).toMatch(/^Why:/);
    expect(en[1]).toMatch(/^Fix:/);
  });

  /** 英文界面必须整段英文：混一句中文进去等于没做国际化。 */
  it("英文界面下 tips 全英文（不夹中文）", () => {
    for (const code of ERROR_CODES) {
      for (const line of adviceLines(code, "en")) {
        expect(line, `${code} 的英文tips 夹了中文: ${line}`).not.toMatch(/[一-鿿]/);
      }
    }
  });

  /** TD-PROBE-005 的症状解释必须说清"不是你的 cookie 问题"——
   * 用户报这个错时的第一反应就是怀疑自己的 cookie。 */
  it("YouTube 客户端报错的解释点明与 cookie 无关并给出出路", () => {
    const zh = adviceFor("PlayerClientUnplayable", "zh");
    expect(zh.cause).toContain("不是");
    expect(zh.fix).toContain("关掉");
    const en = adviceFor("PlayerClientUnplayable", "en");
    expect(en.cause.toLowerCase()).toContain("not a problem with your cookie");
  });
});

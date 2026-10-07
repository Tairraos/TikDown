import { describe, expect, it } from "vitest";
import { dictionaries, lang, resolveLang, setLang, systemLang, t } from "../../src/lib/i18n";

describe("systemLang", () => {
  it("zh* 一律中文", () => {
    expect(systemLang("zh-CN")).toBe("zh");
    expect(systemLang("zh_TW")).toBe("zh");
    expect(systemLang("zh")).toBe("zh");
  });

  it("其余语言英文", () => {
    expect(systemLang("en-US")).toBe("en");
    expect(systemLang("ja-JP")).toBe("en");
    expect(systemLang("")).toBe("en");
  });
});

describe("resolveLang", () => {
  it("system 跟随系统,显式语言直通", () => {
    expect(resolveLang("zh")).toBe("zh");
    expect(resolveLang("en")).toBe("en");
    expect(resolveLang("system")).toBe(systemLang());
  });
});

describe("t", () => {
  it("切换语言后取词与插值", () => {
    setLang("zh");
    expect(t("msgAdded", { n: 3 })).toBe("已添加 3 个新任务，图文帖会自动跳过。");
    setLang("en");
    expect(t("msgAdded", { n: 3 })).toBe("Added 3 new task(s). Image-only posts are skipped automatically.");
    expect(lang()).toBe("en");
  });

  it("未知 key 原样返回(缺翻译可见)", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });
});

describe("字典完整性", () => {
  it("zh/en key 集合完全一致且无空值", () => {
    const zhKeys = Object.keys(dictionaries.zh).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    expect(enKeys).toEqual(zhKeys);
    for (const [locale, dict] of Object.entries(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) {
        expect((v ?? "").length, `${locale}:${k} 为空`).toBeGreaterThan(0);
      }
    }
  });
});

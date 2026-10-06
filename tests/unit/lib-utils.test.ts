import { describe, expect, it } from "vitest";
import { detectPlatform, extractUrls, formatBytes, formatDuration } from "../../src/lib/types";

describe("extractUrls", () => {
  it("从混有中文的文本中抽出链接", () => {
    const text = "看看这个 https://v.douyin.com/abc123/ 很不错，还有 https://x.com/user/status/1";
    expect(extractUrls(text)).toEqual(["https://v.douyin.com/abc123/", "https://x.com/user/status/1"]);
  });

  it("中文标点截断链接尾部", () => {
    expect(extractUrls("https://b23.tv/xyz。")).toEqual(["https://b23.tv/xyz"]);
  });

  it("去重", () => {
    expect(extractUrls("https://a.com https://a.com")).toEqual(["https://a.com"]);
  });

  it("无链接返回空数组", () => {
    expect(extractUrls("没有链接的文字")).toEqual([]);
  });
});

describe("detectPlatform", () => {
  it.each([
    ["https://v.douyin.com/iabc/", "抖音"],
    ["https://www.douyin.com/video/1", "抖音"],
    ["https://www.tiktok.com/@u/video/1", "TikTok"],
    ["https://xhslink.com/abc", "小红书"],
    ["https://www.xiaohongshu.com/explore/x", "小红书"],
    ["https://x.com/user/status/9", "X"],
    ["https://mobile.twitter.com/u/1", "X"],
    ["https://b23.tv/abc", "B站"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://pin.it/abc", "Pinterest"],
  ])("识别 %s → %s", (url, label) => {
    expect(detectPlatform(url)).toBe(label);
  });

  it("子域名归属平台,伪装域名不误判", () => {
    expect(detectPlatform("https://notdouyin.com/video/1")).toBeNull();
    expect(detectPlatform("https://evil.com/?u=douyin.com")).toBeNull();
  });

  it("非法字符串返回 null", () => {
    expect(detectPlatform("不是链接")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("空值与 0 返回空串(不显示)", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(0)).toBe("");
  });

  it("字节与进位", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(21_500_000)).toBe("20.5 MB");
  });
});

describe("formatDuration", () => {
  it("空值返回空串", () => {
    expect(formatDuration(null)).toBe("");
  });

  it("秒与分钟", () => {
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(61)).toBe("1:01");
    expect(formatDuration(600)).toBe("10:00");
  });
});

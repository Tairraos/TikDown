// @vitest-environment jsdom
/**
 * jsdom 不实现 HTMLMediaElement 的 play/pause/load，会往测试输出里刷
 * "Not implemented" 噪声日志。这些桩把行为补齐成可断言的最小实现：
 * play 返回 resolved promise（对齐真实浏览器"能起播"的情形），
 * load 记录调用次数供测试确认「关闭时确实中断了加载」。
 *
 * 只桩媒体播放相关方法，不碰 DOM 其余部分。
 */
import { beforeAll, beforeEach } from "vitest";

const played: string[] = [];
const loads: string[] = [];

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value(this: HTMLMediaElement) {
      played.push(this.currentSrc || this.src || "");
      return Promise.resolve();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value(this: HTMLMediaElement) {
      this.setAttribute("data-paused", "1");
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    writable: true,
    value(this: HTMLMediaElement) {
      loads.push(this.currentSrc || this.src || "");
    },
  });
});

/** 供测试读取：起播过的视频地址 */
export function playedSources(): string[] {
  return played;
}
/** 供测试读取：被 load() 重置过的地址（关闭时应能看到） */
export function loadedSources(): string[] {
  return loads;
}

beforeEach(() => {
  played.length = 0;
  loads.length = 0;
});
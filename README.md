<div align="center">

# ⚠️ TikDown 即将更名为 **socioDL**

### Social Media Video Downloader

**正在重构界面中，暂不真正改名。** Release 里是临时包，等重构稳定后再正式切换。

**The app is being renamed to socioDL.** Interface rewrite in progress — the name change happens after it settles.
Releases currently ship as temporary builds.

⬇️ 急需的用户可以先用临时包：[Releases](https://github.com/Tairraos/TikDown/releases)

⬇️ Need it now? Temporary builds are in the link above.

</div>

---

# TikDown

多平台社媒视频下载器（桌面应用）。**只下载视频**——纯图文帖自动识别并跳过，图文混合帖只取其中的视频。

Multi-platform social media video downloader (desktop app). **Video only** — image-only posts are detected and skipped; mixed posts yield just the video track.

下载引擎是 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，音视频合成由 ffmpeg 完成。平台接口变化时只需升级 yt-dlp，无需等待应用更新。

## 下载

见 [Releases](https://github.com/Tairraos/TikDown/releases)。首次使用需按引导安装核心组件（yt-dlp 与 ffmpeg，按需下载到 `~/.tikdown`，不内置在安装包里）。

See [Releases](https://github.com/Tairraos/TikDown/releases). On first run you'll be prompted to install yt-dlp and ffmpeg (downloaded on demand into `~/.tikdown`; not bundled).

## 支持的平台

按国内使用频率排序。**完整列表以 [yt-dlp 支持的站点](https://github.com/yt-dlp/yt-dlp#supported-sites) 为准**——本应用不做平台白名单，凡是 yt-dlp 能解析的链接都能试。

| 平台 | Platform | 类型 |
|---|---|---|
| 抖音 | Douyin | 短视频 |
| TikTok | TikTok | 短视频 |
| 小红书 | Xiaohongshu | 图文/短视频 |
| B站 | Bilibili | 视频/番剧 |
| YouTube | YouTube | 视频/Shorts |
| Instagram | Instagram | 图文/短视频 |
| X / Twitter | X (Twitter) | 短视频/图文 |
| 微博 | Weibo | 视频 |
| 知乎 | Zhihu | 视频 |
| 爱奇艺 | iQIYI | 长视频 |
| 优酷 | Youku | 长视频 |
| NicoNico | Nico Nico Douga | 视频 |
| Pinterest | Pinterest | 图片/视频 |
| Facebook | Facebook | 视频 |
| Reddit | Reddit | 视频/音频 |
| Vimeo | Vimeo | 视频 |
| Twitch | Twitch | 直播/回放 |
| SoundCloud | SoundCloud | 音频 |
| Bandcamp | Bandcamp | 音乐 |
| Dailymotion | Dailymotion | 视频 |
| Tumblr | Tumblr | 视频/图文 |
| Flickr | Flickr | 图片/视频 |
| LinkedIn | LinkedIn | 视频 |
| VK | VK | 视频 |
| Rumble | Rumble | 视频 |
| 广播/新闻 | BBC · CNN · NBC · FranceTV · arte | 视频 |
| 开源与公共 | archive.org · coub · vidyard · Wistia | 视频/存档 |

英文平台基本都支持。中文平台里**知乎、B站、微博**可靠；小红书、抖音的部分页面可能需要登录态（见下）。

Most English-language platforms work. Among Chinese ones, Zhihu / Bilibili / Weibo are reliable; some Douyin and Xiaohongshu content needs cookies (see below).

### 遇到登录墙？

小红书、Instagram 等平台的登录内容需要提供 Cookie。设置里两种方式二选一：

- **浏览器登录态**——选你平时登录该平台的浏览器（Chrome / Edge / Firefox / Safari / Brave），App 直接读取本机登录状态。
- **cookies.txt 文件**——用扩展导出 Netscape 格式文件后导入。更适合换电脑或登录态过期后重导。

详细方法见 [docs/product-specs/cookie-access.md](docs/product-specs/cookie-access.md)。

### 已知限制

**YouTube + Cookie 目前会失败。** 这是 yt-dlp 上游的问题（[#17389](https://github.com/yt-dlp/yt-dlp/issues/17389)）：一旦带上 Cookie，yt-dlp 会改用一个解不开 YouTube 签名的播放通道，导致所有视频报 `The page needs to be reloaded`。**不是你的 Cookie 有问题**——恰恰相反，关掉 Cookie 公开视频就能正常下载。应用已内置绕过参数，但对部分视频仍会失效。

界面会把鼠标悬停在错误上时会显示原因和解决办法（跟随界面语言）。

**This is an upstream yt-dlp issue, not your cookies.** Turning cookies off makes public videos work. A workaround is built in but doesn't cover every video.

## 工作原理

TikDown 不自己逆向平台接口，而是调用 yt-dlp 作为下载引擎。平台接口变化时只需升级 yt-dlp——这也是本应用保持轻量的原因。

TikDown doesn't reverse-engineer platform APIs; yt-dlp is the engine. Platform changes are handled by upgrading yt-dlp, which keeps this app small.

## 开发

技术栈：Tauri v2 + TypeScript。入口地图见 [AGENTS.md](AGENTS.md)，架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，全部文档见 [docs/index.md](docs/index.md)。

```bash
npm install
npm run app:dev    # 桌面开发
npm run app:build  # 打包
```

## 合规

下载内容需遵守各平台服务条款与著作权法。仅用于个人备份与研究，不得用于再分发。

Respect each platform's terms of service and applicable copyright law. Personal backup and research only; no redistribution.

## License

见 [LICENSE](LICENSE)。

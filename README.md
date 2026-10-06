# TikDown

多平台社媒视频下载器（桌面应用）。**只下载视频**——纯图文帖自动识别并跳过，图文混合帖只取其中的视频。

支持平台：抖音 · TikTok · 小红书 · Instagram · Pinterest · X.com · Bilibili · YouTube

## 下载

见 [Releases](https://github.com/Tairraos/TikDown/releases)（发布链路建设中）。

## 使用

1. 首次使用时按引导安装核心组件（yt-dlp 与 ffmpeg，按需下载到 `~/.tikdown`，不内置在安装包里）。
2. 粘贴视频链接（支持多行批量），应用自动解析。
3. 选择下载目录，点击下载。

**遇到登录墙？** 小红书、Instagram 等平台的登录内容需要提供 Cookie：可以在设置里开启「读取浏览器登录态」，或导入 `cookies.txt` 文件。详细方法见 [docs/product-specs/cookie-access.md](docs/product-specs/cookie-access.md)。

## 工作原理

TikDown 不自己逆向平台接口，而是调用 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 作为下载引擎——平台接口变化时只需升级 yt-dlp。音视频合成由 ffmpeg 完成。这也是本应用保持轻量的原因。

## 开发

技术栈：Tauri v2 + TypeScript。入口地图见 [AGENTS.md](AGENTS.md)，架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，全部文档见 [docs/index.md](docs/index.md)。

```bash
npm install
npm run app:dev    # 桌面开发
npm run app:build  # 打包
```

## 合规

下载内容需遵守各平台服务条款与著作权法。仅用于个人备份与研究，不得用于再分发。

## License

见 [LICENSE](LICENSE)。

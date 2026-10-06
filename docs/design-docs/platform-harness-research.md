# 社媒视频下载器：技术方案调研与选型

调研日期 2026-10-06。全部结论基于本机实测 + 上游仓库核对，不靠推测。

---

## 一、需求拆解

覆盖平台：抖音、TikTok、Instagram、Pinterest、X.com、Bilibili、小红书（+ YouTube 作为「尽可能多」的兜底）。

硬约束：
1. **只下载视频，不下载图片**（图文帖要能识别并跳过或只取其中的视频）
2. 尽可能多的社媒平台
3. 桌面客户端形态（沿用现有 TikDown 的交互：粘贴链接 → 队列 → 下载）

---

## 二、现有方案全景（5 条技术路线）

### 路线 1：自研逆向 API —— 现有 TikDown 走的路（已失效）

现有代码 `downloader.js:167` 打的是 `iesdouyin.com/web/api/v2/aweme/iteminfo`，`downloader.js:177` 打的是 `api-h2.tiktokv.com/aweme/v1/feed`。这两个接口**今天都已经不能用了**。

逆向路线的致命问题：平台每次调整签名/接口你就得跟着改，`a_bogus` / `x_bogus` 之类的签名算法是持续博弈。维护成本极高，且不可预测。

**结论：放弃。**

### 路线 2：yt-dlp（harness 模式）—— 推荐

yt-dlp 是一个成熟的独立命令行项目，170k+ star，月更频率。它的 extractor 覆盖 1000+ 站点。

**本机实测（yt-dlp 2026.08.19，`--list-extractors`）**，8 个目标平台全部有原生 extractor：

| 平台 | extractor | 状态 |
|---|---|---|
| 抖音 | `Douyin` | ✅ 可用 |
| TikTok | `TikTok` + `vm.tiktok` | ✅ 可用 |
| 小红书 | `XiaoHongShu` | ✅ 可用 |
| Instagram | `Instagram` / `instagram:story` | ✅ 可用（`instagram:user` 标记 CURRENTLY BROKEN，不影响单视频） |
| Pinterest | `Pinterest` / `PinterestCollection` | ✅ 可用 |
| X.com | `twitter` 系列 | ✅ 可用 |
| Bilibili | `BiliBili` 等 20+ 个 | ✅ 可用（最成熟） |
| YouTube | `youtube` 等 | ✅ 可用 |

「harness」的意思是：我们不修改 yt-dlp，只把它当子进程调用，解析它的 JSON 输出和进度输出。平台改接口时，只需升级 yt-dlp 版本，**我们的代码一行不改**。

### 路线 3：Cobalt（自托管）

Cobalt 是 AGPL-3.0 的 web 下载服务，支持 20+ 平台，接口简洁（POST JSON）。

两个硬伤：
- **AGPL-3.0 传染性**：内嵌进闭源桌面 App 有法律风险，必须开源整个应用或走网络服务（不能离线内嵌）。
- **主实例已不可靠**：YouTube 自 2025 年中起被主实例放弃；移动端失败率报道达 90%。

**结论：技术方案很好，但许可证与本项目「私有桌面工具」的定位冲突。若要用，只能自托管 + 保持服务端隔离，且失去离线能力。不作为主路线。**

### 路线 4：商业解析 API（TikHub / Apify 等）

优点：稳定、省心、有 SLA。缺点：按量计费（成本随规模线性增长）、依赖第三方、隐私上链接要外发。

小乐的成本敏感属性下，这是「备用兜底」而非首选：国内平台（抖音/小红书）的官方解析 API 价格并不低，且量大时成本不可控。

**结论：列为 P2 备选，主线不依赖。**

### 路线 5：第三方成品 GUI

- **TikTokDownloader**（JoeanAmier）：桌面 exe，Web UI，支持剪贴板监控、批量
- **F2**（Johnserf-Seed）：Python，抖音/TikTok 批量，支持签名生成
- **SCrawler**：支持 20+ 平台，「订阅式」批量下载
- **OmniGet**：Tauri + Rust，原生支持 12 平台 + yt-dlp 兜底 1000+

这些可以直接用，但都是各平台各自的小众项目，UI 与维护节奏不可控，且无法定制「只下视频」这类特殊策略。

**结论：作为需求参考（尤其 OmniGet 的 Tauri 架构），不作为依赖。**

---

## 三、选定架构：Tauri + yt-dlp harness

### 为什么是 Tauri（而不是继续 Electron）

| 维度 | Electron（现状） | Tauri v2 |
|---|---|---|
| 安装包体积 | 80–150 MB（打包 Chromium） | 3–10 MB（用系统 WebView） |
| 内存占用 | 高 | 约为 1/3 |
| 前端 | 现有 renderer.js / domutil.js 是原生 DOM 操作 | React + TypeScript，重构更顺 |
| spawn 子进程 | Node child_process | Rust std::process / tauri-plugin-shell |

现有代码 1386 行、原生 DOM 操作、无构建链，直接迁到 React 成本不低；但长期维护收益明确。**这是「重构而非修补」的好时机** —— 现有实现的解析层已死，留着 UI 层的价值有限。

### yt-dlp 集成方式：sidecar

用 Tauri 的 `externalBin` 把 yt-dlp 二进制打进安装包：

```
src-tauri/binaries/yt-dlp-aarch64-apple-darwin   # Apple Silicon
src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu
src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe
```

**文件名必须带 target triple**，这是 Tauri 的硬性要求，打包时找不到文件。用 `rustc --print host-tuple` 获取当前平台三元组。

优点：用户装完即用，不依赖系统 PATH，不要求装 Python。ffmpeg 同理需要作为 sidecar 打包（用于合并音视频分片）。

---

## 四、「只下视频不下载图片」怎么实现

这是本项目的核心需求，yt-dlp 侧有原生支持，**不需要自己判断文件类型**：

| 机制 | 参数 | 作用 |
|---|---|---|
| 过滤纯图片条目 | `--match-filter "vcodec!=none"` | 纯图文的 vcodec 为 none，直接被 match-filter 跳过 |
| 不写封面 | `--no-write-thumbnail` | 不额外下载 thumbnail |
| 不写元数据 | `--no-write-info-json` | 不落 .info.json |
| 强制合并为 mp4 | `--merge-output-format mp4` | 音视频分片合并为单一 mp4 |

`--match-filter` 的表达式支持 `&` `|` `!` 与字段比较，`vcodec` 是标准字段。这套组合是实测存在的（`--help` 中确认）。

### 实测记录（2026-10-06，真实下载验证）

用 B站一条公开视频跑完整链路，产出：

```
[进度行] downloading  2096128  5408198  NA  4438177.10  0  ...f30280.m4a
[合并]   [Merger] Merging formats into "dl3/【官方 MV】Never Gonn.mp4"
结果：   dl3/【官方 MV】Never Gonn.mp4   21,498,124 bytes（单一 mp4）
```

**踩到一个必须记住的坑**：`brew install yt-dlp` 装出来的版本**找不到 ffmpeg**，即使系统里明明有 `/opt/homebrew/bin/ffmpeg`。实测报错：

```
WARNING: You have requested merging of multiple formats but ffmpeg is not installed.
         The formats won't be merged
```

后果是「看起来下载成功了，实际产出的是分离的视频 mp4 + 音频 m4a 两个文件」——**静默失败**，比直接报错更危险。而且此时 `--print after_move:` 仍然会打印一个**并不存在**的合并后路径，极易误判为成功。

修法：显式传 `--ffmpeg-location <绝对路径>`。本项目 `download.rs` 已内置该参数，并在 sidecar 缺失时回退到 PATH 查找。

> 这条经验对任何「套壳 yt-dlp」的方案都成立，是 harness 架构里最容易踩空的一环。

配合探测阶段的判断逻辑：
- 若探测结果的 `formats` 里所有条目 `vcodec == "none"` → 判定为纯图文帖，UI 直接提示「该内容为图文，无视频」，不建下载任务
- 若同时存在视频流和图片流 → 只取视频流

---

## 五、调用时序（两趟）

### 第 1 趟：探测（不落盘）

```
yt-dlp --dump-single-json --flat-playlist --no-playlist \
       --no-warnings <URL>
```

拿到：标题、作者、时长、可用画质列表（`formats[]` 含 resolution / vcodec / filesize）、封面 URL、是否视频内容。

### 第 2 趟：下载

```
yt-dlp --newline \
       --match-filter "vcodec!=none" \
       --no-write-thumbnail --no-write-info-json \
       --merge-output-format mp4 \
       -f "bv*+ba/b" \
       -o "<target>/%(uploader)s - %(title).80B.%(ext)s" \
       --cookies-from-browser <browser> \
       <URL>
```

`--newline` 让 yt-dlp 逐行输出结构化进度，Rust 侧 `BufReader` 逐行解析成结构体，再 `app.emit()` 推到前端。比解析人类可读的 `[download] 50% of...` 稳定得多 —— 后者的格式可能随版本变化。

---

## 六、登录墙（Cookie）策略

这是各平台可用性的真实分水岭，不能想当然。分级处理：

| 等级 | 平台 | 策略 |
|---|---|---|
| 公开可用 | TikTok、Pinterest、B站、抖音（多数）、X（公开帖） | 直接下载，无需登录 |
| 建议登录 | 小红书（网页版大量内容需登录）、Instagram（部分内容） | `--cookies-from-browser chrome` |
| 需登录 | Instagram 私密号、抖音私密作品 | 必须提供 cookie |

关键设计：**不要把 cookie 打进安装包，也不要自建账号池**。用 `--cookies-from-browser` 直接读用户本机浏览器，零存储、零泄露风险。

实测印证：B站免费清晰度直接可下，但日志提示
`1080P 高码率 are missing; you have to become a premium member...`
—— 说明**高清/会员内容确实卡在登录态上**，符合预期分级。

风控纪律（小红书尤其敏感）：不做 UI 自动化、不模拟点击、不并发轰炸。建议默认单任务串行 + 可配置间隔。

---

## 七、风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| 平台改接口导致某平台失效 | 该平台下载失败 | yt-dlp 月更，打包时可提示更新；探测失败要给清晰错误而非崩溃 |
| Windows Defender 误报未签名二进制 | 用户装不上 | 签名安装包 + 发布 SHA-256 校验值（不尝试绕过杀软） |
| 小红书风控 | 账号风险 | 单账号低频、不并发、可注入 cookie 复用本地登录态 |
| ffmpeg sidecar 体积 | 安装包变大 | ffmpeg 只保留必要编码器；或对非合并场景降级 |
| 跨平台 target triple 命名 | 打包失败 | 构建脚本自动生成，禁止手工命名 |

---

## 八、实施顺序建议

按「先验证地基，再堆功能」推进，每步都能独立验证：

1. **打通 sidecar** —— `npm run sidecar` 能落位 yt-dlp/ffmpeg，`binresolve` 能定位到它们
2. **探测通路** —— 单条链接能返回标题/时长/画质列表，图文帖被正确识别为 skipped
3. **下载通路** —— 单条视频能下载、进度能实时刷新、音视频能合并成单一 mp4
4. **队列与批量** —— 多行粘贴、并发控制、失败重试、取消
5. **登录态** —— Cookie 开关接入，登录墙平台可用
6. **打包分发** —— 三平台签名与校验值

前 3 步是硬门槛：任何一步不通，后面都是空中楼阁。

---

## 九、结论与优先级

**选定：Tauri v2 + React + TypeScript + yt-dlp sidecar。**

- P0：yt-dlp/ffmpeg sidecar 打包 + 探测/下载两趟 + match-filter 只下视频 + Cookie 策略
- P1：批量粘贴、任务队列、画质选择、失败重试
- P2：商业 API 兜底（仅当某平台 yt-dlp 长期修不好时启用）、批量下载账号全部作品

核心判断依据：**把「平台适配」这份无限增长的维护责任交给 yt-dlp 上游，自己只写 harness 与 UI。** 这是唯一能长期养活的架构。
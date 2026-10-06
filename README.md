# TikDown 开发设计

> **内部文档，未定稿。** 这份 README 记录项目现状与目标，公开前需要重写。
> 提交前请把本说明和「现状记录」章节改掉。

---

## 一、项目目标

多平台社媒视频下载器，**只下载视频，不下载图片**。

覆盖平台：抖音、TikTok、小红书、Instagram、Pinterest、X.com、Bilibili、YouTube。

两条不可让步的约束：

1. **只下视频。** 纯图文帖要能识别并跳过，图文混合帖只取其中的视频流。
2. **平台接口变化不能靠改本项目代码解决。** 这是架构选择的硬指标。

---

## 二、为什么这样选架构

### 放弃的路：自研逆向 API

v1 直接打平台内部接口：

- 抖音：`iesdouyin.com/web/api/v2/aweme/iteminfo`
- TikTok：`api-h2.tiktokv.com/aweme/v1/feed`

这两个接口**今天都已失效**，应用因此完全不可用。这不是偶发故障，而是这类方案的必然结局 —— 平台每次调整签名算法都得跟着改，维护成本无限增长且不可预测。

### 选定的路：Tauri v2 + yt-dlp harness

把「平台适配」这份无限增长的维护责任交给 yt-dlp 上游，本项目只写 harness、队列与界面。平台改接口时只需升级 yt-dlp 版本。

**实测依据**（yt-dlp 2026.08.19，本机 `--list-extractors`）：

| 项目 | 结果 |
|---|---|
| extractor 总数 | 1752 |
| 目标平台覆盖 | 8/8 全部存在 |
| 上游标记损坏 | 136（7.8%） |

目标平台逐一核对：`Douyin`、`TikTok`、`XiaoHongShu`、`Instagram`、`Pinterest`、`twitter`、`BiliBili`、`youtube` —— 全部存在。

被上游标记损坏的 `instagram:user`、`tiktok:effect` 不影响单视频/单帖下载，那是批量与子功能。

### 其他路线为何不选

| 路线 | 不选的原因 |
|---|---|
| Cobalt 自托管 | AGPL-3.0 传染，闭源桌面应用内嵌有法律风险；主实例已弃用 YouTube |
| 商业解析 API（TikHub / Apify） | 按量计费，规模上来成本不可控；链接需外发 |
| 第三方 GUI 成品 | 不可定制「只下视频」这类特殊策略，维护节奏不可控 |

---

## 三、现状

### 已完成

**架构**：Tauri v2 + React + TypeScript，Rust 侧 5 个模块

```
src-tauri/src/
  binresolve.rs   组件定位、版本门槛、状态上报
  probe.rs        元数据探测、图文判定、错误翻译
  download.rs     spawn 子进程、进度解析、事件回传
  fetch.rs        按需下载核心组件到 ~/.tikdown
  lib.rs          Tauri 命令层
```

**前端**：批量粘贴、任务队列、画质选择、组件状态面板、设置面板

**验证状态**

| 项目 | 结果 |
|---|---|
| `cargo check` | 0 error 0 warning |
| `npx tsc --noEmit` | 0 错误 |
| `npx vite build` | 成功，254 KB / gzip 61 KB |
| 真实下载链路 | B站视频 → 合并为单一 21.5 MB mp4 |

---

## 四、核心机制

### 「只下视频」怎么实现

不自己判断文件类型，用 yt-dlp 原生过滤：

| 机制 | 参数 | 作用 |
|---|---|---|
| 过滤纯图片条目 | `--match-filter "vcodec!=none"` | 纯图文帖 vcodec 为 none，直接被跳过 |
| 不写封面 | `--no-write-thumbnail` | 不额外下载缩略图 |
| 不写元数据 | `--no-write-info-json` | 不落 `.info.json` |
| 合并为单一 mp4 | `--merge-output-format mp4` | 音视频分片合并 |

探测阶段同步判定：若所有格式的 `vcodec` 都是 `none` → 标记为「已跳过」，不建下载任务。

### 调用时序：两趟

**第 1 趟 · 探测**（不落盘）

```
yt-dlp --dump-single-json --flat-playlist --no-playlist --no-warnings <URL>
```

拿标题、作者、时长、画质列表、封面、是否视频内容。

**第 2 趟 · 下载**

```
yt-dlp --newline --progress
       --progress-template "download:%(progress.status)s\t..."
       --match-filter "vcodec!=none"
       --merge-output-format mp4
       --ffmpeg-location <绝对路径>
       --print "after_move:__FINAL__%(filepath)s"
       -o "<target>/%(uploader)s - %(title).80B.%(ext)s" <URL>
```

进度用 tab 分隔的 `--progress-template`，不用正则去猜人类可读文本 —— 上游改文案不会影响解析。

---

## 五、实测踩过的坑

### 1. ffmpeg 静默失败（最重要）

`brew install yt-dlp` 装出的版本**找不到系统 ffmpeg**，即使 `/opt/homebrew/bin/ffmpeg` 明明存在：

```
WARNING: You have requested merging of multiple formats but ffmpeg is not installed.
         The formats won't be merged
```

危害在于它**退出码仍然是 0**，看起来成功，实际产出分离的视频 mp4 + 音频 m4a 两个文件。更坑的是此时 `--print after_move:` 仍会打印一个**并不存在**的合并路径，极易误判为成功。

**修法**：始终显式传 `--ffmpeg-location <绝对路径>`。`download.rs` 已内置。

### 2. 体积决策不能被动态链接误导

本机 `/opt/homebrew/bin/ffmpeg` 只有 412 KB —— 那是动态链接，实际依赖 53 MB 库文件。**拿这个数字做打包决策会错得很离谱**。

真实的静态构建体积（实测 2026-10-06）：

| 组件 | macOS | Linux | Windows |
|---|---|---|---|
| yt-dlp | 35.4 MB | 38.5 MB | 17.0 MB |
| ffmpeg | 25.0 MB | 40.0 MB | ~25 MB |

### 3. 三个平台的失败模式完全不同

实测结果说明「只传 URL 就行」这个承诺不成立：

| 平台 | 只传 URL 的结果 |
|---|---|
| B站 | ✅ 零配置成功，探测到 15 个格式 |
| 抖音 | ⚠️ `Fresh cookies (not necessarily logged in) are needed` |
| 小红书 | ⚠️ `No video formats found` —— 公开网页端拿不到，必须读登录态 |
| TikTok | ❌ SSL 连接被掐断 —— **网络问题，与 yt-dlp 无关** |

所以失败必须分三类给不同提示，不能笼统报「下载失败」：

- **提取器问题** → 提示升级 yt-dlp
- **登录墙** → 一键开启 cookie 读取
- **网络问题** → 提示需要代理

这三种已实现在 `probe.rs` 的 `explain_error()`。

---

## 六、组件管理（核心设计）

### 决策：两者都不进安装包

yt-dlp 与 ffmpeg 都是 25–40 MB 量级，内置合计约 78 MB。而应用本身只有 8 MB —— 装 78 MB 的包装 8 MB 的软件，用户第一感受是「这什么东西这么大」。

更关键的是：这两个都是月更的。进包意味着每次升级都要重新发版，把本该自动更新的东西做成了静态包袱。

**决策：安装包零外部依赖，组件在首次使用时按需下载到 `~/.tikdown`。**

### 探测顺序

```
用户手动指定的路径  >  ~/.tikdown 下的副本  >  系统 PATH
```

用户显式指定优先级最高 —— 这是他的明确意志。反过来「有就用」也不行：一个 2024 年的系统 yt-dlp 会让整个应用静默失效，所以**每一级都要过版本门槛**。

### 版本门槛

| 组件 | 最低版本 | 依据 |
|---|---|---|
| yt-dlp | 2025.01.01 | 低于此版本小红书、Pinterest 提取器基本不可用 |
| ffmpeg | 5.0 | 更早版本无法处理部分 DASH 流 |

版本比较按数字段逐段比，`7.1` 等于 `7.1.0`。

### 下载时机与安全

**不做静默自动下载。** Windows Defender 会隔离未签名二进制，macOS Gatekeeper 也会拦 —— 自动下载只会静默失败，用户体验更差。

正确做法：用户主动点击，下载前明确告知体积与来源。

**国内网络注意**：yt-dlp 从 GitHub 下载可能失败，此时提示应引导到「设置 → 手动指定路径」，而不是只报「下载失败」。

---

## 七、代码结构

| 位置 | 职责 |
|---|---|
| `src-tauri/src/binresolve.rs` | 组件定位、版本门槛、状态上报 |
| `src-tauri/src/probe.rs` | 探测元数据、图文判定、错误翻译 |
| `src-tauri/src/download.rs` | spawn 子进程、解析进度、事件回传 |
| `src-tauri/src/fetch.rs` | 按需下载组件 |
| `src-tauri/src/lib.rs` | Tauri 命令层 |
| `src/components/CorePanel.tsx` | 组件状态与安装引导 |
| `src/components/SettingsPanel.tsx` | 手动指定路径 |
| `src/App.tsx` | 队列与批量粘贴 |

---

## 八、待办

- [ ] 组件下载在真实网络下的完整验证（GitHub 直连 + 代理场景）
- [ ] 小红书 / 抖音登录墙的 Cookie 策略实测校准
- [ ] 任务队列的并发控制与失败重试
- [ ] 打包分发：三平台签名与 SHA-256 校验值
- [ ] README 重写：删掉内部决策过程，只留用户需要知道的

## 九、合规

下载内容需遵守各平台服务条款与著作权法。仅用于个人备份与研究，不得用于再分发。
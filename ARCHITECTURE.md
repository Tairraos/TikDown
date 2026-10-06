# 架构总览

> 记录"为什么"与边界规则；"是什么"以代码为准。结构约束由结构测试强制（`npm run gate:structure`）。

## 系统形态

```text
┌─ WebView（前端，vanilla/React TS + Vite）──────────────────┐
│  UI 组件 → state（队列/设置） → ipc 封装（invoke/listen）    │
└──────────────┬─────────────────────────────────────────────┘
               │ Tauri IPC（invoke 命令 + 事件总线）
┌──────────────▼─────────────────────────────────────────────┐
│  Rust core（src-tauri/）                                    │
│  lib.rs 命令层 ── probe.rs（探测/错误翻译）                  │
│       │        ── download.rs（yt-dlp 子进程/进度事件）      │
│       │        ── fetch.rs（组件按需下载）                   │
│       └────── binresolve.rs（组件定位/版本门槛）             │
└──────────────┬─────────────────────────────────────────────┘
               │ spawn 子进程
     yt-dlp（平台适配 harness） + ffmpeg（音视频合并）
     两者不进安装包，按需下载到 ~/.tikdown，均过版本门槛
```

## 依赖方向白名单（单向，禁止逆向）

| 层 | 允许依赖 | 禁止 |
|---|---|---|
| 前端 UI 组件（`src/ui/`、`src/*.ts` 顶层） | `src/state/`、`src/lib/` | 直接调 `invoke`/`listen`（必须经 `src/lib/ipc.ts`） |
| 前端 state（`src/state/`） | `src/lib/`（ipc、types、utils） | 直接操作 DOM |
| 前端 lib（`src/lib/`） | 无（叶子） | 依赖 state/ui |
| Rust 命令层（`lib.rs`） | 业务模块（probe/download/fetch） | 绕过模块直接 spawn 子进程 |
| Rust 业务模块 | `binresolve`（组件定位） | 相互依赖（download 可复用 probe::explain_error 例外已固化） |
| binresolve | 无（叶子，仅 std + which） | 依赖业务模块 |

- 横切状态（`Settings`、运行中任务表 `Tasks`）只经 `lib.rs` 的 Tauri `State` 进入，业务模块通过参数接收，不主动触达全局。
- 前后端契约：Rust 结构体（serde camelCase）↔ `src/lib/types.ts`，由契约测试锁定（`tests/fixtures/ipc-contract.json` 两侧共用）。新增/修改 IPC 字段必须同步契约 fixture 与两侧类型。

## 关键数据流

1. **探测（两趟制的第 1 趟）**：前端 `probe_batch(urls)` → Rust 逐条 spawn `yt-dlp --dump-single-json`（有界并发）→ `RawJson` 解析 → `MediaInfo`（含 is_image_only 判定）→ 前端建任务。**探测与下载都必须能带 Cookie**（登录墙闭环）。
2. **下载（第 2 趟）**：前端 `start_download` → Rust spawn `yt-dlp`（`--progress-template` 机器可读进度）→ 三个读取线程 → 事件 `task://event`（starting/progress/merging/done/failed，按任务 id 路由）。取消 = kill 子进程。
3. **组件管理**：`core_status`（探测顺序：用户指定 > ~/.tikdown 副本 > 系统 PATH，每级过版本门槛）→ `fetch_component`（下载到 ~/.tikdown，进行中拒绝重入，完成后强制 `--version` 校验）。事件 `core://progress` / `core://done` 均携带组件名。
4. **设置**：前端持久化（localStorage）+ 启动时/保存时 `set_settings` 同步后端 `State<Settings>`——**所有命令吃到的设置必须一致**。

## 目录地图

| 路径 | 职责 |
|---|---|
| `src/` | 前端（UI 组件 / state / lib 三层，见白名单） |
| `src-tauri/src/lib.rs` | Tauri 命令层：6 个命令 + 全局 State |
| `src-tauri/src/probe.rs` | yt-dlp JSON 解析、图文判定、错误翻译（explain_error） |
| `src-tauri/src/download.rs` | 下载子进程编排、进度解析（parse_progress）、取消 |
| `src-tauri/src/fetch.rs` | yt-dlp/ffmpeg 按需下载（ureq）、解压、校验 |
| `src-tauri/src/binresolve.rs` | 组件定位（探测顺序/版本门槛/路径解析） |
| `scripts/` | 门禁脚本、版本 bump（`_bump_version.py`） |
| `tests/` | 跨端共享契约 fixture |
| `docs/` | 记录系统（见 docs/index.md） |

## 设计约束的边界

强约束（机器拦截）：依赖方向、文件大小上限（T1）、契约一致性、版本三处一致、文档死链。
弱约束（人/评审判断）：组件内部写法、代码风格细节。详见 `docs/design-docs/core-beliefs.md`。

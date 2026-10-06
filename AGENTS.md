# AGENTS.md

> 本文件是**内容目录**，不是百科全书。需要细节时按下方指引跳转。超过 200 行即为事故。

## 这是什么项目

TikDown：多平台社媒视频下载器（Tauri v2 桌面应用）。只下载视频、自动跳过图文帖；平台适配责任交给 yt-dlp 上游，本项目只写 harness、队列与界面。

## 如何开始

- 架构总览与依赖方向规则：见 `ARCHITECTURE.md`
- 设计理念与第一性原则（争议裁决依据）：见 `docs/design-docs/core-beliefs.md`
- 平台选型依据（yt-dlp 实测数据）：见 `docs/design-docs/platform-harness-research.md`
- 产品规格：见 `docs/product-specs/index.md`
- 当前执行计划：见 `docs/exec-plans/active/`；已知技术债：见 `docs/exec-plans/tech-debt-tracker.md`
- CI 与发布决策：见 `docs/CI.md`；门禁清单：见 `docs/GATES.md`
- 全部文档索引：见 `docs/index.md`

## 硬性约束（不可违反）

1. **分层单向依赖**（详见 ARCHITECTURE.md 的依赖白名单），结构测试 `npm run gate:structure` 拦截违规。
2. **重构不改行为**；bug 修复与行为变更必须在 tech-debt-tracker 显式登记并单独提交。
3. **版本三处一致**：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`。改版本用 `python3 scripts/_bump_version.py <version>`，禁止手工散改。
4. **边界处解析数据形状**：yt-dlp 输出必须先经 Rust 侧 `RawJson` 解析；前后端契约以 `src/lib/types.ts` + Rust serde 契约测试为唯一来源，禁止在组件里 YOLO 式探字段。
5. **"只下视频"语义**：过滤的唯一机制是 yt-dlp `--match-filter "vcodec!=none"`，禁止自研文件类型判断。
6. 用户提示词记录 `prompr-history.txt`：**只追加，不读取**（已 gitignore）。

## 常用命令

- 安装：`npm install`
- 前端开发：`npm run dev`（纯浏览器调试，IPC 走 mock）；桌面开发：`npm run app:dev`
- 构建：`npm run build`（tsc + vite）；桌面打包：`npm run app:build`
- 测试：`npm test`（vitest）；Rust：`cargo test`（在 src-tauri/ 下）
- lint：`npm run lint`；Rust：`cargo fmt --check && cargo clippy -- -D warnings`
- 全部本地门禁一条命令：`npm run gate`
- 版本发布：`npm run release`（见 `docs/CI.md` 的 tag → CI → Release 链路）

## 规范索引

- 质量评分：`docs/QUALITY_SCORE.md`
- 门禁清单：`docs/GATES.md`
- 测试策略：`docs/TESTING.md`
- 技术债台账：`docs/exec-plans/tech-debt-tracker.md`

## 工作方式

- 变更前先读相关 `docs/`，变更后同步更新文档与 `QUALITY_SCORE.md` 分数
- 提交单一职责，Conventional Commits 前缀；会话最后一次提交过全部本地门禁并注明 `[已测试]`/`[未测试]`
- 复杂工作先写计划到 `docs/exec-plans/active/`，完成后移入 `completed/`
- 任何交互式确认（CI 平台、发布方式等）必须落盘到仓库文档，确认过但不落盘 = 没做
- 遇到卡点先问"缺什么能力、如何让它可机械检查"，把答案编码进工具，而不是只修这一次

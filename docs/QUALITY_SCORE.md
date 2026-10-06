# 质量评分（QUALITY_SCORE）

> 按业务域打分，1–5 分。**每项分数必须注明可复算的依据**（测量命令/脚本），换算：5 优秀 / 4 良好 / 3 及格 / 2 差 / 1 缺失。改造期间每批次结束更新。

基线日期：2026-10-06（改造起点，commit `8dc303f`）

| 业务域 | 分数 | 依据（可复算） | 目标 | 差距与行动 |
|---|---|---|---|---|
| 下载域（download 模块 + 队列） | 4 | P0×2 修复+契约测试；args/progress 纯函数 15 测；并发调度有界并有 8 测 | 5 | 真实 yt-dlp 集成测试（需联网 fixture）待补 |
| 探测域（probe.rs + probe_batch） | 4 | 有界并发；cookie 闭环；explain_error 修复+7 测 | 5 | 真实平台登录墙场景实测（需用户配合登录） |
| 组件管理域（binresolve/fetch/CorePanel） | 4 | 设置桥统一；ureq 流式进度；三平台解压；强制校验 | 4.5 | Windows/Linux 平台打包实测（本机仅 macOS） |
| 前端域 | 4 | vanilla TS 三层；keyed 增量渲染；store 28 测；浏览器 E2E 通过 | 4.5 | mock IPC 的 E2E 可选进 CI |
| 工程化（门禁/CI/发布） | 3.5 | pre-commit/pre-push 全绿；覆盖率门禁实测拦截；版本 guard 本地生效 | 4.5 | GitHub CI 待 §3.3 三问（挂起中） |
| 文档体系 | 4 | AGENTS/ARCHITECTURE/core-beliefs/规格/GATES/TESTING 齐备,链接门禁护航 | 4.5 | 文档园丁任务定期化(可选) |
| 安全 | 4 | CSP 最小策略;下载强制校验;无注入面;npm audit 0 | 4.5 | 下载校验和(TD-SEC-002 余项) |

## 测量口径

- P0/P1 计数：`docs/exec-plans/tech-debt-tracker.md` 按"状态"列统计。
- 测试数：`cargo test`（src-tauri/ 下）与 `npm test` 输出的用例数。
- 热点文件：`scripts/check-file-size.mjs`（阈值内为 0 违规）。
- 依赖方向：`npm run gate:structure` 违规数。
- 覆盖率：`npm test -- --coverage`（批次 7 起有门禁下限）。

## 历史分数

| 日期 | 下载 | 探测 | 组件 | 前端 | 工程化 | 文档 | 安全 | 备注 |
|---|---|---|---|---|---|---|---|---|
| 2026-10-06 | 2 | 2 | 2 | 3 | 1 | 2 | 3 | 改造基线 8dc303f |
| 2026-10-06 | 4 | 4 | 4 | 4 | 3.5 | 4 | 4 | 五阶段完成(harnessing 分支,CI 挂起待三问) |

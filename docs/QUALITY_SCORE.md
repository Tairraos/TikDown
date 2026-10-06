# 质量评分（QUALITY_SCORE）

> 按业务域打分，1–5 分。**每项分数必须注明可复算的依据**（测量命令/脚本），换算：5 优秀 / 4 良好 / 3 及格 / 2 差 / 1 缺失。改造期间每批次结束更新。

基线日期：2026-10-06（改造起点，commit `8dc303f`）

| 业务域 | 分数 | 依据（可复算） | 目标 | 差距与行动 |
|---|---|---|---|---|
| 下载域（download.rs + 队列） | 2 | P0×2（TD-DL-001 serde、TD-DL-002 cancel）；函数 185 行；0 测试 | 4 | 批次 4 修复 + 拆分 + 单测 |
| 探测域（probe.rs + probe_batch） | 2 | 串行阻塞探测；cookie 闭环缺失；explain_error 优先级 bug；0 测试 | 4 | 批次 5 |
| 组件管理域（binresolve/fetch/CorePanel） | 2 | 设置桥断裂 P0；ffmpeg 三平台两坏；进度路由失效；0 测试 | 4 | 批次 3 |
| 前端域 | 3 | tsc strict 通过；但 God Component 300 行、busy 卡死、伪控件、React 框架对极简 UI 过重 | 4 | 批次 6 重构（vanilla TS）+ 单测 |
| 工程化（门禁/CI/发布） | 1 | 0 测试、0 门禁、0 CI、无 bump 脚本 | 4 | 批次 2 建立；发布链路待 CI 三问 |
| 文档体系 | 2 | 仅内部草稿 README + research；AGENTS/ARCHITECTURE 缺失 | 4 | 批次 1 本批建立 |
| 安全 | 3 | 无硬编码密钥、命令行无拼接注入、npm audit 0；但 CSP null、组件下载无校验和 | 4 | 批次 3/6 加固 |

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

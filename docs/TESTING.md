# 测试策略（TESTING）

> 测试即文档：用例名描述行为，不使用魔法数字，不依赖执行顺序。

## 分层

| 层 | 范围 | 框架 | 运行 | 时长上限 |
|---|---|---|---|---|
| Rust 单元测试 | 纯函数与 serde 契约（version_ge / extract_version / parse_progress / explain_error / DownloadOptions 反序列化 / build_command 参数） | `cargo test` | pre-push + CI native job | < 30s |
| 前端单元测试 | lib 工具函数、state 队列逻辑、ipc mock 层 | vitest | pre-commit + CI | < 15s |
| 契约测试 | `tests/fixtures/ipc-contract.json` 两侧共用：Rust 反序列化真实前端 payload；TS 断言同一 fixture 形状 | cargo test + vitest | 同上 | — |
| 浏览器端到端 | 非 Tauri 环境下以 mock IPC 驱动真实 UI（粘贴→探测→下载→取消），浏览器自动化执行 | `npm run dev` + 浏览器 | 批次 6 起手动/CI 可选 | < 60s |

## 覆盖率

- 前端：vitest + v8，统计范围 `src/lib/types.ts`、`src/state/**`（`lib/ipc.ts` 为环境胶水，由浏览器 E2E 覆盖，豁免见 GATES.md）；门禁阈值 statements 80 / branches 60 / functions 70 / lines 80，实测 83.8/78.9/78/88。
- Rust：以关键路径单测替代覆盖率门禁（14 测,豁免登记见 `GATES.md`）。

## 反"假测试"约定

- 新增测试必须经历"破坏实现→测试变红"验证。2026-10-06 实测 3 处注入
  （probe is_image_only 翻转 / parse_progress 估算兜底移除 / done 事件误置 failed）
  全部被拦截,还原后全绿（决策日志）。
- serde 契约测试的 fixture 来自前端真实发送的 JSON 形状，不从 Rust 结构体反向生成。

## 防不稳定（flaky）

- 禁止依赖真实网络/真实子进程：yt-dlp 交互以注入 fixture 的方式测试。
- 时间相关逻辑注入时钟；随机数据用固定种子。
- 一旦出现 flaky：修根因；短期重跑兜底必须在 tracker 登记。

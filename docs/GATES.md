# 门禁清单（GATES）

> 每项门禁的四要素：检查什么 / 何时触发 / 失败意味着什么 / 怎么修。所有门禁本地一条命令可复现。
> 快速门禁在 pre-commit；全量门禁在 pre-push 与 CI（与 `.github/workflows/ci.yml` 同集）。

## 一条命令

| 场景 | 命令 |
|---|---|
| 快速门禁（提交前） | `npm run gate:quick` + `npm run lint` + `npx tsc --noEmit` + `npm test`（pre-commit 自动跑） |
| 全量门禁（推送/合并前） | `npm run gate` |

启用本地钩子（克隆后执行一次）：`npm run setup`

## 门禁明细

| 门禁 | 命令 | 触发时机 | 失败含义 | 修复指引 |
|---|---|---|---|---|
| ESLint | `npm run lint` | pre-commit / CI | 违反 TS 代码规范（未用变量、any、非空断言） | 按报错行修复；报错信息含规则名与文档链接 |
| 类型检查 | `npx tsc --noEmit` | pre-commit / CI | 类型错误 | 按报错修复；禁止用 any/断言压错误 |
| 单元测试 | `npm test`（vitest） | pre-commit / CI | 行为回归或契约破坏 | 修实现而不是删测试；测试即文档 |
| 文件大小（T1） | `node scripts/check-file-size.mjs` | pre-commit / CI | 源文件超 400 行 | 按单一职责拆分；豁免须在脚本 EXEMPT 登记 |
| 依赖方向（T7） | `node scripts/check-structure.mjs` | pre-commit / CI | 跨层依赖违规 | 见 ARCHITECTURE.md 白名单；下沉能力到允许的层 |
| 版本一致（§6.1） | `node scripts/check-version.mjs` | pre-commit / CI / release guard | 三处版本声明漂移 | `python3 scripts/_bump_version.py <ver>` |
| 文档门禁 | `node scripts/check-docs.mjs` | pre-commit / CI | 文档死链/缺索引/AGENTS 超长 | 修链接或补文档；删文档先摘索引 |
| cargo fmt | `cargo fmt --check` | pre-push / CI | 格式不一致 | `cargo fmt`（在 src-tauri/ 下） |
| cargo clippy | `cargo clippy -- -D warnings` | pre-push / CI | Rust lint 违规 | 按 clippy 提示修；合理豁免用 `#[allow]` + 注释理由 |
| cargo test | `cargo test` | pre-push / CI | Rust 行为回归 | 修实现；serde 契约失败优先怀疑字段命名 |
| 依赖漏洞 | `npm audit` / CI audit-check | pre-push / CI | 已知漏洞 | `npm audit fix`；无法升级时评估并登记豁免 |

## 豁免机制

- 豁免必须**显式登记**：代码豁免在脚本/`#[allow]` 处注明原因与到期日；流程豁免登记到 `docs/exec-plans/tech-debt-tracker.md`（带豁免理由与复评日期）。
- 无理由、无到期日的豁免视同违规。

## 当前豁免

| 范围 | 豁免内容 | 原因 | 到期/复评 |
|---|---|---|---|
| Rust 覆盖率门禁 | 未设 cargo 覆盖率下限（仅前端 vitest 覆盖率有阈值） | tarpaulin/llvm-cov 在 CI 的耗时与稳定性代价高，Rust 侧以关键路径单测 + 契约测试替代 | 批次 7 复评；若引入 llvm-cov 低成本方案则取消豁免 |
| 依赖漏洞（cargo） | 本地无 cargo-audit（CI 用 rustsec audit-check 承担） | 本地安装成本高 | 持续（CI 已兜底） |

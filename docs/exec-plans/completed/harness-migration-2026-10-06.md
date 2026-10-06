# Harness 工程化改造计划

## 0. 元信息

- 项目 / 仓库：TikDown（`github.com/Tairraos/TikDown`）——多平台社媒视频下载器，只下载视频
- 分支：`harnessing`（改造专用；现行工作全部在 master 且未提交，见 TD-ENG-001）
- 计划版本 / 日期：v1.0 / 2026-10-06
- 状态：**已完成**（阶段 1–5 全部通过；唯一未决项：§3.3 CI 三问待用户回答，未生成任何 workflows）
- 归档说明：本计划已执行完毕，自 active/ 移入 completed/。CI 三问的回答与后续落地记录在 `docs/CI.md`。
- 规则依据：`docs/HARNESS-RULES.md`（五阶段流程 §5；框架判定 §3.2 已执行）
- 用户已给定的两点输入：① README.md 是临时开发计划，阶段 2 产出正式文档体系后**以 docs/ 为准**开发维护；② React 升级到最新版本（TD-FE-003）；图标计划更换（TD-ENG-004 / D3）

## 1. 项目概况

**一句话**：Tauri v2 + React 18 + TypeScript 桌面应用，把 yt-dlp/ffmpeg 当外部 harness 子进程调用，实现"粘贴链接 → 批量探测 → 只下视频"。从 Electron v1（已失效的逆向 API 方案）重写而来。

- **技术栈**：前端 React 18.3.1 + TypeScript 5.7 + Vite 6；桌面壳 Tauri 2（Rust，rust-version 1.84，本机 rustc 1.99.0）；外部组件 yt-dlp（≥2025.01.01）、ffmpeg（≥5.0），按需下载到 `~/.tikdown`，不进安装包。
- **构建方式**：`npm run build`（tsc --noEmit + vite build）→ `tauri build`（bundle.targets "all"）。前端产物 `dist/`，Rust 产物 `src-tauri/target/`（未配置 target-dir 重定向，TD-ENG-005）。
- **运行方式**：开发 `npm run app:dev`（tauri dev，vite 1420 端口）；生产为桌面安装包（NSIS / dmg / deb 等）。
- **部署方式**：暂无——无 CI、无 tag、无 Release（`docs/CI.md` §2）。
- **顶层模块与入口点**：
  - 前端：`src/main.tsx` → `src/App.tsx`（队列与批量粘贴）→ `components/{TaskRow,CorePanel,SettingsPanel}.tsx` + `lib/types.ts`（契约类型与工具函数）
  - Rust：`src-tauri/src/main.rs` → `lib.rs`（Tauri 命令层，6 个命令）→ `binresolve.rs`（组件定位与版本门槛）/ `probe.rs`（探测与错误翻译）/ `download.rs`（下载子进程与进度事件）/ `fetch.rs`（组件按需下载）
  - 命令面：`core_status`、`get_settings`、`probe_batch`、`start_download`、`cancel_download`、`fetch_component`
- **当前测试与 CI 现状**：全仓 0 测试、0 门禁、0 CI（`npm audit` 恰好 0 漏洞）。`tsc --noEmit` 与 `cargo check` 基线通过（2026-10-06 实测）。git 仓库只有 1 个 2022 年提交（Electron v1），**整个 Tauri 应用从未提交**（TD-ENG-001，P0）。

## 2. 框架判定与 CI 现状（§3.2）

- **判定结果：Tauri**（三条证据全命中，详见 `docs/CI.md` §1）：
  1. `src-tauri/tauri.conf.json` 存在；
  2. `src-tauri/Cargo.toml:18` 依赖 `tauri = "2"`；
  3. `package.json` 含 `@tauri-apps/api`（dependencies）与 `@tauri-apps/cli`（devDependencies）。
- **现有 `.github/workflows/`**：不存在。
- **已有发布链路**：仅本地 `app:build` 脚本；bundle.targets="all" 但未声明 bundle.icon；无签名、无 updater、无 tag；capabilities 残留已被否决的 sidecar 方案配置（TD-ARCH-002）。详见 `docs/CI.md` §2。
- **CI 决策（是否生成 / 平台 / 发布方式）按 §3.3 留待阶段 3 逐条询问**，本计划不预设答案（待人工决策 D1）。

## 3. 现状诊断

### 3.1 架构现状（含模块依赖图）

分层方向整体健康（命令层 → 模块 → 工具，无环）：

```text
前端                                    Rust
─────────────────────────              ─────────────────────────────
main.tsx                               lib.rs（命令层 + 全局 State）
  └→ App.tsx（队列/设置/事件路由）   ├→ binresolve.rs ←─ fetch.rs
      ├→ TaskRow.tsx                   ├→ probe.rs ←────── download.rs（复用 explain_error）
      ├→ CorePanel.tsx                 └→ download.rs
      └→ SettingsPanel.tsx
          └→ lib/types.ts（手抄 Rust 契约）
```

已识别的结构问题：

- **前后端契约靠手抄**（`lib/types.ts` ↔ Rust 结构体），无单一来源，已产生死字段与漂移风险（TD-ARCH-001）。
- **设置链路三分裂**：localStorage（前端持久化）→ 仅下载命令显式传参；后端 `State<Settings>` 永远默认值——探测与组件检测两个入口吃不到用户配置（TD-CORE-001，P0）。
- **事件面脆弱**：下载事件（`task://event`）与组件下载事件（`core://progress` / `core://done`）的监听器存在闭包失效与失败事件被吞（TD-CORE-002）。
- **God Component 苗头**：App.tsx 300 行承载 ≥5 种职责，README 待办（队列并发/重试）将加剧（TD-FE-001）。

### 3.2 复杂度热点

| 热点 | 位置 | 度量 |
|---|---|---|
| `download::start` | `download.rs:52-238` | ~185 行单函数，混合参数拼装/线程编排/事件发射；内嵌 3 个 spawn 闭包 |
| App 组件 | `App.tsx:32-301` | 300 行、9 个 useState、事件路由 + 队列 + 设置 |
| 其余文件 | 全部 ≤ 262 行 | 无超标文件；453 行的 styles.css 属于正常样式表 |

### 3.3 重复代码

- `detect_ytdlp` / `detect_ffmpeg` 同构 ~35 行 ×2（`binresolve.rs:64-131`）。
- `exe_name` 一模一样两份（`binresolve.rs:222` 与 `fetch.rs:102`）。
- detect 与 path 解析重复执行 `--version` 子进程探测（`binresolve.rs:246-253`）。
- 前后端类型手抄双份（见 3.1）。

### 3.4 文档缺口

- 必需四件套全缺：无 `AGENTS.md`、无 `ARCHITECTURE.md`、无 `docs/exec-plans`（本次创建）、无 `QUALITY_SCORE.md`。
- README 为内部临时开发计划（用户明示将重写）；高质量选型依据困在 `research/`（不在常规检索树）；架构约定困在 `.workbuddy/`（TD-DOC-001/002）。
- 注释与实现矛盾两处（`probe.rs:122`；`fetch.rs:110` 注释与 curl `-w` 真实语义不符）（TD-DOC-003、TD-CORE-005）。
- Electron 遗留死文件（i18n/、resource/、tool/、build/、readme/）无任何标记或说明（TD-DOC-004）。

### 3.5 测试缺口

- 全仓 0 测试：Rust 无 `#[test]`；前端无测试框架与脚本（TD-ENG-007）。
- 高价值低成本首测目标（纯函数）：`version_ge`、`extract_version`、`parse_progress`、`explain_error`、`extractUrls`、`detectPlatform`。
- serde 契约（TD-DL-001 的实证方式）应固化为回归测试。
- 关键路径（粘贴 → 探测 → 下载 → 取消 → 完成）无任何端到端保护。

### 3.6 安全与性能风险

**安全**（均非紧急，登记为 P2）：
- CSP 为 null（`tauri.conf.json:24`，TD-SEC-001）；
- 组件下载无校验和，且部分来自第三方分发源 evermeet.cx / johnvansickle.com（TD-SEC-002）;
- PowerShell 命令单引号插值（`fetch.rs:180-196`，TD-SEC-003）。
- 已排除项：无硬编码密钥；无 shell 拼接执行（全部 `Command::new` + 分离参数）；npm audit 0 漏洞；cargo 侧无 audit 工具（阶段 3 补为门禁）。

**性能/可靠性**：
- P0×2：取消不杀子进程（TD-DL-002）；设置桥断裂（TD-CORE-001）。另有 P0×1：serde 契约失败使下载全挂（TD-DL-001）；P0×1：基线未提交（TD-ENG-001）。
- probe_batch 串行 + async 内阻塞 IO（TD-PROBE-002）；「全部下载」无并发上限（TD-DL-004）；组件下载进度机制失效（TD-CORE-005）。
- 慢性泄漏：Tasks 表完成不移除（TD-DL-008）。

### 3.7 提交门禁现状

无 hooks、无 CI、无 lint/format/测试脚本。仅有的隐式门禁是 `npm run build` 里的 `tsc --noEmit`。可本地复现的门禁为零。→ 阶段 3 从零建立。

## 4. 改造批次划分

| 批次 | 覆盖业务域 | 主要目标 | 覆盖问题 | 依赖前置 | 回滚方案 |
|---|---|---|---|---|---|
| **批次 0**（阶段 1 确认后立即） | 仓库底座 | 建 `harnessing` 分支；补 `.gitignore`；**Tauri 应用基线提交**；处置 `_legacy-electron/` 矛盾态（D2） | TD-ENG-001/002/003 | 计划确认 | 分支整体弃用即可回滚（不影响 master） |
| **批次 1**（= 阶段 2） | 文档（全仓） | AGENTS.md / ARCHITECTURE.md / docs 体系 / QUALITY_SCORE.md / core-beliefs；research+workbuddy 决策迁入 design-docs；此后以 docs/ 为准 | TD-DOC-001/002 | 批次 0 | `git revert` 文档批次提交（无行为影响） |
| **批次 2**（= 阶段 3） | 构建/CI | 基础门禁（fmt/clippy/tsc/eslint/测试/audit）；**§3.3 三问 → CI 落地**；版本 guard + bump 脚本；cargo target-dir；自定义 linter/结构测试；pre-commit | TD-ENG-005/006/008/009 + D1 三问 | 批次 1 | revert CI 与门禁提交；本地门禁可用 `git config core.hooksPath` 还原 |
| **批次 3**（阶段 4 · 之一） | 组件管理域 | 修设置桥（P0）；CorePanel 进度/错误（P1）；ffmpeg 三平台修复（P1）；下载校验（P1）；curl 进度（P1）；fetch 去重；detect 去重；校验和 | TD-CORE-001…007、TD-SEC-002/003 | 批次 2（护栏就位才许动代码） | 每问题独立提交，按 TD 编号逐个 `git revert`；行为修复类均单测锁定 |
| **批次 4**（阶段 4 · 之二） | 下载域 | 修 serde 契约（P0）与取消杀进程（P0）；假成功防护；并发队列上限（D7）；拆 `download::start`；矛盾参数/竞态/泄漏清理 | TD-DL-001…008 | 批次 3 | 同上：问题修复与重构分离提交，逐个可 revert |
| **批次 5**（阶段 4 · 之三） | 探测域 | probe 支持 cookie（D6 确认后）；probe_batch 有界并发 + 非阻塞；explain_error 修正 | TD-PROBE-001/002/003 | 批次 4 | 同上 |
| **批次 6**（阶段 4 · 之四） | 前端壳域 | **React 19 升级（用户指令，独立提交）**；工具链跟进（D4）；App.tsx 拆分；伪控件/目录持久化；契约测试；CSP；图标管线（D3 提供源图后）+ 遗留死文件处置（D3）；capabilities 清理 | TD-FE-001…005、TD-ARCH-001/002、TD-SEC-001、TD-DEP-001/002、TD-ENG-004、TD-DOC-003/004 | 批次 5 | React 升级独立提交可单独 revert；拆分为行为守恒重构，以现有手测路径 + 新增单测验证 |
| **批次 7**（= 阶段 5） | 测试（跨域） | 补关键路径/边界/异常测试；分层策略；覆盖率门禁 + 结构测试实测拦截 | TD-ENG-007 收口 | 批次 6 | revert 测试提交不影响行为 |

排序依据：影响面 × 修复成本 × 改动风险（§5 阶段 1 子任务 11）。P0 全部集中在批次 0（可回滚性）与批次 3/4（三个功能缺陷）——护栏（批次 2）就位后才动业务代码，这是 C3/C4 的硬顺序。

## 5. 五阶段任务拆解

> 每个子任务的执行角色均为**智能体**；**人类**负责计划确认、决策回答、验收。验收标准全部可机械检查。

### 阶段 1 · 全量扫描与问题清单（本计划，已完成待确认）

- 子任务：仓库地图 ✅；框架判定 ✅（`docs/CI.md` §1）；架构依赖图 ✅（§3.1）；复杂度度量 ✅（§3.2）；重复代码 ✅（§3.3）；文档缺口 ✅（§3.4）；测试缺口 ✅（§3.5）；安全审计 ✅（§3.6）；性能可靠性审计 ✅（§3.6）；提交门禁审计 ✅（§3.7）；风险分级 ✅（tech-debt-tracker）；分域批次 ✅（§4）。
- 产出物：本计划、`docs/exec-plans/tech-debt-tracker.md`（38 条）、`docs/CI.md`。
- 验收标准：
  - [x] 框架判定完成，证据文件路径写入 `docs/CI.md`
  - [x] 问题清单每条含 ID/位置/类别/严重度/证据/修复建议/业务行为影响
  - [x] "修复 bug"与"变更行为"与纯重构严格分离（tracker 单列字段）
  - [x] 每批有独立回滚方案（§4 表）
  - [x] 无"只有标题没有分析"的条目
  - [ ] **计划获人工确认**（当前待办）
  - [ ] 未修改业务代码（`git status` 自证，见 §7 决策日志）

### 阶段 2 · 文档对齐（= 批次 1）

- 子任务：重写式新建 `AGENTS.md`（≤100 行地图）；新建 `ARCHITECTURE.md`（分层地图 + 依赖方向规则：`Types → Config → Repo → Service → Runtime → UI` 的本项目适配版——前端组件层 / Rust 命令层 / 模块层的单向依赖）；建 `docs/` 树（design-docs / exec-plans / product-specs / QUALITY_SCORE.md）；`core-beliefs.md`（沉淀 yt-dlp harness 选型、"只下视频"策略、组件不进包、失败三分法等第一性原则——输入来自 README 与 research/）；迁移 research/.workbuddy 决策；文档 linter（死链/必填节）。
- 产出物：`AGENTS.md`、`ARCHITECTURE.md`、`docs/design-docs/{index.md,core-beliefs.md,platform-harness-research.md}`、`docs/QUALITY_SCORE.md`、`docs/index.md`。
- 验收标准：
  - [ ] `AGENTS.md` ≤ 200 行且为地图形态
  - [ ] `ARCHITECTURE.md` 依赖规则与代码抽样 ≥3 处一致
  - [ ] `docs/index.md` 链接全可解析（linter 实测）
  - [ ] `QUALITY_SCORE.md` 每个业务域有可复算分数
  - [ ] 文档校验 CI 作业存在且死链能使其失败（实测）

### 阶段 3 · 门禁审计与自动化质量校验（= 批次 2）

- 子任务：**先执行 §3.3 三问**（见 D1，逐条问、等回答、落盘 `docs/CI.md`）；按答案落地 `ci.yml` /（若同意）`release.yml`；基础门禁（rustfmt、clippy -D warnings、tsc、eslint、cargo audit/npm audit、cargo test、vitest）；pre-commit 本地复现一条命令；结构测试（依赖方向、文件大小 ≤ 阈值、契约测试挂靠）；自定义 linter 错误信息含修复指令；版本 guard + `scripts/_bump_version.py`；文档门禁；覆盖率门禁下限；豁免机制。
- 产出物：`.github/workflows/{ci.yml,release.yml?}`、`docs/CI.md` 回填、`docs/GATES.md`（门禁清单）、linter 与结构测试脚本、pre-commit 配置。
- 验收标准：
  - [ ] 三问已逐条询问且答案 + 日期落盘 `docs/CI.md` §3
  - [ ] 若选 draft：release 流程无自动转正兜底（配置实测检查）
  - [ ] 干净环境 安装→构建→测试 一次成功（有记录）
  - [ ] 故意引入越层依赖 / 超长文件 / 非结构化日志 / 死链，门禁实测失败
  - [ ] 每个门禁失败输出含修复指令
  - [ ] 本地一条命令复现全部门禁
  - [ ] 版本 guard：改乱一处版本号 → 实测失败

### 阶段 4 · 问题修复与重构落地（= 批次 3–6）

- 子任务：按批次 3 → 4 → 5 → 6 顺序，每批一个业务域；P0 先行（TD-CORE-001 → TD-DL-001 → TD-DL-002）；每个问题独立提交并引用 TD 编号；行为修复与重构严格分离；每批同步更新 tracker 状态、QUALITY_SCORE 分数与本计划进度日志。
- 产出物：每批一组小粒度提交；更新后的 tech-debt-tracker 与本计划日志。
- 验收标准：
  - [ ] 每批结束门禁全绿
  - [ ] 重构行为守恒：新增单测 + 关键路径手测记录（改动前后对同输入同输出）
  - [ ] bug 修复/行为变更均在 tracker 显式标注且单独提交（commit 引用 TD 编号）
  - [ ] 重复代码与复杂度指标给出前后数值（批次 3/4/6 各测一次）
  - [ ] 进度日志与 commit 历史逐条对应

### 阶段 5 · 测试补全与门禁接入（= 批次 7）

- 子任务：Rust 纯函数单测（version_ge/extract_version/parse_progress/explain_error/DownloadOptions serde 契约）；前端 vitest（extractUrls/detectPlatform/formatBytes/formatDuration + 拆分后的队列 hook）；关键路径集成测试（模拟 yt-dlp 子进程的 fixture 驱动）；边界与异常（空值/取消/超时/部分失败）；Rust 测试进 Verify 的 native job、前端进 frontend job（macOS native job 不裁剪）；覆盖率门禁（整体 + 关键模块下限）；结构测试接入。
- 产出物：测试代码与 fixture、覆盖率配置、`docs/TESTING.md` 测试策略。
- 验收标准：
  - [ ] 覆盖率达标且关键模块单独达标（报告）
  - [ ] 故意破坏实现 ≥3 处，测试必须失败（防假测试）
  - [ ] 全部 P0 修复有回归测试
  - [ ] 全量测试连续 3 次运行无失败
  - [ ] 覆盖率与结构测试实测可拦截注入缺陷

## 6. 待人工决策清单

| 编号 | 问题 | 为什么需要人判断 | 影响范围 | 需要回答的时间点 |
|---|---|---|---|---|
| **D1** | **§3.3 三问**：是否生成 GitHub CI 配置？目标平台（windows/mac/ubuntu 多选）？Release 直接发布还是先出 draft？ | 产品决策，代码里推不出来；规则明文禁止预设默认（§3.3） | 阶段 3 的 CI 形态 | 阶段 3 开始时（届时会先摆出现状：当前无任何 CI） |
| D2 | `_legacy-electron/` 恢复保留（README 意图）还是放弃（git 历史可查）？ | 用户在 README 写"保留作参考"，但工作区已删，两者矛盾 | 批次 0 | 计划确认时一并回答即可 |
| D3 | 新图标：请提供源图（≥1024×1024 PNG）；同时决定 Electron 遗留目录（`build/`、`resource/`、`i18n/`、`tool/`、`readme/`）保留还是删除 | 图标源文件只有用户有；遗留目录可能含想留的资产 | 批次 6 | 批次 6 开始前 |
| D4 | 工具链升级深度：React 19 已确认必做；Vite 8 / plugin-react 6 / **TypeScript 7.0**（新大版本）是否同批升？ | TS7 刚发布，与"无聊技术"原则权衡 | 批次 6 | 批次 6 开始前 |
| D5 | `vite minify: false` 是有意保留（可调试）还是历史遗留（应发布压缩）？ | 无记录，不可推断 | 批次 6 | 批次 6 开始前 |
| D6 | 探测阶段是否支持 Cookie（修复登录墙闭环 TD-PROBE-001）？会读取浏览器登录态用于探测 | 涉及用户登录态的读取范围，隐私相关产品决策 | 批次 5 | 批次 5 开始前 |
| D7 | 并发下载上限默认值（建议 2–3）与任务队列是否需要重启后保留（持久化）？ | 产品体验决策，README 待办未定 | 批次 4 | 批次 4 开始前 |
| D8 | 应用身份确认：`productName: TikDown` / `identifier: com.tairraos.tikdown` 是否定稿（签名与打包身份，改起来成本随安装基数增长） | 对外身份决策 | 批次 2（CI 产物命名） | 阶段 3 开始前 |

## 7. 进度与决策日志

| 日期 | 阶段 | 动作 | 关联 commit | 决策与理由 |
|---|---|---|---|---|
| 2026-10-06 | 阶段 1 | 全量扫描（框架判定= Tauri；三处版本对齐 2.0.0；npm audit 0 漏洞；tsc/cargo check 基线通过；TD-38 项登记，P0×4） | （待计划确认后随批次 0 归档提交） | ① 阶段 1 未修改任何业务代码，仅新增 `docs/CI.md`、`docs/exec-plans/*`、`prompr-history.txt` 与 `.gitignore` 追加一行（§6.3 会话纪律要求）。② TD-DL-001 的 serde 缺陷在 /tmp 临时工程实证（`missing field 'target_dir'`），未触碰仓库。③ 阶段 3 进入前将先执行 D1 三问与 D8 确认。 |
| 2026-10-06 | 计划确认 | 用户确认计划，并给出决策：批次 0 基线提交（`tauri 改造初始提交`）；D2=`_legacy-electron/` 删除（暂存区清理、README 删除该节）；D3=图标先用占位图（遗留目录暂保留）；D4=TS 版本由智能体选最可靠、**允许破坏性重构、React 可弃用**（界面简单，维护性优先）；D6=探测支持 Cookie，需要时打开浏览器由用户登录，且须设计用户获取 Cookie 的方法；D7=并发上限进设置，默认 1、极限 4 | `8dc303f` | D1 三问按 §3.3 在阶段 3 执行；D5（minify）未答，由智能体按"维护性优先 + 发布体积"决策并记录；D8 暂缓（identifier 不阻塞 CI） |
| 2026-10-06 | 批次 1 | 文档对齐:AGENTS/ARCHITECTURE/core-beliefs/产品规格(cookie 设计)/QUALITY_SCORE/索引;research 迁入 design-docs;README 重写对外版 | `d51c4e9` | 文档从此为开发维护唯一依据 |
| 2026-10-06 | 批次 2 | 门禁体系:eslint(TS 6.0.3 决策:lint 生态上限 <6.1,弃 7.0.2)/vitest 5/结构·大小·版本·文档四脚本/pre-commit·pre-push/GATES.md/TESTING.md/bump 脚本;**§3.3 三问已发出未获回答 → CI 生成挂起(未碰 workflows)** | `3341d72` `a643fa7` | 首批测试即发现并修复 TD-FE-006;文档门禁当场拦截 2 个死链(实测第一例) |
| 2026-10-06 | 批次 3 | 组件管理域:set_settings 桥(P0)/detect 参数化/ureq 流式进度/三平台解压/强制校验/重入防护/PowerShell 转义 | `28ae98c` `7fa30ac` `aa527f2` | 结构门禁拦下 probe→Settings 违规边,改散字段入参保持分层 |
| 2026-10-06 | 批次 4 | 下载域:serde camelCase(P0,实证)/cancel 杀进程(P0)/假成功防护/模块拆分(自建 T1 门禁拦下 492 行)/stderr channel 化/Tasks 泄漏清理 | `11999c6` | 8 个 Rust 单测锁定参数与进度契约 |
| 2026-10-06 | 批次 5 | 探测域:cookieMode 三模式闭环(探测与下载同源)/probe_batch 有界并发(4)/设置面板 Cookie 区块(规格 cookie-access.md) | `6eb9754` `beb54b1` | 用户决策 D6 落地;需要登录时由用户在浏览器完成 |
| 2026-10-06 | 批次 6 | 前端重构:**弃用 React,vanilla TS 三层**(用户授权,维护性优先)/mock IPC 支持浏览器开发与 E2E/占位图标管线/CSP/幽灵配置清理/minify 决策/浏览器 E2E 发现并修复 3 处 UI 缺陷 | `c63ba00` `de7ccd6` `a7d998a` | React 19 升级任务(TD-FE-003)以移除取代;web-gui-tester 全流程实测通过 |
| 2026-10-06 | 批次 7 | 测试补全:前端 49 测+Rust 14 测/契约 fixture 两侧共用/覆盖率门禁(80/60/70/80)/反假测试实测 3 处注入全红/TD-PROBE-004(explain_error 子串误报,单测发现)/队列拒绝补位修复 | `d7c4d31` | 阶段 5 验收达成 |
| 2026-10-06 | 收官 | 台账收口(全部 TD 对齐 commit)/QUALITY_SCORE 复评/施工图归档 §14 | 见收官提交 | 唯一遗留:CI 三问、正式图标源图、遗留目录去留、Windows/Linux 打包实测 |

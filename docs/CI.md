# CI 配置决定

> 本文件是 CI 与发布链路决策的**常驻记录系统**。交互式决策（是否生成 CI / 目标平台 / 发布方式）确认后必须落盘在此。
> 当前状态：**阶段 1（框架判定与现状盘点）已完成；§3.3 三步交互询问尚未进行，留到阶段 3。**

## 1. 框架判定

- **判定结果：Tauri（桌面应用）**
- 判定日期：2026-10-06
- 判定证据（任一命中即判定，本项目三条全命中）：

| # | 证据 | 位置 | 内容 |
|---|---|---|---|
| 1 | `src-tauri/tauri.conf.json` 存在 | `src-tauri/tauri.conf.json` | `$schema: https://schema.tauri.app/config/2`，identifier `com.tairraos.tikdown` |
| 2 | `src-tauri/Cargo.toml` 依赖含 tauri | `src-tauri/Cargo.toml:18` | `tauri = { version = "2", features = [] }`，另有 `tauri-build = "2"`、`tauri-plugin-shell`、`tauri-plugin-dialog` |
| 3 | 根 `package.json` 含 @tauri-apps 包 | `package.json:15,22` | dependencies 有 `@tauri-apps/api: ^2`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-shell`；devDependencies 有 `@tauri-apps/cli: ^2` |

## 2. 现有 CI 现状（存量项目必填）

### 2.1 `.github/workflows/`

**不存在**（仓库内无 `.github/` 目录）。项目从未配置过任何 GitHub Actions。

### 2.2 已有发布链路现状

| 项 | 现状 | 位置 | 评估 |
|---|---|---|---|
| 构建/发布脚本 | `dev` / `build`（tsc+vite）/ `app:dev` / `app:build`（tauri build）；**无 release 脚本** | `package.json:6-13` | 只能本地手工出包，无自动化发布 |
| bundle 配置 | `targets: "all"`（符合多平台要求）；**未声明 `bundle.icon`**；NSIS `installMode: currentUser` | `src-tauri/tauri.conf.json:27-39` | 缺 icon 声明：Windows 打包将落到默认图标（见 tech-debt TD-ENG-004） |
| 图标资产 | `src-tauri/icons/` 仅 `icon.png` 一个文件；`build/` 下是 Electron 时代 electron-builder 图标（icns/ico/background 等） | `src-tauri/icons/`、`build/` | 图标管线需重建（用户已明确计划更换图标，待定新源图） |
| 签名密钥 | 未配置（无 updater、无签名环境变量） | — | 分发前需决策（README 待办已列"三平台签名与 SHA-256"） |
| Git tag | 无任何 tag | `git tag` | 首次 tag 发布时需版本 guard（三处版本声明当前已对齐为 2.0.0） |
| capabilities | `shell:allow-execute` 重复声明两处；引用 `binaries/yt-dlp`、`binaries/ffmpeg` sidecar——**仓库内不存在这两个 sidecar 二进制**；前端 0 处引用 plugin-shell | `src-tauri/capabilities/default.json:6-16` | 幽灵配置，是"sidecar 方案"（见 `.workbuddy/memory`）被否决后的残留 |
| cargo target-dir | 未配置 `src-tauri/.cargo/config.toml`，产物默认落在 `src-tauri/target/` | — | 与 §10.2 规范不符，且 `src-tauri/target/` 未进 `.gitignore` |

### 2.3 提交门禁现状

- 无 git hooks（`.git/hooks/` 仅有样例文件）。
- 无 lint / format / 测试脚本（`package.json` scripts 仅有 dev/build/preview/tauri 系列）。
- 前端 `tsc --noEmit` 当前通过（基线实测 2026-10-06）；`cargo check` 当前通过（rustc 1.99.0）。
- `npm audit`：0 漏洞（140 个依赖，2026-10-06 实测）。
- 全仓 **0 个测试**（无 `#[test]`、无 `*.test.*`、无测试框架依赖）。

## 3. 交互确认记录（仅 Tauri 填写）

> **尚未进行。** 按 HARNESS-RULES §3.3，阶段 3 进入门禁落地前必须逐条询问以下三个问题（不得合并、不得预设默认），回答后回填本表。

| 问题 | 用户回答 | 时间 |
|---|---|---|
| 是否生成 GitHub CI 配置 | **是** | 2026-10-06（二次询问获得回答） |
| 目标平台（多选）windows / mac / ubuntu | **三平台全选**：mac（arm64 + x86_64 双架构）+ windows + ubuntu | 2026-10-06 |
| Release 发布方式：直接发布 / 先出 draft | **先出 draft**（CI 建 draft 并传产物，用户在 GitHub 网页检查后手动发布；**无自动转正兜底**） | 2026-10-06 |
| 触发时机（用户补充） | **不自动 trigger tag**：用户合并到 master 后自行打 tag 触发；harnessing 分支保留至稳定再合并 | 2026-10-06 |

## 4. 落地说明

- workflow 文件：`.github/workflows/ci.yml`（Verify）+ `.github/workflows/release.yml`（Release）
- 触发条件：
  - Verify：分支 push 与 PR（`branches: ["**"]` 排除 tag，避免与 Release 双重编译）；frontend（ubuntu，lint/tsc/vitest/gate:quick/build）+ native（macOS，fmt/clippy/cargo test）双 job
  - Release：push `v*` tag；guard job 校验 tag==package.json 版本（不一致即红，修复指引指向 `_bump_version.py`）并预建 **draft** Release；build matrix `fail-fast: false`
- matrix 与平台对应：mac 双架构（`--target aarch64-apple-darwin` / `x86_64-apple-darwin`，macos-latest）+ windows（windows-latest）+ ubuntu（**ubuntu-22.04**，装 libwebkit2gtk-4.1 等 Tauri v2 依赖）
- 与发布方式的对应：`tauri-action` 设 **releaseDraft: true**；**未添加** `gh release edit --draft=false` 自动转正兜底（用户选 draft，§3.3 明令禁止）
- 与现有配置的关系：全新生成（此前无任何 CI）
- 触发方式：用户合并 master 后手动 `git tag v2.0.0 && git push origin v2.0.0`（不提供删 tag 重打的 release 脚本——用户明确要求手动控制触发）
- 构建失败排障：notify-failure job 输出 `::error::` 注解（无认证可读）；常见原因清单在 GATES.md

## 5. 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-10-06 | 创建本文件；完成框架判定（Tauri）与现状盘点 | Harness 改造阶段 1（HARNESS-RULES §3.2 / §5） |
| 2026-10-06 | §3.3 三问获得回答并落地 ci.yml + release.yml | 用户确认:三平台 / draft / 手动打 tag |

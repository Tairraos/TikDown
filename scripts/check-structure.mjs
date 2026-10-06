#!/usr/bin/env node
/**
 * T7 结构测试:依赖方向白名单(ARCHITECTURE.md 的可执行形态)。
 * 违规修复方式:把被依赖的能力下沉到白名单允许的层,或在依赖方引入显式接口。
 * 新增允许的边:先改 ARCHITECTURE.md 白名单表,再同步本脚本的 RUST_ALLOW/LIB 规则。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = [];

// ---- Rust 侧:crate 内 use 依赖白名单 ----
// 命令层(lib.rs)可用全部模块;业务模块只准依赖白名单里的模块;叶子模块禁止 crate 内依赖。
// 新增 .rs 文件若含 `use crate::` 而未在此登记,视为结构违规(强制显式化)。
const RUST_ALLOW = {
  "src-tauri/src/lib.rs": ["binresolve", "download", "fetch", "probe"],
  "src-tauri/src/download/mod.rs": ["binresolve", "probe"],
  "src-tauri/src/download/args.rs": [],
  "src-tauri/src/download/progress.rs": [],
  "src-tauri/src/fetch.rs": ["binresolve"],
  "src-tauri/src/probe.rs": [],
  "src-tauri/src/binresolve.rs": [],
};

function walkRust(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkRust(p, out);
    else if (p.endsWith(".rs")) out.push(p);
  }
  return out;
}

for (const file of walkRust("src-tauri/src")) {
  const src = readFileSync(file, "utf8");
  const uses = [...src.matchAll(/use\s+crate::(\w+)/g)].map((m) => m[1]);
  const allowed = RUST_ALLOW[file];
  if (allowed === undefined) {
    if (uses.length > 0) {
      failures.push(
        `${file} 含 crate 内依赖 [${[...new Set(uses)].join(", ")}] 但未在结构检查登记 — ` +
          `先在 ARCHITECTURE.md 白名单表登记,再更新 scripts/check-structure.mjs 的 RUST_ALLOW`
      );
    }
    continue;
  }
  for (const u of new Set(uses)) {
    if (!allowed.includes(u)) {
      failures.push(
        `${file} 依赖 crate::${u} — 白名单仅允许 [${allowed.join(", ") || "无"}]`
      );
    }
  }
}

// ---- 前端侧:层次边界 ----
// lib/ 是叶子:不准反向依赖 state/组件,也不准直接触碰 IPC(供状态层使用)。
const LIB_FORBIDDEN = [
  [/from\s+["']react["']/, "lib 层不得依赖 UI 框架"],
  [/from\s+["']@tauri-apps\//, "lib 层不得直接调用 Tauri IPC(由 ipc 封装层承担)"],
  [/from\s+["']\.\.\/(components|ui|state)/, "lib 层是叶子,禁止反向依赖上层"],
];

function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

for (const file of walkTs("src/lib")) {
  const src = readFileSync(file, "utf8");
  for (const [re, why] of LIB_FORBIDDEN) {
    if (re.test(src)) failures.push(`${file}: ${why}`);
  }
}
// 任何前端文件不准引用 src-tauri 内部路径
for (const file of walkTs("src")) {
  if (/src-tauri/.test(readFileSync(file, "utf8")))
    failures.push(`${file}: 前端不得引用 src-tauri 内部路径`);
}

if (failures.length) {
  console.error(
    `❌ 依赖方向违规(T7 结构不变量):\n` +
      failures.map((f) => `  - ${f}`).join("\n") +
      `\n\n修复方式:见 ARCHITECTURE.md「依赖方向白名单」。` +
      `把被依赖能力下沉到允许的层;新增合法的边需先更新 ARCHITECTURE.md 与本脚本。`
  );
  process.exit(1);
}
console.log("✓ 依赖方向检查通过(Rust 模块白名单 + 前端层次边界)");

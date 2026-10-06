#!/usr/bin/env node
/**
 * T1 品味不变量:单个源文件行数上限。
 * 超限时修复方式:按职责拆分文件,而不是调大阈值。
 * 确需豁免:在下方 EXEMPT 显式登记 { 文件: "原因(到期日)" },并同步 tech-debt-tracker。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 400;
const ROOTS = ["src", "src-tauri/src", "tests"];
const EXTS = new Set([".ts", ".tsx", ".rs"]);
const EXEMPT = {}; // { "src/foo.ts": "原因(到期 YYYY-MM-DD)" }

const failures = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXTS.has(p.slice(p.lastIndexOf(".")))) {
      if (p in EXEMPT) continue;
      const lines = readFileSync(p, "utf8").split("\n").length;
      if (lines > LIMIT) {
        failures.push(`${p}: ${lines} 行 > 上限 ${LIMIT} 行`);
      }
    }
  }
}
for (const r of ROOTS) walk(r);

if (failures.length) {
  console.error(
    `❌ 文件大小超限(T1 不变量,阈值 ${LIMIT} 行):\n` +
      failures.map((f) => `  - ${f}`).join("\n") +
      `\n\n修复方式:按单一职责拆分该文件(拆出的模块放进同目录或 lib/)。\n` +
      `不要调大阈值;确有理由时在 scripts/check-file-size.mjs 的 EXEMPT 登记原因与到期日。`
  );
  process.exit(1);
}
console.log(`✓ 文件大小检查通过(≤ ${LIMIT} 行,扫描 ${ROOTS.join(", ")})`);

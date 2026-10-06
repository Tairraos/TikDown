#!/usr/bin/env node
/**
 * 文档门禁:docs/index.md 中的相对链接必须可解析;AGENTS.md 必须存在且 ≤200 行。
 * 死链修复方式:修正 docs/index.md 中的链接,或补齐缺失文档(并在其父索引登记)。
 * 删除文档时:先从对应 index.md 摘除条目,再删文件。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const failures = [];

function checkLinks(indexFile) {
  const base = dirname(indexFile);
  const src = readFileSync(indexFile, "utf8");
  const links = [...src.matchAll(/\]\(([^)#https?][^)]*)\)/g)].map((m) => m[1]);
  for (const link of links) {
    const target = resolve(base, link);
    if (!existsSync(target)) {
      failures.push(`${indexFile}: 死链 ${link}`);
    }
  }
  return links.length;
}

let linkCount = checkLinks("docs/index.md");
linkCount += checkLinks("docs/design-docs/index.md");
linkCount += checkLinks("docs/product-specs/index.md");

// AGENTS.md 是入口地图,必须存在且有行数上限(§2.2)
if (!existsSync("AGENTS.md")) failures.push("AGENTS.md 缺失(它是渐进式披露的入口)");
else {
  const lines = readFileSync("AGENTS.md", "utf8").split("\n").length;
  if (lines > 200)
    failures.push(`AGENTS.md ${lines} 行 > 200 行上限——把内容下推到 docs/ 专项文档`);
}
// QUALITY_SCORE.md 是必需四件套之一(§2.1)
for (const must of ["docs/QUALITY_SCORE.md", "docs/exec-plans/tech-debt-tracker.md", "ARCHITECTURE.md"]) {
  if (!existsSync(must)) failures.push(`必需文档缺失: ${must}`);
}
// 目录非空检查:索引里列了 index 的目录不允许只剩空壳
for (const d of ["docs/design-docs", "docs/product-specs"]) {
  if (statSync(d).isDirectory() && existsSync(join(d, "index.md")) === false)
    failures.push(`${d} 缺 index.md`);
}

if (failures.length) {
  console.error(
    `❌ 文档门禁失败(${linkCount} 个链接已检查):\n` +
      failures.map((f) => `  - ${f}`).join("\n") +
      `\n\n修复方式:死链→修正链接或补齐文件;缺 index→为该目录补索引条目。` +
      `文档改动必须同步其父级 index.md 的登记。`
  );
  process.exit(1);
}
console.log(`✓ 文档检查通过(${linkCount} 个链接可解析,入口地图与四件套齐全)`);

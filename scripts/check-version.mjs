#!/usr/bin/env node
/**
 * 版本一致性门禁(§6.1):三处声明点必须相同。
 * 失败修复方式:运行 python3 scripts/_bump_version.py <版本>,禁止手工散改其中一处。
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  "package.json": pkg.version,
  "src-tauri/tauri.conf.json": conf.version,
  "src-tauri/Cargo.toml": cargoVersion,
};
const unique = new Set(Object.values(versions));
if (unique.size !== 1 || !pkg.version) {
  console.error(
    `❌ 版本三处声明不一致(§6.1):\n` +
      Object.entries(versions)
        .map(([f, v]) => `  - ${f}: ${v ?? "(缺失)"}`)
        .join("\n") +
      `\n\n修复方式:python3 scripts/_bump_version.py <统一版本号>`
  );
  process.exit(1);
}
console.log(`✓ 版本三处一致: ${pkg.version}`);

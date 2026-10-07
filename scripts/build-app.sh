#!/usr/bin/env bash
# 出包约定(用户立规 2026-10-07,AGENTS.md 登记):
#   每次出包 = 升一版 → 只打 .app(不打 dmg)→ 清理旧版本与过程产物;保留 target/ 增量缓存加速下次构建。
set -euo pipefail
cd "$(dirname "$0")/.."

current=$(node -p "require('./package.json').version")
next="${current%.*}.$((${current##*.} + 1))"
python3 scripts/_bump_version.py "$next"

npm run app:build

# 清理:不再产出 dmg(旧版残留一并删除);.app 同名路径原地替换,无需额外清理。
# target/ 增量缓存保留,下次构建更快。
rm -rf target/release/bundle/dmg
find target/release/bundle -maxdepth 3 -name "*.dmg" -delete 2>/dev/null || true

echo "✓ TikDown v${next} 出包完成: target/release/bundle/macos/TikDown.app"

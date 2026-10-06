#!/usr/bin/env python3
"""版本三处同步 bump(§6.1)。用法: python3 scripts/_bump_version.py 2.1.0"""
import json
import re
import sys
from pathlib import Path

def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+(-[\w.]+)?", sys.argv[1]):
        sys.exit("用法: python3 scripts/_bump_version.py <x.y.z[-pre]>)")
    version = sys.argv[1]

    pkg = Path("package.json")
    d = json.loads(pkg.read_text())
    d["version"] = version
    pkg.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")

    conf = Path("src-tauri/tauri.conf.json")
    d = json.loads(conf.read_text())
    d["version"] = version
    conf.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")

    cargo = Path("src-tauri/Cargo.toml")
    text = cargo.read_text()
    text, n = re.subn(r'(?m)^version\s*=\s*"[^"]+"', f'version = "{version}"', text, count=1)
    if n != 1:
        sys.exit("Cargo.toml 未找到 package version 字段")
    cargo.write_text(text)

    print(f"✓ 三处版本已同步为 {version}(package.json / tauri.conf.json / Cargo.toml)")
    print("  别忘了 Cargo.lock:在 src-tauri/ 下运行 cargo update -p tikdown 或直接 cargo check")

if __name__ == "__main__":
    main()

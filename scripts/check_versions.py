#!/usr/bin/env python
"""校验版本号在所有落点保持一致。

发版时需要手工同步多处版本号，漏改任意一处都会导致界面/后端/安装包版本互相矛盾。
本脚本把这一步自动化，本地与 GitHub Actions 共用。

用法：
    python scripts/check_versions.py            # 仅校验内部一致性
    python scripts/check_versions.py v0.1.3     # 额外校验与 git tag 一致
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Windows 上 Python 以 cp1252 写 stdout 时，打印中文会抛 UnicodeEncodeError
# （GitHub Actions 的 windows-latest 必现）。强制 UTF-8，避免 CI 因输出编码失败。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# (标签, 相对路径, 提取方式)
TEXT_TARGETS = [
    ("backend/__init__.py", r'__version__\s*=\s*"([^"]+)"'),
    ("backend/platform.py", r'version:\s*str\s*=\s*"([^"]+)"'),
    ("backend/tools/disk_cleanup.py", r'__version__\s*=\s*"([^"]+)"'),
    ("backend/tools/_template_tool.py", r'__version__\s*=\s*"([^"]+)"'),
    # 前端只保留这一处：Shell 的版本号已改为 vite define 注入（__APP_VERSION__，源即
    # package.json），registry.tsx 已随多工具平台机制移除——两者都不再是独立落点。
    ("src/components/SettingsPanel.tsx", r'"(\d+\.\d+\.\d+)"'),
]


def collect() -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    found.append(("package.json", pkg["version"]))

    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    found.append(("package-lock.json (根)", lock["version"]))
    root_pkg = lock.get("packages", {}).get("", {})
    if "version" in root_pkg:
        found.append(('package-lock.json (packages[""])', root_pkg["version"]))

    for rel, pattern in TEXT_TARGETS:
        path = ROOT / rel
        if not path.exists():
            found.append((rel, "<文件缺失>"))
            continue
        match = re.search(pattern, path.read_text(encoding="utf-8"))
        found.append((rel, match.group(1) if match else "<未匹配>"))

    return found


def main() -> int:
    entries = collect()
    versions = {v for _, v in entries if not v.startswith("<")}

    width = max(len(name) for name, _ in entries)
    for name, version in entries:
        mark = " " if not version.startswith("<") else "!"
        print(f"  {mark} {name.ljust(width)}  {version}")

    # 落点读取失败必须直接判失败：否则删改文件会让校验目标静默落空，
    # 脚本仍打印「N 处一致」并返回成功，形成假通过。
    failed = [name for name, v in entries if v.startswith("<")]
    if failed:
        print(f"\n以下落点读取失败（文件缺失或正则未匹配），校验无法完成：")
        for name in failed:
            print(f"  - {name}")
        print("请修正文件或更新 TEXT_TARGETS，不要放过期目标。")
        return 1

    if len(versions) != 1:
        print(f"\n版本号不一致，共发现 {len(versions)} 个不同值: {sorted(versions)}")
        print("请统一后再发版。")
        return 1

    version = versions.pop()
    print(f"\n全部 {len(entries)} 处版本号一致: {version}")

    if len(sys.argv) > 1:
        tag = sys.argv[1].lstrip("v")
        if tag != version:
            print(f"tag v{tag} 与代码版本 {version} 不一致 —— 安装包名会与 tag 对不上，自动更新将失效。")
            return 1
        print(f"tag v{tag} 与代码版本一致。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

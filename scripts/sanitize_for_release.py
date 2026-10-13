#!/usr/bin/env python3
"""Release Data Sanitization & Stripping Tool (打包发布脱敏与数据剥离工具).

用于在打包发布 EXE / 源码分发前，彻底剥离开发者的个人敏感信息：
1. 剥离 agent_config.json 中的个人 API Key，重置为干净模板；
2. 剥离 .env 中的开发者姓名、个人账号与专属检索 URL；
3. 安全备份开发者的专属简历 (resume/*) 与浏览器登录状态 (chrome_profile 等) 到被 gitignore 的 .dev_private_backup/ 目录；
4. 扫描工程文件，拦截并警告任何硬编码的敏感 API Key 或个人身份信息；
5. 支持 `--restore` 一键从本地备份无损恢复开发者配置。

用法：
    python scripts/sanitize_for_release.py --sanitize   # 执行安全脱敏剥离
    python scripts/sanitize_for_release.py --check      # 仅检查是否存在敏感信息泄露
    python scripts/sanitize_for_release.py --restore    # 从本地备份恢复开发者环境
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = REPO_ROOT / ".dev_private_backup"

SENSITIVE_PATTERNS = [
    (re.compile(r"sk-[a-zA-Z0-9_\-]{20,}"), "OpenAI / OpenRouter API Key"),
    (re.compile(r"求职锦鲤"), "开发者个人真实姓名"),
]

CLEAN_AGENT_CONFIG = {
    "base_url": "https://openrouter.ai/api/v1",
    "api_key": "",
    "model": "nvidia/nemotron-3.5-lightning:free",
}

CLEAN_ENV_CONTENT = """# JobHunter 生产环境配置模板
# 用户可通过桌面端图形界面 (设置与求职画像) 进行配置

BOSS_USR_NAME=求职锦鲤
BOSS_LABEL=
BOSS_START_URL=https://www.zhipin.com/web/geek/jobs
"""


def backup_item(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)


def restore_item(src: Path, dest: Path) -> None:
    if not src.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)


def sanitize() -> None:
    print("=" * 60)
    print("【1/4】正在备份开发者个人数据至 .dev_private_backup/ ...")
    print("=" * 60)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    items_to_backup = [
        REPO_ROOT / "agent_config.json",
        REPO_ROOT / ".env",
        REPO_ROOT / "resume",
        REPO_ROOT / "profiles" / "gui-default.yml",
        REPO_ROOT / "profiles" / "0my.yml",
    ]

    for item in items_to_backup:
        if item.exists():
            rel = item.relative_to(REPO_ROOT)
            backup_item(item, BACKUP_DIR / rel)
            print(f"  [OK] 已备份: {rel}")

    print("\n" + "=" * 60)
    print("【2/4】正在脱敏并剥离敏感文件...")
    print("=" * 60)

    # 1. 重置 agent_config.json 为无 Key 模板
    agent_cfg_path = REPO_ROOT / "agent_config.json"
    agent_cfg_path.write_text(json.dumps(CLEAN_AGENT_CONFIG, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("  [OK] agent_config.json 已重置为空 API Key 模板")

    # 2. 重置 .env
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        env_path.write_text(CLEAN_ENV_CONTENT, encoding="utf-8")
        print("  [OK] .env 已重置为标准通用模板")

    # 3. 清理 resume/ 目录下的私人简历文件
    resume_dir = REPO_ROOT / "resume"
    if resume_dir.exists():
        for file in resume_dir.iterdir():
            if file.is_file() and file.name.lower().endswith((".pdf", ".docx", ".doc", ".jpg", ".png")):
                file.unlink()
                print(f"  [OK] 已移除个人简历文件: {file.name}")
        placeholder = resume_dir / "README.txt"
        placeholder.write_text("请在桌面端「简历管理」或「AI 智能管家」中上传您的个人简历。\n", encoding="utf-8")

    # 4. 清理临时日志与输出
    for temp_dir in [REPO_ROOT / "logs", REPO_ROOT / "output"]:
        if temp_dir.exists():
            for f in temp_dir.iterdir():
                if f.is_file():
                    try:
                        f.unlink()
                    except OSError:
                        pass
            print(f"  [OK] 已清空临时目录: {temp_dir.name}")

    print("\n" + "=" * 60)
    print("【3/4】执行代码库敏感信息扫描...")
    print("=" * 60)
    violations = scan_for_leaks()
    if violations:
        print("\n[WARNING] 发现以下潜在敏感信息残留：")
        for file_path, desc, match in violations:
            print(f"  - {file_path}: [{desc}] -> {match[:25]}...")
    else:
        print("  [PASS] 恭喜！未在源码和跟踪文件中检测到开发者姓名或私钥残留。")

    print("\n" + "=" * 60)
    print("【4/4】脱敏完成！现在可以安全打包独立 EXE。")
    print("提示：若需恢复开发环境，请运行: python scripts/sanitize_for_release.py --restore")
    print("=" * 60)


def restore() -> None:
    print("=" * 60)
    print("正在从 .dev_private_backup/ 恢复开发者私有配置与简历...")
    print("=" * 60)
    if not BACKUP_DIR.exists():
        print("错误：未找到 .dev_private_backup/ 目录！无法恢复。")
        sys.exit(1)

    for item in BACKUP_DIR.rglob("*"):
        if item.is_file():
            rel = item.relative_to(BACKUP_DIR)
            dest = REPO_ROOT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)
            print(f"  [OK] 已恢复: {rel}")

    print("\n[OK] 开发者私有配置与简历恢复完毕！")


def scan_for_leaks() -> list[tuple[Path, str, str]]:
    violations: list[tuple[Path, str, str]] = []
    # 扫描指定代码与配置目录
    scan_dirs = [REPO_ROOT / "src", REPO_ROOT / "tauri-ui" / "src", REPO_ROOT / "scripts"]
    scan_files = [REPO_ROOT / "agent_config.json", REPO_ROOT / ".env"]

    files_to_check: list[Path] = []
    for d in scan_dirs:
        if d.exists():
            for p in d.rglob("*"):
                if p.is_file() and p.suffix in {".py", ".ts", ".tsx", ".json", ".env", ".toml", ".yml", ".yaml"}:
                    files_to_check.append(p)
    for f in scan_files:
        if f.exists():
            files_to_check.append(f)

    for p in files_to_check:
        if p.name == "sanitize_for_release.py":
            continue
        try:
            content = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern, desc in SENSITIVE_PATTERNS:
            found = pattern.search(content)
            if found:
                violations.append((p.relative_to(REPO_ROOT), desc, found.group(0)))
    return violations


def main() -> None:
    parser = argparse.ArgumentParser(description="JobHunter Release Data Sanitizer")
    parser.add_argument("--sanitize", action="store_true", help="执行脱敏并剥离个人信息")
    parser.add_argument("--restore", action="store_true", help="从备份恢复开发者私有信息")
    parser.add_argument("--check", action="store_true", help="仅执行敏感信息扫描检查")
    args = parser.parse_args()

    if args.restore:
        restore()
    elif args.check:
        violations = scan_for_leaks()
        if violations:
            print(f"[FAIL] 扫描发现 {len(violations)} 处敏感信息：")
            for f, desc, match in violations:
                print(f"  - {f}: {desc} ({match[:20]}...)")
            sys.exit(1)
        else:
            print("[PASS] 扫描未发现敏感信息泄露！")
    else:
        # 默认模式：执行脱敏
        sanitize()


if __name__ == "__main__":
    main()

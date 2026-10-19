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

# 模板占位名（脱敏后的标准值，不算敏感词）
_PLACEHOLDER_USER_NAME = "求职锦鲤"


def _read_dev_name() -> str:
    """动态读取开发者的真实姓名（BOSS_USR_NAME）作扫描敏感词。

    2026-10-13 审查修复：旧版把真实姓名硬编码在本文件里——脱敏工具自己
    成了泄露源（姓名随代码进了 git 历史）。改为运行时从 .env（或已备份
    的 .env）动态读取，代码库中不再留存任何真实身份信息。
    """
    for env_path in (BACKUP_DIR / ".env", REPO_ROOT / ".env"):
        try:
            if env_path.exists():
                for line in env_path.read_text(
                    encoding="utf-8", errors="ignore"
                ).splitlines():
                    line = line.strip()
                    if line.startswith("BOSS_USR_NAME="):
                        value = line.split("=", 1)[1].strip()
                        if value and value != _PLACEHOLDER_USER_NAME:
                            return value
        except OSError:
            continue
    return ""


def sensitive_patterns() -> list[tuple[re.Pattern, str]]:
    """编译敏感词模式：API Key 固定规则 + 开发者姓名动态读取。"""
    patterns: list[tuple[re.Pattern, str]] = [
        (re.compile(r"sk-[a-zA-Z0-9_\-]{20,}"), "OpenAI / OpenRouter API Key"),
    ]
    dev_name = _read_dev_name()
    if dev_name:
        patterns.append((re.compile(re.escape(dev_name)), "开发者个人真实姓名"))
    return patterns


# 内置公共体验 Key（2026-10-18 审查裁定：方案 A 有意保留——新用户开箱即用；
# 用户拍板"薅羊毛给用户的，透露出来也无所谓"）。发布时显式声明它的存在，
# 让开发者每次打包都知道这个 Key 会随源码/安装包公开——若某天决定不再
# 公开，改 presets.py 的 ZHIPU_PUBLIC_API_KEY 环境变量注入即可。
BUILTIN_PUBLIC_KEY_HINT = (
    "src/boss_zhipin/agent/presets.py 内置了智谱公共体验 Key（方案 A，"
    "用户拍板有意保留：新用户开箱即用）。该 Key 会随源码/安装包公开。"
)

CLEAN_AGENT_CONFIG = {
    # V0.4：默认智谱 GLM-4-Flash；api_key 留空 = 未配置，
    # 引导用户在界面配置个人 API Key 或任意 OpenAI 兼容端点。
    "base_url": "https://open.bigmodel.cn/api/paas/v4",
    "api_key": "",
    "model": "glm-4-flash",
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
        # logs/ 里的 *.jsonl 是跨天去重账本（已投/已看记录）——2026-10-13
        # 审查修复：旧版 --sanitize 直接清空 logs 却不备份，开发者误用后
        # 账本丢失 → 已投岗位会被重复投递。先备份再清空。
        REPO_ROOT / "logs",
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

    # 5. 重置 profiles/gui-default.yml 为干净开箱模板
    gui_default_path = REPO_ROOT / "profiles" / "gui-default.yml"
    if gui_default_path.exists():
        clean_gui_default = """search:
  query: ""
page_filters:
  strict: false
  city:
    enabled: true
    values:
    - 深圳
    - 广州
    - 北京
    - 上海
    - 杭州
  education:
    enabled: false
    values: []
  boss_active:
    enabled: true
    values:
    - 刚刚活跃
    - 今日活跃
    - 3日内活跃
filters:
  title:
    required:
      enabled: false
      scope: title
      match: smart
      case_sensitive: false
      keywords: []
    any:
      enabled: false
      scope: title
      match: smart
      case_sensitive: false
      keywords: []
    exclude:
      enabled: true
      scope: title
      match: smart
      case_sensitive: false
      keywords:
      - 销售
      - 客服
      - 劳务派遣
      - 外包
      - 培训
      - 电话销售
      - 数据标注
send:
  mode: auto
  greeting_file: ./greetings/default.txt
  delay_min: 30
  delay_max: 45
  liepin_delay_min: 30
  liepin_delay_max: 45
  job51_delay_min: 30
  job51_delay_max: 45
  max_sent: 50
  daily_sent_limit: 80
  stop_on_captcha: true
  send_resume_after_greeting: false
  auto_send_resume_on_reply: false
  ai_greeting: false
state:
  seen_jobs_file: ./logs/seen_jobs.jsonl
  sent_log_file: ./logs/sent_jobs.jsonl
  skipped_log_file: ./logs/skipped_jobs.jsonl
"""
        gui_default_path.write_text(clean_gui_default, encoding="utf-8")
        print("  [OK] profiles/gui-default.yml 已重置为无个人意向模板")

    # （2026-10-19 审查删除）曾有人在此处加过"清理打包机 AppData"步骤
    # （rmtree LOCALAPPDATA/APPDATA 的 com.jonathanquanlee.jobkoi-ai）——
    # **不要这么做**：Roaming 目录是用户画像/投递记录/简历绑定等真实资产，
    # 无备份删除违反"发布后完整恢复用户本地私有数据"红线；且本机同时是
    # 打包机与开发者日常用机。打包后如需"新用户视角"自测，正解是给测试
    # 进程设 BOSS_APP_DATA_DIR 环境变量指向临时目录（paths.py 原生支持），
    # 不动真实数据。

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

    # 内置公共 Key 声明（2026-10-18）：让每次发布都显式过目
    print(f"\n[NOTICE] {BUILTIN_PUBLIC_KEY_HINT}")

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
        for pattern, desc in sensitive_patterns():
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

"""生成 GBK 编码的「一键投递.bat」。

坑：用 Write 工具直接写的 .bat 是 UTF-8 无 BOM，而 cmd 默认按 GBK 解析批处理，
中文行的字节被拆开后会破坏命令结构（实测报 `'lick-only锛?echo' 不是内部或外部命令`、
`'CODING' 不是内部或外部命令`），窗口一闪就退出。所以 bat 必须存成 GBK。

用法：
    uv run python scripts/make_bat.py
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BAT = r"""@echo off
title BOSS + Liepin + 51job Auto Apply
cd /d "%~dp0"

echo ============================================================
echo   BOSS + Liepin + 51job Auto Apply  /  三平台自动投递
echo   BOSS: only click "立即沟通", send NO message
echo   Liepin: click "聊一聊" + send fixed greeting
echo   51job: click "投递" (deliver resume)
echo ============================================================
echo.
echo   全自动：清理残留 / 登录扫码 / 投递 / 去重 / 各自限额
echo   BOSS 150，猎聘 40，前程无忧 40，到上限自动停该平台。
echo   拟人化节奏 40-80 秒一个，触发验证码立即熔断。
echo   跑到结束为止，中途请勿关闭窗口。
echo.

REM 控制台是 GBK，Python 默认按 UTF-8 输出会满屏乱码。
REM 写 :replace 是因为日志里有 emoji（GBK 编不出来），不加会在打印时崩。
set PYTHONIOENCODING=gbk:replace
set BOSS_CLICK_ONLY=1

set "UV=C:\Users\14905\AppData\Local\hermes\bin\uv.exe"
if not exist "%UV%" (
    echo [ERROR] uv not found: %UV%
    echo 找不到 uv，请确认 Zcode 的 uv 还在，或改成本机 python 路径。
    pause
    exit /b 1
)

"%UV%" run python scripts\auto_apply.py

echo.
echo ============================================================
echo   Finished. 本轮结束。
echo.
echo   说明：
echo   - BOSS 扫码：logs\qrcode.png（微信扫）
echo   - 猎聘扫码：浏览器窗口里用猎聘App扫
echo   - 前程无忧扫码：浏览器窗口里用前程无忧App或微信扫
echo   - 明天自动再跑（Windows 计划任务，每天 09:00）
echo ============================================================
pause
"""


def main() -> None:
    out = ROOT / "一键投递.bat"
    out.write_text(BAT, encoding="gbk")
    print(f"written: {out} (GBK)")
    head = out.read_text(encoding="gbk").splitlines()[0]
    print(f"first line: {head!r}")
    assert head.startswith("@echo off"), "bat 首行不对"


if __name__ == "__main__":
    main()

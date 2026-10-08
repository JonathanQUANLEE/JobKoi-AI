from pathlib import Path

# 根目录的启动脚本
content_root = """@echo off
setlocal
title 求职锦鲤助手 - 桌面端
cd /d "%~dp0Bosszhipin-job-bot"
echo ============================================================
echo   正在启动「求职锦鲤助手」桌面端应用...
echo ============================================================
"%~dp0Bosszhipin-job-bot\\.venv\\Scripts\\python.exe" -m boss_zhipin.tauri
if errorlevel 1 (
    echo.
    echo 启动遇到问题，按任意键退出...
    pause
)
endlocal
"""

# 子目录（Bosszhipin-job-bot）的启动脚本
content_sub = """@echo off
setlocal
title 求职锦鲤助手 - 桌面端
cd /d "%~dp0"
echo ============================================================
echo   正在启动「求职锦鲤助手」桌面端应用...
echo ============================================================
"%~dp0.venv\\Scripts\\python.exe" -m boss_zhipin.tauri
if errorlevel 1 (
    echo.
    echo 启动遇到问题，按任意键退出...
    pause
)
endlocal
"""

# 写入 GBK 编码（Windows 简体中文原生代码页 CP936，绝对不乱码，不丢字节）
Path(r"b:\antigtavity projects\bosszhitou\启动桌面应用.bat").write_text(content_root, encoding="gbk")
Path(r"b:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\启动桌面应用.bat").write_text(content_sub, encoding="gbk")

print("Fixed batch files written successfully in GBK!")

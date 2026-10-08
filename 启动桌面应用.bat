@echo off
setlocal
title 求职锦鲤助手 - 桌面端
cd /d "%~dp0"
echo ============================================================
echo   正在启动「求职锦鲤助手」桌面端应用...
echo ============================================================
"%~dp0.venv\Scripts\python.exe" -m boss_zhipin.tauri
if errorlevel 1 (
    echo.
    echo 启动遇到问题，按任意键退出...
    pause
)
endlocal

@echo off
chcp 65001 >nul
title 晶創計畫辦公室 - 智慧會議管理與費用核銷系統
echo ========================================================
echo   正在啟動「智慧會議管理與費用核銷系統」...
echo   全程免費開源 ｜ 本地 SQLite 資料庫 ｜ 免外部依賴
echo ========================================================
echo.

:: 關閉可能佔用 5000 端口的舊進程，確保載入最新程式碼
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

cd /d "%~dp0\server"
start "" http://localhost:5000
node index.js
pause

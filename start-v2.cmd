@echo off
setlocal
cd /d "%~dp0"

echo [v2] Restarting service...
taskkill /F /IM node.exe >nul 2>nul

echo [v2] Starting service window...
start "v2-service" cmd /k "cd /d %cd% && \"C:\Program Files\nodejs\node.exe\" server-v2.js"

echo [v2] Open after 2-3 seconds:
echo http://127.0.0.1:3002/v2.html
echo.
echo [v2] Keep the opened service window running.
echo.

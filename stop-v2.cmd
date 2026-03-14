@echo off
setlocal
echo [v2] Stopping all node.exe processes...
taskkill /F /IM node.exe >nul 2>nul
echo [v2] Done.

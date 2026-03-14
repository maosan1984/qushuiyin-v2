@echo off
setlocal
cd /d "%~dp0"

taskkill /F /IM node.exe >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'server-v2.js' -WorkingDirectory '%cd%'; Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3002/v2.html'"

echo [v2] Service started and browser opened.
echo [v2] If the page is blank, wait 2 seconds and refresh once.

@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found in PATH
  pause
  exit /b 1
)
node merge.mjs
echo.
echo Output: dist\merged_gkd.json5
pause

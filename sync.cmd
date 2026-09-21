@echo off
rem One-click sync: commit all changes and force-push to GitHub
rem (force push keeps local files as the single source of truth)
cd /d %~dp0
git add -A
git commit -m "sync: %date% %time%" -q
git push -f origin main
if errorlevel 1 (
  echo.
  echo [ERROR] push failed - check remote URL or login
  pause
  exit /b 1
)
echo.
echo Synced to GitHub OK.
pause

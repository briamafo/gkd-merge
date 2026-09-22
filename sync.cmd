@echo off
rem One-click sync: commit local changes and force-push to GitHub
rem Local files are the single source of truth (remote history diverged from API uploads)
cd /d %~dp0
set "GITDIR=C:\Users\JH010\.workbuddy\binaries\PortableGit\versions\1.2.0\mingw64\bin"
set "GIT_EXEC_PATH=%GITDIR%"
set "PATH=%GITDIR%;%PATH%"

"%GITDIR%\git.exe" add -A
"%GITDIR%\git.exe" commit -m "sync: %date% %time%"
if errorlevel 1 echo [INFO] nothing to commit (or commit skipped)
"%GITDIR%\git.exe" push -f origin main
if errorlevel 1 (
  echo.
  echo [ERROR] push failed - check proxy / browser authorization
  pause
  exit /b 1
)
echo.
echo Synced to GitHub OK.
pause

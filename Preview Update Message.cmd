@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js could not be found. Install Node.js 22 or later, then try again.
  pause
  exit /b 1
)
node "%~dp0tools\preview-update-message.cjs" %*
if errorlevel 1 (
  echo.
  echo The update-message preview could not open. The error is shown above.
  pause
  exit /b 1
)

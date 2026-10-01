@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS must be installed first: https://nodejs.org/
  pause
  exit /b 1
)
set HOST=0.0.0.0
set PORT=8080
set PUBLIC_ORIGIN=https://psinserver-jpg.github.io
echo Starting shop map server. Keep this window open.
echo Check on this computer: http://localhost:8080/api/health
node tools/server.mjs
pause

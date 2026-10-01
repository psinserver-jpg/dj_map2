@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS must be installed first: https://nodejs.org/
  pause
  exit /b 1
)
node tools/public-link.mjs
pause

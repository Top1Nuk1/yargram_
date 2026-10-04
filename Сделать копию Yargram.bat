@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Yargram - backup

rem ASCII-only on purpose: the codepage inside a .bat is a minefield,
rem all Russian text lives in the Node script (UTF-8) instead.

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found. Reinstall Yargram.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo [ERROR] .env not found. Put this file next to .env in the Yargram folder.
  echo.
  pause
  exit /b 1
)

node "scripts\backup.mjs" --force
set "code=%errorlevel%"

echo.
pause
exit /b %code%

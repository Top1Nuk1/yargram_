@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Yargram - pismo s kodom

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

if not exist "apps\server\dist\services\mail-service.js" (
  echo.
  echo [ERROR] Server is not built yet: apps\server\dist is missing.
  echo Run "npm run build" once, then try again.
  echo.
  pause
  exit /b 1
)

node "scripts\send-code-mail.mjs" %*
set "code=%errorlevel%"

echo.
pause
exit /b %code%

@echo off
chcp 65001 >nul
title YarGram Backup

cd /d "%~dp0"

set "PY_EXE="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY_EXE=%LOCALAPPDATA%\Python\bin\python.exe"
if not defined PY_EXE set "PY_EXE=python"

"%PY_EXE%" "scripts\backup_from_server.py"

echo.
pause

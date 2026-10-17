@echo off
chcp 65001 >nul
title Резервное копирование YarGram с сервера

echo ============================================================
echo   📦 YarGram — Резервное копирование сервера на ПК
echo ============================================================
echo.

cd /d "%~dp0"
python "scripts\backup_from_server.py"

echo.
echo Нажмите любую клавишу для выхода...
pause >nul

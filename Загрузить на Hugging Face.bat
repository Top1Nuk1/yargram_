@echo off
chcp 65001 >nul
title YarGram - Публикация на Hugging Face Spaces
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-huggingface.ps1"

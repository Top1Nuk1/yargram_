@echo off
setlocal EnableExtensions
cd /d "%~dp0"
node scripts\setup-cloudflare.mjs %*
pause

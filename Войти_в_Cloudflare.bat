@echo off
title Cloudflare login - Yargram
cd /d "%~dp0"
echo.
echo  Browser will open now.
echo  1. Sign in with your Google account
echo  2. Click "Allow" to authorize Wrangler
echo  3. When you see "Success" - return to this window
echo.
call npx wrangler login
echo.
echo  ======================================================
echo  Applying optimal settings for yargram.site...
echo  ======================================================
node scripts\setup-cloudflare.mjs
echo.
echo  All done! You can close this window.
pause

@echo off
title CAPITALISM.io — Share Link
cls
echo.
echo  ==========================================
echo    CAPITALISM.io  —  Share With Friends
echo  ==========================================
echo.
echo  Make sure start.bat is already running!
echo.
echo  Creating public link via Cloudflare...
echo  Your link will appear below (https://....trycloudflare.com)
echo  Share it with friends. Press Ctrl+C to stop sharing.
echo.
cloudflared.exe tunnel --url http://localhost:3737 2>&1
pause

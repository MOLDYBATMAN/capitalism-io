@echo off
title CAPITALISM.io — Server
cls
echo.
echo  ==========================================
echo    CAPITALISM.io  —  Local Server
echo  ==========================================
echo.
echo  Starting server at http://localhost:3737
echo  Press Ctrl+C to stop.
echo.
start "" "http://localhost:3737"
node server\index.js
pause

@echo off
title Push to GitHub
cls
echo.
echo  ==========================================
echo    CAPITALISM.io — Push to GitHub
echo  ==========================================
echo.
echo  Step 1: Log in to GitHub (browser will open)
echo  Press Enter to continue...
pause > nul

gh auth login --web --git-protocol https

echo.
echo  Step 2: Creating GitHub repo and pushing code...
echo.

gh repo create capitalism-io --public --push --source=. --remote=origin

echo.
echo  ==========================================
echo  Done! Your code is now on GitHub.
echo.
echo  Next step: go to render.com to deploy.
echo  ==========================================
echo.
pause

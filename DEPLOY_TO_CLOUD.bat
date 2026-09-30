@echo off
title FixMyKicks Delhi - 1-Click Cloud Server Deployment
color 0A
cd /d "%~dp0"

echo ==============================================================
echo   FIX MY KICKS DELHI - FULL CLOUD SERVER DEPLOYMENT HELPER
echo ==============================================================
echo.

git add .
git commit -m "Update FixMyKicks Storefront & Inventory" >nul 2>&1
git branch -M main

git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo Step 1: Create a new empty repository on GitHub:
    echo         https://github.com/new  ^(Name it: fixmykicks^)
    echo.
    start https://github.com/new
    set /p REPO_URL="Step 2: Paste your GitHub Repository URL here (e.g. https://github.com/username/fixmykicks.git): "
    git remote add origin %REPO_URL%
)

echo.
echo Pushing FixMyKicks code to GitHub...
git push -u origin main

echo.
echo ==============================================================
echo   CODE PUSHED TO GITHUB! OPENING RENDER CLOUD DEPLOYMENT...
echo ==============================================================
echo 1. On Render.com, select your "fixmykicks" GitHub repository.
echo 2. Click "Connect" and then "Create Web Service".
echo 3. Your live website URL will be ready in ~1 minute!
echo.
start https://dashboard.render.com/select-repo?type=web
pause

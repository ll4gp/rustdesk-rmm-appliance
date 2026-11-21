@echo off
title RustDesk RMM Appliance - 1-Click Updater
cd /d "%~dp0"

echo ====================================================================
echo   RustDesk RMM ^& Telemetry Appliance - 1-Click Update
echo   Pulling latest release from GitHub (preserving site data ^& keys)
echo ====================================================================
echo.

git pull origin main
if %errorLevel% neq 0 (
    echo [ERROR] Could not pull latest updates from GitHub.
    pause
    exit /b 1
)

echo.
echo [+] Rebuilding and restarting Appliance container (zero data loss)...
docker ps --format "{{.Names}}" | findstr /i "rustdesk-site-hbbs" >nul 2>&1
if %errorLevel% equ 0 (
    docker compose -f docker-compose.fullstack.yml up -d --build
) else (
    docker compose up -d --build
)

echo.
echo [SUCCESS] Appliance updated to the latest version!
echo All devices, scripts, settings, and keys in ./data/ were preserved.
echo.
pause

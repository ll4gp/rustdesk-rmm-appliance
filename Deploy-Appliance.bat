@echo off
title RustDesk RMM Plug-In Appliance - Turnkey Setup
cd /d "%~dp0"

echo ====================================================================
echo   RustDesk RMM ^& Telemetry Appliance - Turnkey Installer
echo   Plugs into ANY existing RustDesk Server (or deploys a new one)
echo ====================================================================
echo.

REM 1. Verify Docker is running
docker info >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Docker Desktop is not running or not installed.
    echo Please start Docker Desktop on this host machine and run again.
    pause
    exit /b 1
)

REM 2. Auto-detect Host LAN IP, Tailscale IP, and any local id_ed25519.pub file
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback|WSL|Docker' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '100.*' }; ($ips | Select-Object -First 1).IPAddress"`) do set DETECTED_LAN_IP=%%i
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$ts = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Tailscale' -or $_.IPAddress -like '100.*' }; ($ts | Select-Object -First 1).IPAddress"`) do set DETECTED_TS_IP=%%i
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "$paths = @('C:\Program Files\RustDeskServer\bin\id_ed25519.pub','C:\Program Files\RustDeskServer\id_ed25519.pub','.\data\rustdesk\id_ed25519.pub'); foreach ($p in $paths) { if (Test-Path $p) { (Get-Content $p -Raw).Trim(); break } }"`) do set DETECTED_KEY=%%i

if "%DETECTED_LAN_IP%"=="" set DETECTED_LAN_IP=127.0.0.1

echo Choose Deployment Mode:
echo   [1] Plug Into an Existing RustDesk Server (Default - Only runs RMM Appliance on port 3031)
echo   [2] All-in-One Full Stack (Deploys new RustDesk hbbs/hbbr Server + RMM Appliance)
set /p DEPLOY_MODE="Select [1 or 2, default: 1]: "
if "%DEPLOY_MODE%"=="" set DEPLOY_MODE=1

set /p SITE_NAME="Enter Organization / Client Name [default: RustDesk RMM Appliance]: "
if "%SITE_NAME%"=="" set SITE_NAME=RustDesk RMM Appliance

set /p APPLIANCE_IP="Enter This Appliance Host IP/Domain [default: %DETECTED_LAN_IP%]: "
if "%APPLIANCE_IP%"=="" set APPLIANCE_IP=%DETECTED_LAN_IP%

set /p RD_SERVER="Enter Existing RustDesk Server (hbbs) IP/Domain [default: %APPLIANCE_IP%]: "
if "%RD_SERVER%"=="" set RD_SERVER=%APPLIANCE_IP%

set /p RD_KEY="Enter RustDesk Public Key (id_ed25519.pub) [Leave blank to upload in Web UI, detected: %DETECTED_KEY%]: "
if "%RD_KEY%"=="" set RD_KEY=%DETECTED_KEY%

set /p SECONDARY_IP="Optional Secondary / VPN / Tailscale IP [default: %DETECTED_TS_IP%]: "
if "%SECONDARY_IP%"=="" set SECONDARY_IP=%DETECTED_TS_IP%

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"`) do set JWT_SEC=%%i

(
echo SITE_NAME=%SITE_NAME%
echo DASHBOARD_PORT=3031
echo APPLIANCE_HOST=%APPLIANCE_IP%
echo RUSTDESK_SERVER=%RD_SERVER%
echo RUSTDESK_RELAY_SERVER=%RD_SERVER%
echo RUSTDESK_KEY=%RD_KEY%
echo APPLIANCE_SECONDARY_HOST=%SECONDARY_IP%
echo ADMIN_INITIAL_PASSWORD=admin123
echo JWT_SECRET=%JWT_SEC%
) > .env

if not exist "data\rustdesk" mkdir "data\rustdesk"
if not exist "data\dashboard" mkdir "data\dashboard"

REM Open Windows Firewall port 3031 if running as Admin
net session >nul 2>&1
if %errorLevel% equ 0 (
    netsh advfirewall firewall delete rule name="RustDesk RMM Appliance Port 3031" >nul 2>&1
    netsh advfirewall firewall add rule name="RustDesk RMM Appliance Port 3031" dir=in action=allow protocol=TCP localport=3031 profile=Domain,Private,Public >nul 2>&1
    echo [+] Opened TCP port 3031 in Windows Firewall across Domain, Private, Public profiles.
)

echo.
if "%DEPLOY_MODE%"=="2" (
    echo [1/2] Starting All-in-One Full Stack (hbbs + hbbr + RMM Appliance)...
    docker compose -f docker-compose.fullstack.yml up -d --build
    timeout /t 5 /nobreak >nul
    docker restart rustdesk-rmm-appliance >nul 2>&1
) else (
    echo [1/1] Starting Plug-In RMM Appliance (connected to RustDesk server %RD_SERVER%)...
    docker compose up -d --build
)

echo.
echo ====================================================================
echo   RUSTDESK RMM APPLIANCE IS LIVE!
echo ====================================================================
echo   Appliance Web UI: http://%APPLIANCE_IP%:3031
echo   Admin Login:      admin / admin123
echo   Setup / Key Load: http://%APPLIANCE_IP%:3031/admin/settings
echo.
echo   --- 1-CLICK CLIENT WORKSTATION INSTALLERS ---
echo   Windows (.bat):   http://%APPLIANCE_IP%:3031/api/agent/installer.bat
echo   Windows 1-Liner:  irm http://%APPLIANCE_IP%:3031/api/agent/onboard.ps1 ^| iex
echo   Linux + Wayland:  curl -fsSL http://%APPLIANCE_IP%:3031/api/agent/installer.sh ^| sudo bash
echo ====================================================================
echo.
pause

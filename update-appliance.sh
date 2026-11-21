#!/usr/bin/env bash
# ==============================================================================
# RustDesk RMM Appliance - 1-Click Linux Updater
# Pulls latest updates from GitHub and rebuilds container while preserving data
# ==============================================================================
set -e

cd "$(dirname "$0")"

if [ "$EUID" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

echo "===================================================================="
echo "  RustDesk RMM & Telemetry Appliance - 1-Click Update"
echo "  Pulling latest release from GitHub (preserving site data & keys)"
echo "===================================================================="

git pull origin main

echo "[+] Rebuilding and restarting Appliance container (zero data loss)..."
if docker ps --format '{{.Names}}' | grep -q '^rustdesk-site-hbbs$'; then
    docker compose -f docker-compose.fullstack.yml up -d --build
else
    docker compose up -d --build
fi

echo ""
echo "[SUCCESS] Appliance updated to the latest version!"
echo "All devices, scripts, settings, and keys in ./data/ were preserved."

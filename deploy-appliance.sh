#!/usr/bin/env bash
# ==============================================================================
# RustDesk RMM Plug-In Appliance - 1-Click Linux Turnkey Installer
# Plugs into ANY existing RustDesk Server (or deploys a full stack)
# ==============================================================================
set -e

cd "$(dirname "$0")"

if [ "$EUID" -ne 0 ]; then
    echo "Requesting sudo privileges for Appliance Deployment..."
    exec sudo bash "$0" "$@"
fi

echo "===================================================================="
echo "  RustDesk RMM & Telemetry Appliance - Turnkey Linux Installer"
echo "  Plugs into ANY existing RustDesk Server (or deploys a new one)"
echo "===================================================================="

# 1. Install Docker & Docker Compose plugin if not already installed
if ! command -v docker >/dev/null 2>&1; then
    echo "[+] Docker not found. Installing Docker Engine automatically..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
fi

# 2. Auto-detect Host LAN IP, Tailscale IP, and any local id_ed25519.pub key
DETECTED_LAN_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1)
if [ -z "$DETECTED_LAN_IP" ]; then
    DETECTED_LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
DETECTED_TS_IP=$(ip -4 addr show tailscale0 2>/dev/null | awk '/inet / {split($2,a,"/"); print a[1]}' | head -n1 || true)

DETECTED_KEY=""
for kp in /var/lib/rustdesk-server/id_ed25519.pub /opt/rustdesk/id_ed25519.pub ./data/rustdesk/id_ed25519.pub; do
    if [ -f "$kp" ]; then
        DETECTED_KEY=$(tr -d '\r\n ' < "$kp")
        break
    fi
done

SITE_NAME="${1:-RustDesk RMM Appliance}"
APPLIANCE_IP="${2:-$DETECTED_LAN_IP}"
RD_SERVER="${3:-$APPLIANCE_IP}"
RD_KEY="${4:-$DETECTED_KEY}"
DEPLOY_MODE="${5:-plugin}"
JWT_SEC=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)

cat <<EOF > .env
SITE_NAME=${SITE_NAME}
DASHBOARD_PORT=3031
APPLIANCE_HOST=${APPLIANCE_IP}
RUSTDESK_SERVER=${RD_SERVER}
RUSTDESK_RELAY_SERVER=${RD_SERVER}
RUSTDESK_KEY=${RD_KEY}
APPLIANCE_SECONDARY_HOST=${DETECTED_TS_IP}
ADMIN_INITIAL_PASSWORD=admin123
JWT_SECRET=${JWT_SEC}
EOF

mkdir -p ./data/rustdesk ./data/dashboard

# Open firewall port 3031 if ufw or firewalld is active
if command -v ufw >/dev/null 2>&1; then
    ufw allow 3031/tcp >/dev/null 2>&1 || true
fi
if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=3031/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

if [ "$DEPLOY_MODE" = "fullstack" ]; then
    echo "[+] Deploying All-in-One Full Stack (hbbs + hbbr + RMM Appliance)..."
    docker compose -f docker-compose.fullstack.yml up -d --build
    sleep 5
    docker restart rustdesk-rmm-appliance >/dev/null 2>&1 || true
else
    echo "[+] Deploying Plug-In RMM Appliance on port 3031..."
    docker compose up -d --build
fi

echo ""
echo "===================================================================="
echo "  RUSTDESK RMM APPLIANCE IS LIVE!"
echo "===================================================================="
echo "  Appliance Web UI: http://${APPLIANCE_IP}:3031"
echo "  Admin Login:      admin / admin123"
echo "  Load Server Key:  http://${APPLIANCE_IP}:3031/admin/settings"
echo ""
echo "  --- 1-CLICK CLIENT WORKSTATION INSTALLERS ---"
echo "  Windows (.bat):   http://${APPLIANCE_IP}:3031/api/agent/installer.bat"
echo "  Windows 1-Liner:  irm http://${APPLIANCE_IP}:3031/api/agent/onboard.ps1 | iex"
echo "  Linux + Wayland:  curl -fsSL http://${APPLIANCE_IP}:3031/api/agent/installer.sh | sudo bash"
echo "===================================================================="

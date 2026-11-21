# RustDesk RMM & Telemetry Plug-In Appliance (Commercial Edition)

A turnkey, self-hosted **RMM, Live Telemetry & Unattended Onboarding Appliance** that plugs directly into **any existing RustDesk Server installation** (or deploys a brand-new full stack).

---

## How It Works for Clients

1. **Deploy the Appliance Container (Port `3031`)**:
   - **Plug-In Mode (Default — `docker-compose.yml`)**: Deploys only the RMM Appliance container on port `3031`. It does **not** touch or conflict with ports `21115–21119`, so it can run alongside an existing RustDesk Server on the same machine or connect to a remote/cloud RustDesk Server anywhere.
   - **All-in-One Mode (`docker-compose.fullstack.yml`)**: For clients who don't have a RustDesk Server yet—spins up `hbbs` + `hbbr` + the RMM Appliance together and auto-loads the generated key.
2. **Load Your Own RustDesk Server Key (`id_ed25519.pub`) in the Web UI**:
   - Log in at `http://<APPLIANCE_IP>:3031` (`admin` / `admin123`).
   - Click **"Load Server Key & Configure"** (or go to **Appliance Setup** in the sidebar).
   - Enter your existing **RustDesk ID Server (`hbbs`) IP or Domain** and click **"Test Connection to RustDesk Server"** to verify live TCP reachability on ports `21116` and `21117`.
   - Click **"Upload `id_ed25519.pub` File"** (or paste your 44-character public key) and click **"Save & Activate Appliance"**.
3. **1-Click Cross-OS Client Rollout**:
   - The appliance dynamically compiles your server address, your `id_ed25519.pub` key, unattended access policies, and the 5-second fast-polling RMM heartbeat agent into ready-to-run installers:
     - **Windows 1-Click Installer (`Connect-Station.bat`)** & 1-line PowerShell command (`irm http://<APPLIANCE_IP>:3031/api/agent/onboard.ps1 | iex`)
     - **Linux + Unattended Wayland 1-Click Installer (`Connect-Station.sh`)** & 1-line Bash command (`curl -fsSL http://<APPLIANCE_IP>:3031/api/agent/installer.sh | sudo bash`)

---

## Quick Start Installation

### On Windows (Windows Server / Windows 10/11 Pro with Docker Desktop)
1. Extract `RustDesk-Site-Appliance.zip`.
2. Right-click **`Deploy-Appliance.bat`** and select **Run as administrator**.
3. Choose Mode `[1]` (Plug Into Existing RustDesk Server) or Mode `[2]` (All-in-One Full Stack).

### On Linux (Ubuntu, Debian, RHEL, Rocky, Proxmox VM, Mini-PC)
1. Extract `RustDesk-Site-Appliance.zip` and run:
   ```bash
   chmod +x deploy-appliance.sh
   sudo ./deploy-appliance.sh "Company Name"
   ```
   *(To deploy the All-in-One Full Stack with bundled `hbbs` + `hbbr`, pass `fullstack` as the 5th argument or run `docker compose -f docker-compose.fullstack.yml up -d --build`.)*

# RustDesk RMM & Telemetry Plug-In Appliance

A turnkey, self-hosted **RMM, Live Telemetry & Unattended Onboarding Appliance** that plugs directly into **any existing RustDesk Server installation** (or deploys a brand-new full stack).

---

## Key Features

- **Plugs Into Any Existing RustDesk Server (`hbbs` / `hbbr`)**:
  - **Plug-In Mode (Default — `docker-compose.yml`)**: Deploys only the RMM Appliance container on port `3031`. It does **not** touch or conflict with ports `21115–21119`, so it can run alongside an existing RustDesk Server on the same host or connect to a remote/cloud RustDesk Server anywhere.
  - **All-in-One Mode (`docker-compose.fullstack.yml`)**: For environments that don't have a RustDesk Server yet—spins up `hbbs` + `hbbr` + the RMM Appliance together and auto-loads the generated key.
- **Bring Your Own Server Key (`id_ed25519.pub`) via Web UI**:
  - Upload your `id_ed25519.pub` key file directly in the browser (or paste the 44-character Ed25519 key string).
  - Built-in **Live TCP Connection Tester** verifies reachability and latency to your `hbbs` (`:21116`) and `hbbr` (`:21117`) servers.
- **Dynamic 1-Click Cross-OS Endpoint Rollout**:
  - Dynamically generates pre-configured endpoint installers with your RustDesk Server address, your `id_ed25519.pub` key, unattended access policies, and a 5-second fast-polling RMM heartbeat agent:
    - **Windows 1-Click Installer (`Connect-Station.bat`)** & 1-line PowerShell enrollment (`/api/agent/onboard.ps1`)
    - **Linux + Unattended Wayland/Xorg 1-Click Installer (`Connect-Station.sh`)** (`/api/agent/installer.sh`) — automatically disables GDM Wayland interactive screen-share popups (`WaylandEnable=false`), adds Polkit authorization rules, and installs the systemd RMM agent.
- **5-Second Fast-Polling RMM & Cross-OS Script Execution**:
  - Deploy PowerShell or Bash scripts to individual machines or device groups and watch live console output within 5 seconds.
  - Live CPU, RAM, Disk sparklines and installed software inventory.

---

## Quick Start Installation

### Option 1: Linux Host (Ubuntu, Debian, RHEL, Rocky, Proxmox VM, Mini-PC)
```bash
git clone https://github.com/ll4gp/rustdesk-rmm-appliance.git
cd rustdesk-rmm-appliance
chmod +x deploy-appliance.sh
sudo ./deploy-appliance.sh "Your Organization Name"
```
*(If Docker is not installed on the Linux host yet, `deploy-appliance.sh` installs Docker Engine automatically. To deploy the All-in-One Full Stack with bundled `hbbs` + `hbbr`, run `docker compose -f docker-compose.fullstack.yml up -d --build`.)*

### Option 2: Windows Host (Windows Server / Windows 10/11 Pro with Docker Desktop)
```powershell
git clone https://github.com/ll4gp/rustdesk-rmm-appliance.git
cd rustdesk-rmm-appliance
.\Deploy-Appliance.bat
```
Choose Mode `[1]` (**Plug Into an Existing RustDesk Server**) or Mode `[2]` (**All-in-One Full Stack**).

---

## First-Time Web UI Setup (1 Minute)

1. Open **`http://<APPLIANCE_IP>:3031`** in your browser.
   - **Default Admin Login**: `admin` / `admin123`
2. Click **"Load Server Key & Configure"** on the welcome banner (or navigate to **Appliance Setup** in the sidebar).
3. Enter your **RustDesk ID Server (`hbbs`) IP or Domain** and click **"Test Connection to RustDesk Server"**.
4. Click **"Upload `id_ed25519.pub` File"** (or paste your public key) and click **"Save & Activate Appliance"**.
5. Enroll your Windows and Linux workstations using the **1-Click Installers** or **1-Line Terminal Commands** displayed on the right panel:
   - **Windows (PowerShell as Admin)**:
     ```powershell
     irm http://<APPLIANCE_IP>:3031/api/agent/onboard.ps1 | iex
     ```
   - **Linux + Unattended Wayland (Bash)**:
     ```bash
     curl -fsSL http://<APPLIANCE_IP>:3031/api/agent/installer.sh | sudo bash
     ```

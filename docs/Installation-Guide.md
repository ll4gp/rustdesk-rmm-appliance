# Installation & Deployment Guide

The **RustDesk RMM Plug-In Appliance** supports two deployment modes so it can fit into brownfield sites (with an existing RustDesk Server) or greenfield sites (needing a complete stack).

---

## Mode 1: Plug-In Mode (Default — `docker-compose.yml`)

Use this mode if you **already have a RustDesk Server (`hbbs` / `hbbr`)** running—either on the same machine, another local server, or a cloud VPS.

- **Ports Exposed**: Only `3031/tcp` (Web UI, WebSocket & RMM Agent Heartbeat API).
- **Zero Port Conflicts**: Does not bind to `21115–21119`, so it can safely run on the exact same machine as an existing Windows or Linux RustDesk server.

### Deploy on Linux
```bash
git clone https://github.com/ll4gp/rustdesk-rmm-appliance.git
cd rustdesk-rmm-appliance
chmod +x deploy-appliance.sh
sudo ./deploy-appliance.sh "Company Name"
```

### Deploy on Windows
```powershell
git clone https://github.com/ll4gp/rustdesk-rmm-appliance.git
cd rustdesk-rmm-appliance
.\Deploy-Appliance.bat
```
Select **`[1] Plug Into an Existing RustDesk Server`** when prompted.

---

## Mode 2: All-in-One Full Stack (`docker-compose.fullstack.yml`)

Use this mode when deploying at a **brand-new client site** that does not have a RustDesk server yet. It spins up:
1. `rustdesk-site-hbbs` (RustDesk ID/Rendezvous Server on `21115`, `21116/tcp`, `21116/udp`, `21118`)
2. `rustdesk-site-hbbr` (RustDesk Relay Server on `21117`, `21119`)
3. `rustdesk-rmm-appliance` (RMM Web Dashboard on `3031`)

Furthermore, the appliance mounts the shared `./data/rustdesk` volume and **automatically reads the generated `id_ed25519.pub` key** on first boot.

### Deploy Full Stack on Linux
```bash
sudo ./deploy-appliance.sh "Client Site Name" "" "" "" fullstack
```
*(Or run `docker compose -f docker-compose.fullstack.yml up -d --build`.)*

### Deploy Full Stack on Windows
Run `.\Deploy-Appliance.bat` and select **`[2] All-in-One Full Stack`**.

---

## Required Firewall Ports

| Port | Protocol | Service | Needed In |
| :--- | :--- | :--- | :--- |
| **`3031`** | TCP | RMM Web UI, WebSocket & Agent Heartbeat API | Both Modes *(Auto-opened by installer)* |
| **`21115`** | TCP | RustDesk NAT Type Test (`hbbs`) | Full-Stack Mode (or on your existing RustDesk server) |
| **`21116`** | TCP & UDP | RustDesk ID Registration & Heartbeat (`hbbs`) | Full-Stack Mode (or on your existing RustDesk server) |
| **`21117`** | TCP | RustDesk Relay Traffic (`hbbr`) | Full-Stack Mode (or on your existing RustDesk server) |

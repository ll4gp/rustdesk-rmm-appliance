# RustDesk RMM & Telemetry Plug-In Appliance — Wiki Home

Welcome to the official documentation for the **RustDesk RMM & Telemetry Plug-In Appliance**.

## Quick Navigation

1. **[Installation & Deployment Guide](./Installation-Guide.md)**
   - Plug-In Mode (`docker-compose.yml`) vs. All-in-One Full Stack (`docker-compose.fullstack.yml`)
   - Windows Server / Docker Desktop & Linux (Ubuntu/Debian/RHEL/Proxmox) deployment
   - Firewall Ports & Reverse Proxy (HTTPS) Setup
2. **[Connecting Your Existing RustDesk Server](./Connecting-Existing-RustDesk.md)**
   - Where to find your `id_ed25519.pub` key on Linux, Windows, Synology, or Docker
   - Uploading or pasting your key in the Web UI
   - Testing TCP connectivity (`21115`, `21116`, `21117`) & configuring VPN/Tailscale failover IPs
3. **[Station Onboarding: Windows & Linux (Wayland Unattended)](./Station-Onboarding-Windows-Linux.md)**
   - How `Connect-Station.bat` and `onboard.ps1` work on Windows
   - How `Connect-Station.sh` solves Linux Wayland interactive screen-share popups (`WaylandEnable=false` + Polkit rules)
   - Setting a site-wide default unattended password
4. **[RMM Scripts, Cross-OS Translation & Live Telemetry](./RMM-Scripts-and-Telemetry.md)**
   - 5-second fast-polling script execution engine
   - Automatic Cross-OS PowerShell-to-Bash script translation
   - Live CPU, RAM, Disk sparklines and installed software inventory
5. **[1-Click Updates, Backups & Multi-Site MSP Rollouts](./Updating-and-Backup.md)**
   - Using `Update-Appliance.bat` and `update-appliance.sh`
   - Backing up `./data/dashboard/database.sqlite`

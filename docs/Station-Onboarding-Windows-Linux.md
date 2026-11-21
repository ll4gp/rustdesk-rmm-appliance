# Station Onboarding: Windows & Linux (Unattended Wayland/Xorg)

Once your RustDesk Server address and `id_ed25519.pub` key are saved in **Appliance Setup**, the appliance dynamically compiles turnkey onboarding scripts for Windows and Linux workstations.

---

## 1. Windows Workstation Onboarding

You can onboard Windows 10, Windows 11, and Windows Server machines either by downloading `Connect-Station.bat` from the **Devices** or **Appliance Setup** page, or by running a single PowerShell command as Administrator:

```powershell
irm http://<APPLIANCE_IP>:3031/api/agent/onboard.ps1 | iex
```

### What the Windows Installer Configures
1. **Installs the 5-Second Fast-Polling RMM Agent** to `C:\ProgramData\RustDeskDashboard\sync-inventory.ps1`.
2. **Writes `RustDesk2.toml`** (for both User and `LocalService`/`SystemProfile` service accounts) with:
   - Your `custom-rendezvous-server` (`hbbs`), `relay-server` (`hbbr`), and `key` (`id_ed25519.pub`)
   - Unattended access settings: `approve-mode = 'password'`, `verification-method = 'use-both-passwords'`, `access-mode = 'full'`
   - Applies your optional site-wide default unattended password if configured in **Appliance Setup**.
3. **Registers a `NT AUTHORITY\SYSTEM` Scheduled Task (`RustDeskDashboardHeartbeat`)** so the station reports telemetry and executes deployed RMM scripts with full administrative privileges even before a user logs in.

---

## 2. Linux Workstation Onboarding (+ Unattended Wayland Bypass)

On modern Linux distributions (Ubuntu 22.04/24.04, Debian 12, Fedora, RHEL/Rocky) running **Wayland**, `xdg-desktop-portal` normally blocks unattended remote desktop tools by forcing a physical user at the screen to click *"Allow Screen Share"* on every connection.

Our Linux 1-Click Installer (`Connect-Station.sh`) eliminates that barrier automatically.

### Run the 1-Line Installer on Any Linux Machine
```bash
curl -fsSL http://<APPLIANCE_IP>:3031/api/agent/installer.sh | sudo bash
```
To also set a specific permanent unattended password on that Linux machine during install:
```bash
curl -fsSL http://<APPLIANCE_IP>:3031/api/agent/installer.sh | sudo bash -s -- "YourStrongPassword"
```

### What the Linux Installer Configures
1. **GDM / GDM3 Unattended Display Configuration**:
   - Updates `/etc/gdm3/custom.conf`, `/etc/gdm/custom.conf`, and `/etc/gdm3/daemon.conf` to set `WaylandEnable=false` so the display manager boots into unattended-compatible Xorg sessions without screen-share confirmation popups.
2. **Polkit Unattended Screen-Cast Rule**:
   - Installs `/etc/polkit-1/rules.d/49-rustdesk-unattended.rules` to automatically grant permission to `org.freedesktop.portal`, `org.gnome.remotedesktop`, and `com.rustdesk`.
3. **RustDesk Server, Key & Headless Config**:
   - Writes `RustDesk2.toml` for `root` and all `/home/*` users with your server IP, public key, `approve-mode = 'password'`, `allow-linux-headless = 'Y'`, and `enable-wayland = 'Y'`.
4. **Systemd RMM & Telemetry Daemon (`rustdesk-dashboard-agent.service`)**:
   - Installs `/opt/rustdesk-dashboard/agent.py` (zero external Python dependencies required) and enables the systemd service to poll for RMM scripts every 5 seconds.

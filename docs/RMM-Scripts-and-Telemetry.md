# RMM Scripts, Cross-OS Translation & Live Telemetry

## 1. 5-Second Fast-Polling RMM Script Engine

Both the Windows (`sync-inventory.ps1`) and Linux (`agent.py`) agents use a two-tier polling loop:
- **Every 5 Seconds (Lightweight Poll)**: Checks `/api/agent/heartbeat` for pending RMM script deployments or queued one-off terminal commands, executes them immediately, and returns `stdout`/`stderr` console output back to the dashboard.
- **Every 60 Seconds (Full Telemetry Sync)**: Collects live CPU load %, RAM usage %, Disk usage %, hardware model, OS version, and local IP address.
- **Every 5 Minutes (Software Inventory Sync)**: Scans installed applications (Windows Registry `Uninstall` keys on Windows; `dpkg-query` / `rpm -qa` on Linux).

When you click **Deploy Script** on the **Scripts** page in the Web UI, the **Execution Results** modal opens automatically and live-refreshes every 3 seconds until the remote station returns its console output.

---

## 2. Automatic Cross-OS Script Translation (Windows ↔ Linux)

The appliance ships with 5 built-in RMM scripts (`Hardware Specs & Serial`, `Flush DNS Cache`, `Top Resource Processes`, `System Information Check`, and `System Cleanup`).

If you deploy any of these built-in scripts to a **Device Group** containing a mix of Windows and Linux machines:
- **Windows Agents** execute the native PowerShell / WMI / CIM commands.
- **Linux Agents** automatically detect and translate those built-in scripts into their native Linux equivalents (`resolvectl flush-caches`, `ps aux --sort=-%cpu`, `/sys/class/dmi/id/product_serial` + `free -h`, `hostnamectl` + `lscpu`, and `journalctl --vacuum-time=3d` + `/tmp` cleanup).
- You can also write custom **PowerShell** scripts for Windows or **Bash** scripts for Linux directly in the **Scripts** library.

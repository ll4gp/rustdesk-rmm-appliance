# Changelog

All notable changes to the **RustDesk RMM & Telemetry Plug-In Appliance** will be documented in this file.

## [1.0.0] - 2026-11-21

### Added
- **Plug-In Appliance Architecture**: Supports plugging into any existing RustDesk Server (`hbbs`/`hbbr`) on port `3031` (`docker-compose.yml`) or deploying a full all-in-one stack (`docker-compose.fullstack.yml`).
- **Bring Your Own Key (`id_ed25519.pub`) Web UI Loader**: Upload `id_ed25519.pub` files directly in the browser or paste key strings with Ed25519 validation.
- **Live TCP Server Connection Verifier**: Real-time TCP reachability and latency check against `hbbs` (`:21116`), NAT Test (`:21115`), and `hbbr` (`:21117`).
- **Dynamic 1-Click Windows & Linux Installers**:
  - `Connect-Station.bat` & `/api/agent/onboard.ps1` for Windows (SYSTEM scheduled task + unattended `RustDesk2.toml`).
  - `Connect-Station.sh` & `/api/agent/agent.py` for Linux (systemd daemon + GDM `WaylandEnable=false` + Polkit unattended screen-share rule).
- **5-Second Fast-Polling RMM Engine & Cross-OS Script Translation**: Execute PowerShell and Bash scripts with live modal output and automatic Windows-to-Linux built-in script translation.
- **1-Click Zero-Downtime Updaters**: `Update-Appliance.bat` and `update-appliance.sh`.

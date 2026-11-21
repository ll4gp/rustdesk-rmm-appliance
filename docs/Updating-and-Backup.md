# 1-Click Updates, Backups & Multi-Site MSP Management

## 1. Updating a Deployed Appliance (Zero Data Loss)

All site-specific configuration and database files are isolated from the application code:
- `./.env` — Site environment variables and JWT secret
- `./data/dashboard/database.sqlite` — SQLite WAL database (devices, groups, users, custom scripts, telemetry, settings)
- `./data/rustdesk/` — RustDesk `id_ed25519` & `id_ed25519.pub` keys (when using Full-Stack mode)

To update any deployed client site to the latest release from GitHub:

### On Linux
```bash
cd rustdesk-rmm-appliance
sudo ./update-appliance.sh
```

### On Windows
Double-click **`Update-Appliance.bat`** inside the appliance folder.

---

## 2. Backing Up & Restoring a Client Site

To back up an entire client site before migrating hardware:
1. Copy `./.env` and the `./data/` folder (`./data/dashboard/database.sqlite` and `./data/rustdesk/`).
2. On the new host, clone the repository, place `.env` and `./data/` into the folder, and run `docker compose up -d --build`. All enrolled workstations will reconnect automatically without needing to re-run `Connect-Station`.

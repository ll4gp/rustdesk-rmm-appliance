# Connecting Your Existing RustDesk Server & Loading `id_ed25519.pub`

The appliance is built to work with **any** RustDesk Server installation (Windows service, Linux systemd, Docker, Synology NAS, Proxmox LXC, or Cloud VPS).

---

## Step 1: Locate Your Existing `id_ed25519.pub` Key

Your RustDesk Server (`hbbs`) automatically generates a public/private keypair on first startup:
- **`id_ed25519.pub`** (Public Key — **this is the file you load into the Appliance**)
- **`id_ed25519`** (Private Key — keep this secret on your `hbbs` server)

Common locations for `id_ed25519.pub`:
- **Windows RustDesk Server**: `C:\Program Files\RustDeskServer\bin\id_ed25519.pub` (or `C:\Users\<User>\AppData\Roaming\RustDesk\...`)
- **Linux Systemd / PM2**: `/var/lib/rustdesk-server/id_ed25519.pub` or `/opt/rustdesk/id_ed25519.pub`
- **Docker RustDesk Server**: Inside your mapped `./data/id_ed25519.pub` volume (`cat ./data/id_ed25519.pub`)

---

## Step 2: Load the Key & Server IP in the Appliance Web UI

1. Log into the Appliance Dashboard at `http://<APPLIANCE_IP>:3031` (default: `admin` / `admin123`).
2. Click **"Load Server Key & Configure"** in the top banner (or click **Appliance Setup** in the left navigation bar).
3. Fill in:
   - **Client / Organization Name**: Displays in the sidebar brand header and inside generated station installers.
   - **RustDesk ID Server (`hbbs`)**: The IP address or DNS hostname of your existing RustDesk server (e.g., `rustdesk.example.com` or `192.168.1.10`).
   - **Relay Server (`hbbr`)**: Optional if your relay runs on a different IP; defaults to the ID server if left blank.
4. Click **"Test Connection to RustDesk Server"**:
   - The appliance backend performs a live TCP socket check against ports `21116` (`hbbs`) and `21117` (`hbbr`) and reports latency in milliseconds.
5. **Load Your Public Key**:
   - Click **"Upload `id_ed25519.pub` File"** and select your `.pub` file from disk, **or** paste the 44-character base64 string directly.
   - A green **`✓ Valid Ed25519 Key`** indicator confirms valid key formatting.
6. Click **"Save & Activate Appliance"**.

All downloadable 1-Click installers (`Connect-Station.bat`, `onboard.ps1`, and `Connect-Station.sh`) immediately update on the fly with your server address and public key.

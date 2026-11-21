# Security Policy

## Best Practices for Production Deployments
1. **Change Default Credentials Immediately**: After first login (`admin` / `admin123`), navigate to **User Management** (`/admin/users`) and update the administrator password.
2. **Never Commit Private Keys**: Your RustDesk private key (`id_ed25519`) and `.env` file are excluded via `.gitignore`. Only the public key (`id_ed25519.pub`) is distributed to endpoints.
3. **Use HTTPS / Reverse Proxy for Internet-Exposed Appliances**: When exposing port `3031` outside a private LAN or VPN/Tailscale mesh, place the appliance behind an HTTPS reverse proxy (Caddy, Nginx, Traefik, or Cloudflare Tunnel).

const fs = require('fs');
const { db } = require('./database');

const KEY_CANDIDATE_PATHS = [
    process.env.RUSTDESK_KEY_PATH,
    '/usr/src/app/rustdesk-data/id_ed25519.pub',
    '/usr/src/app/logs/id_ed25519.pub',
    'C:/Program Files/RustDeskServer/id_ed25519.pub',
    'C:/Program Files/RustDeskServer/bin/id_ed25519.pub',
].filter(Boolean);

function getSetting(key) {
    try {
        const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
        return row && row.value ? row.value.trim() : '';
    } catch {
        return '';
    }
}

function setSettingIfEmpty(key, value) {
    if (!value) return;
    try {
        const current = getSetting(key);
        if (!current) {
            db.prepare(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            `).run(key, value.trim());
        }
    } catch {}
}

function detectPublicKeyFromDisk() {
    for (const p of KEY_CANDIDATE_PATHS) {
        try {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8').trim();
                if (content) return content;
            }
        } catch {}
    }
    return '';
}

function resolveApplianceConfig(req = null) {
    // 1. Resolve Public Key (User-loaded in DB -> Disk -> Env)
    const diskKey = detectPublicKeyFromDisk();
    if (diskKey) {
        setSettingIfEmpty('rustdesk_key', diskKey);
    }
    const envKey = (process.env.RUSTDESK_KEY || '').trim();
    if (envKey) {
        setSettingIfEmpty('rustdesk_key', envKey);
    }
    const rustdeskKey = getSetting('rustdesk_key') || diskKey || envKey || '';

    // 2. Resolve Incoming Request Host/Port for Dashboard URL
    let requestHost = '';
    let requestPort = process.env.PORT || '3031';
    let requestProto = 'http';
    if (req && req.headers) {
        if (req.headers['x-forwarded-proto']) {
            requestProto = String(req.headers['x-forwarded-proto']).split(',')[0].trim();
        }
        if (req.headers.host) {
            const parts = req.headers.host.split(':');
            if (parts[0] && parts[0] !== 'localhost' && parts[0] !== '127.0.0.1') {
                requestHost = parts[0];
            }
            if (parts[1]) {
                requestPort = parts[1];
            }
        }
    }

    const envPrimary = (process.env.APPLIANCE_HOST || '').trim();
    const envSecondary = (process.env.APPLIANCE_SECONDARY_HOST || '').trim();
    const envRustdeskServer = (process.env.RUSTDESK_SERVER || envPrimary || '').trim();
    const envRelayServer = (process.env.RUSTDESK_RELAY_SERVER || '').trim();

    if (envRustdeskServer) setSettingIfEmpty('rustdesk_server', envRustdeskServer);
    if (envRelayServer) setSettingIfEmpty('rustdesk_relay_server', envRelayServer);
    if (envSecondary) setSettingIfEmpty('rustdesk_secondary_server', envSecondary);
    if (envPrimary) setSettingIfEmpty('dashboard_host', envPrimary);

    // RustDesk ID Server (hbbs) & Relay Server (hbbr)
    const rustdeskServer = getSetting('rustdesk_server') || envRustdeskServer || requestHost || '127.0.0.1';
    const rustdeskRelayServer = getSetting('rustdesk_relay_server') || envRelayServer || rustdeskServer;

    // Dashboard RMM Host (can be the same machine or a different host from the client's existing RustDesk server)
    const dashboardHost = getSetting('dashboard_host') || envPrimary || requestHost || rustdeskServer || '127.0.0.1';
    const secondaryHost = getSetting('rustdesk_secondary_server') || envSecondary || '';
    const siteName = getSetting('site_name') || process.env.SITE_NAME || 'RustDesk RMM Appliance';
    const dashboardPort = process.env.PUBLIC_DASHBOARD_PORT || requestPort || '3031';
    const defaultPassword = getSetting('default_unattended_password') || '';

    const candidateDashboardHosts = [dashboardHost];
    if (secondaryHost && !candidateDashboardHosts.includes(secondaryHost)) {
        candidateDashboardHosts.push(secondaryHost);
    }
    if (requestHost && !candidateDashboardHosts.includes(requestHost)) {
        candidateDashboardHosts.push(requestHost);
    }
    if (rustdeskServer && !candidateDashboardHosts.includes(rustdeskServer)) {
        candidateDashboardHosts.push(rustdeskServer);
    }

    const candidateUrls = candidateDashboardHosts.map(h => {
        if (h.startsWith('http://') || h.startsWith('https://')) return h.replace(/\/+$/, '');
        return `${requestProto}://${h}:${dashboardPort}`;
    });

    const isConfigured = Boolean(getSetting('rustdesk_key') || diskKey || envKey);

    return {
        isConfigured,
        siteName,
        primaryHost: rustdeskServer,
        relayHost: rustdeskRelayServer,
        dashboardHost,
        secondaryHost,
        dashboardPort,
        rustdeskKey,
        defaultPassword,
        candidateHosts: candidateDashboardHosts,
        candidateUrls,
    };
}

module.exports = { resolveApplianceConfig, detectPublicKeyFromDisk };

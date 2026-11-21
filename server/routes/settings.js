const express = require('express');
const net = require('net');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { resolveApplianceConfig, detectPublicKeyFromDisk } = require('../applianceConfig');

const router = express.Router();

function checkTcpPort(host, port, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        let done = false;

        const finish = (reachable, error = null) => {
            if (done) return;
            done = true;
            socket.destroy();
            resolve({
                host,
                port,
                reachable,
                latency_ms: Date.now() - start,
                error
            });
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false, 'Connection timed out'));
        socket.once('error', (err) => finish(false, err.message));
        socket.connect(port, host);
    });
}

// GET /api/settings/status - Public/authenticated appliance configuration status
router.get('/status', authenticateToken, (req, res) => {
    try {
        const resolved = resolveApplianceConfig(req);
        res.json({
            is_configured: resolved.isConfigured,
            site_name: resolved.siteName,
            rustdesk_server: resolved.primaryHost,
            rustdesk_relay_server: resolved.relayHost,
            dashboard_host: resolved.dashboardHost,
            dashboard_port: resolved.dashboardPort,
            has_key: Boolean(resolved.rustdeskKey),
            rustdesk_key_preview: resolved.rustdeskKey
                ? `${resolved.rustdeskKey.slice(0, 10)}...${resolved.rustdeskKey.slice(-6)}`
                : ''
        });
    } catch (err) {
        console.error('Get status error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/settings/test-server - Live TCP reachability test for any existing RustDesk server (hbbs/hbbr)
router.post('/test-server', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { rustdesk_server, rustdesk_relay_server } = req.body || {};
        const idHost = (rustdesk_server || '').trim().replace(/^https?:\/\//, '').split(':')[0];
        const relayHost = ((rustdesk_relay_server || rustdesk_server || '').trim()).replace(/^https?:\/\//, '').split(':')[0];

        if (!idHost) {
            return res.status(400).json({ error: 'RustDesk Server IP or Hostname is required' });
        }

        const [hbbs21116, hbbs21115, hbbr21117] = await Promise.all([
            checkTcpPort(idHost, 21116, 3500),
            checkTcpPort(idHost, 21115, 3500),
            checkTcpPort(relayHost, 21117, 3500),
        ]);

        res.json({
            ok: hbbs21116.reachable,
            hbbs: hbbs21116,
            nat_test: hbbs21115,
            hbbr: hbbr21117,
        });
    } catch (err) {
        console.error('Test server error:', err);
        res.status(500).json({ error: 'Failed to test RustDesk server connection' });
    }
});

// GET /api/settings - List all settings (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const resolved = resolveApplianceConfig(req);
        const rows = db.prepare('SELECT key, value, updated_at FROM system_settings').all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        settings._resolved = resolved;
        settings._disk_key = detectPublicKeyFromDisk();
        res.json(settings);
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/settings - Update settings (admin only)
router.put('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const updates = req.body;
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({ error: 'Invalid settings payload' });
        }

        const updateStmt = db.prepare(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `);

        const insertMany = db.transaction(() => {
            for (const [key, value] of Object.entries(updates)) {
                if (!key.startsWith('_') && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
                    updateStmt.run(key, String(value).trim());
                }
            }
        });

        insertMany();

        const resolved = resolveApplianceConfig(req);
        const rows = db.prepare('SELECT key, value FROM system_settings').all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        settings._resolved = resolved;
        res.json(settings);
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

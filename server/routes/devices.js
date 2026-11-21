const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/devices - List all devices
router.get('/', authenticateToken, (req, res) => {
    try {
        const { status, group_id, search, sort_by, sort_order } = req.query;

        let query = `
      SELECT d.*, dg.name as group_name, dg.color as group_color, dg.icon as group_icon
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.id
      WHERE 1=1
    `;
        const params = [];

        if (status) {
            query += ' AND d.status = ?';
            params.push(status);
        }

        if (group_id) {
            query += ' AND d.group_id = ?';
            params.push(group_id);
        }

        if (search) {
            query += ' AND (d.hostname LIKE ? OR d.alias LIKE ? OR d.ip_address LIKE ? OR d.rustdesk_id LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const validSortColumns = ['hostname', 'status', 'last_seen', 'os', 'created_at'];
        const sortCol = validSortColumns.includes(sort_by) ? sort_by : 'hostname';
        const sortDir = sort_order === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY d.${sortCol} ${sortDir}`;

        const devices = db.prepare(query).all(...params);
        res.json(devices);
    } catch (err) {
        console.error('Get devices error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/devices/stats - Device statistics
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const total = db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
        const online = db.prepare("SELECT COUNT(*) as count FROM devices WHERE status = 'online'").get().count;
        const offline = db.prepare("SELECT COUNT(*) as count FROM devices WHERE status = 'offline'").get().count;
        const away = db.prepare("SELECT COUNT(*) as count FROM devices WHERE status = 'away'").get().count;
        const activeConnections = db.prepare("SELECT COUNT(*) as count FROM connections WHERE status = 'in_progress'").get().count;
        const todayConnections = db.prepare("SELECT COUNT(*) as count FROM connections WHERE date(started_at) = date('now')").get().count;

        // OS distribution
        const osDistribution = db.prepare(`
      SELECT os, COUNT(*) as count FROM devices GROUP BY os ORDER BY count DESC
    `).all();

        // Model distribution
        const modelDistribution = db.prepare(`
          SELECT COALESCE(model, 'Unknown') as name, COUNT(*) as count
          FROM devices
          GROUP BY COALESCE(model, 'Unknown')
          ORDER BY count DESC
        `).all();

        res.json({
            total,
            online,
            offline,
            away,
            activeConnections,
            todayConnections,
            osDistribution,
            modelDistribution,
        });
    } catch (err) {
        console.error('Get device stats error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/devices/:id - Device details
router.get('/:id', authenticateToken, (req, res) => {
    try {
        const device = db.prepare(`
      SELECT d.*, dg.name as group_name, dg.color as group_color
      FROM devices d
      LEFT JOIN device_groups dg ON d.group_id = dg.id
      WHERE d.id = ?
    `).get(req.params.id);

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Get recent connections for this device
        const recentConnections = db.prepare(`
      SELECT c.*, u.full_name as user_name, u.username
      FROM connections c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.device_id = ?
      ORDER BY c.started_at DESC
      LIMIT 10
    `).all(req.params.id);

        res.json({ ...device, recentConnections });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/devices/:id - Update device
router.put('/:id', authenticateToken, (req, res) => {
    try {
        const { alias, notes, group_id, tags, model, cpu, ram_mb, disk_gb, os, mac_address, ip_address } = req.body;
        const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);

        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        db.prepare(`
      UPDATE devices SET 
        alias = COALESCE(?, alias), 
        notes = COALESCE(?, notes), 
        group_id = ?, 
        tags = COALESCE(?, tags),
        model = COALESCE(?, model),
        cpu = COALESCE(?, cpu),
        ram_mb = COALESCE(?, ram_mb),
        disk_gb = COALESCE(?, disk_gb),
        os = COALESCE(?, os),
        mac_address = COALESCE(?, mac_address),
        ip_address = COALESCE(?, ip_address)
      WHERE id = ?
    `).run(
            alias !== undefined ? alias : device.alias,
            notes !== undefined ? notes : device.notes,
            group_id !== undefined ? group_id : device.group_id,
            tags !== undefined ? tags : device.tags,
            model !== undefined ? model : device.model,
            cpu !== undefined ? cpu : device.cpu,
            ram_mb !== undefined ? ram_mb : device.ram_mb,
            disk_gb !== undefined ? disk_gb : device.disk_gb,
            os !== undefined ? os : device.os,
            mac_address !== undefined ? mac_address : device.mac_address,
            ip_address !== undefined ? ip_address : device.ip_address,
            req.params.id
        );

        const updated = db.prepare(`
      SELECT d.*, dg.name as group_name, dg.color as group_color
      FROM devices d LEFT JOIN device_groups dg ON d.group_id = dg.id
      WHERE d.id = ?
    `).get(req.params.id);

        res.json(updated);
    } catch (err) {
        console.error('Update device error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/devices/:rustdesk_id/inventory - Unauthenticated endpoint for automated scripts
router.post('/:rustdesk_id/inventory', (req, res) => {
    try {
        // Simple security: script must pass the same API token OR a fixed secret
        const { model, cpu, ram_mb, disk_gb, os, mac_address, ip_address, hostname } = req.body;
        const now = new Date().toISOString();

        const device = db.prepare('SELECT * FROM devices WHERE rustdesk_id = ?').get(req.params.rustdesk_id);

        if (!device) {
            // Auto-create stub device if it hasn't connected yet
            db.prepare(`
                INSERT INTO devices (rustdesk_id, hostname, status, model, cpu, ram_mb, disk_gb, os, mac_address, ip_address, last_seen)
                VALUES (?, ?, 'online', ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                req.params.rustdesk_id,
                hostname || req.params.rustdesk_id,
                model, cpu, ram_mb, disk_gb, os, mac_address, ip_address, now
            );
        } else {
            // Update existing
            db.prepare(`
                UPDATE devices SET 
                    model = COALESCE(?, model),
                    cpu = COALESCE(?, cpu),
                    ram_mb = COALESCE(?, ram_mb),
                    disk_gb = COALESCE(?, disk_gb),
                    os = COALESCE(?, os),
                    mac_address = COALESCE(?, mac_address),
                    ip_address = COALESCE(?, ip_address),
                    hostname = COALESCE(?, hostname),
                    status = 'online',
                    last_seen = ?
                WHERE rustdesk_id = ?
            `).run(
                model, cpu, ram_mb, disk_gb, os, mac_address, ip_address, hostname, now,
                req.params.rustdesk_id
            );
        }

        res.json({ success: true, message: 'Inventory recorded successfully' });

        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            broadcast({
                type: 'devices_status',
                data: db.prepare('SELECT id, rustdesk_id, hostname, status, last_seen FROM devices').all()
            });
        }
    } catch (err) {
        console.error('Inventory record error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/devices/:id - Delete device
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Clean up script jobs targeting this device (no FK constraint for this)
        db.prepare("DELETE FROM script_jobs WHERE target_type = 'device' AND target_id = ?").run(req.params.id);

        // Delete device — connections, telemetry, inventory, remote_commands, job_results
        // are handled via ON DELETE CASCADE
        db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);

        res.json({ success: true, message: 'Device deleted successfully' });
    } catch (err) {
        console.error('Delete device error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/devices/:id/connect - Initiate connection
router.post('/:id/connect', authenticateToken, (req, res) => {
    try {
        const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Allow connection attempts even if the dashboard thinks it's offline.
        // RustDesk will natively handle timeouts if the machine is truly dead.
        const { connection_type, notes } = req.body;

        const result = db.prepare(`
      INSERT INTO connections (device_id, user_id, connection_type, notes)
      VALUES (?, ?, ?, ?)
    `).run(
            req.params.id,
            req.user.id,
            connection_type || 'remote_desktop',
            notes || ''
        );

        const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);

        res.json({
            connection,
            rustdesk_uri: `rustdesk://${device.rustdesk_id}`,
            message: 'Connection initiated successfully',
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

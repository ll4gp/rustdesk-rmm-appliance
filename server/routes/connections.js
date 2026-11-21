const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/connections - Connection history
router.get('/', authenticateToken, (req, res) => {
    try {
        const { device_id, user_id, status, limit, offset } = req.query;

        let query = `
      SELECT c.*, 
        d.hostname, d.alias, d.rustdesk_id, d.os as device_os,
        u.full_name as user_name, u.username
      FROM connections c
      LEFT JOIN devices d ON c.device_id = d.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE 1=1
    `;
        const params = [];

        if (device_id) {
            query += ' AND c.device_id = ?';
            params.push(device_id);
        }

        if (user_id) {
            query += ' AND c.user_id = ?';
            params.push(user_id);
        }

        if (status) {
            query += ' AND c.status = ?';
            params.push(status);
        }

        // Get total count
        const countQuery = query.replace('SELECT c.*,', 'SELECT COUNT(*) as total FROM connections c LEFT JOIN devices d ON c.device_id = d.id LEFT JOIN users u ON c.user_id = u.id WHERE 1=1 AND').replace(query.substring(query.indexOf('FROM')), '');

        query += ' ORDER BY c.started_at DESC';
        query += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit) || 20, parseInt(offset) || 0);

        const connections = db.prepare(query).all(...params);

        // Also get total
        let totalQuery = `SELECT COUNT(*) as total FROM connections c WHERE 1=1`;
        const totalParams = [];
        if (device_id) {
            totalQuery += ' AND c.device_id = ?';
            totalParams.push(device_id);
        }
        if (user_id) {
            totalQuery += ' AND c.user_id = ?';
            totalParams.push(user_id);
        }
        if (status) {
            totalQuery += ' AND c.status = ?';
            totalParams.push(status);
        }
        const total = db.prepare(totalQuery).get(...totalParams).total;

        res.json({ connections, total, limit: parseInt(limit) || 20, offset: parseInt(offset) || 0 });
    } catch (err) {
        console.error('Get connections error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/connections/:id/end - End a connection
router.put('/:id/end', authenticateToken, (req, res) => {
    try {
        const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
        if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const now = new Date().toISOString();
        const startTime = new Date(connection.started_at).getTime();
        const duration = Math.round((Date.now() - startTime) / 1000);

        db.prepare(`
      UPDATE connections SET ended_at = ?, duration_seconds = ?, status = 'success' WHERE id = ?
    `).run(now, duration, req.params.id);

        const updated = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

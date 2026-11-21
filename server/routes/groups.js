const express = require('express');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/groups
router.get('/', authenticateToken, (req, res) => {
    try {
        const groups = db.prepare(`
      SELECT dg.*, COUNT(d.id) as device_count,
        SUM(CASE WHEN d.status = 'online' THEN 1 ELSE 0 END) as online_count
      FROM device_groups dg
      LEFT JOIN devices d ON d.group_id = dg.id
      GROUP BY dg.id
      ORDER BY dg.name
    `).all();

        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/groups
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { name, description, color, icon } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Group name is required' });
        }

        const result = db.prepare(`
      INSERT INTO device_groups (name, description, color, icon) VALUES (?, ?, ?, ?)
    `).run(name, description || '', color || '#6366f1', icon || 'folder');

        const group = db.prepare('SELECT * FROM device_groups WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(group);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/groups/:id
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { name, description, color, icon } = req.body;
        const group = db.prepare('SELECT * FROM device_groups WHERE id = ?').get(req.params.id);

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        db.prepare(`
      UPDATE device_groups SET name = ?, description = ?, color = ?, icon = ? WHERE id = ?
    `).run(
            name || group.name,
            description !== undefined ? description : group.description,
            color || group.color,
            icon || group.icon,
            req.params.id
        );

        const updated = db.prepare('SELECT * FROM device_groups WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/groups/:id
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const group = db.prepare('SELECT * FROM device_groups WHERE id = ?').get(req.params.id);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Unassign devices from this group
        db.prepare('UPDATE devices SET group_id = NULL WHERE group_id = ?').run(req.params.id);
        db.prepare('DELETE FROM device_groups WHERE id = ?').run(req.params.id);

        res.json({ message: 'Group deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - List users (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
      SELECT id, username, email, full_name, role, is_active, created_at, last_login
      FROM users ORDER BY created_at DESC
    `).all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/users - Create user (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { username, email, password, full_name, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)
    `).run(username, email, hash, full_name || '', role || 'technician');

        const user = db.prepare('SELECT id, username, email, full_name, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(user);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/users/:id - Update user (admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { email, full_name, role, is_active, password } = req.body;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (password) {
            const hash = bcrypt.hashSync(password, 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
        }

        db.prepare(`
      UPDATE users SET email = ?, full_name = ?, role = ?, is_active = ? WHERE id = ?
    `).run(
            email || user.email,
            full_name !== undefined ? full_name : user.full_name,
            role || user.role,
            is_active !== undefined ? is_active : user.is_active,
            req.params.id
        );

        const updated = db.prepare('SELECT id, username, email, full_name, role, is_active, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

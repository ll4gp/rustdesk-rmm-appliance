const express = require('express');
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ==========================================
// ADMIN DASHBOARD ROUTES (AUTHENTICATED)
// ==========================================

// GET /api/scripts - List all scripts
router.get('/', authenticateToken, (req, res) => {
    try {
        const scripts = db.prepare(`
            SELECT s.*, u.username as created_by_name 
            FROM scripts s
            LEFT JOIN users u ON s.created_by = u.id
            ORDER BY s.name ASC
        `).all();
        res.json(scripts);
    } catch (err) {
        console.error('Fetch scripts error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/scripts - Create new script
router.post('/', authenticateToken, (req, res) => {
    try {
        const { name, description, code } = req.body;
        const result = db.prepare('INSERT INTO scripts (name, description, code, created_by) VALUES (?, ?, ?, ?)').run(
            name, description, code, req.user.id
        );
        res.status(201).json({ id: result.lastInsertRowid, message: 'Script saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/scripts/:id - Delete a script
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        db.prepare('DELETE FROM scripts WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/scripts/:id/execute - Dispatch script to target
router.post('/:id/execute', authenticateToken, (req, res) => {
    try {
        const { target_type, target_id } = req.body;
        const scriptId = req.params.id;

        const result = db.prepare(`
            INSERT INTO script_jobs (script_id, target_type, target_id, status, created_by)
            VALUES (?, ?, ?, 'pending', ?)
        `).run(scriptId, target_type, target_id, req.user.id);

        res.status(201).json({ job_id: result.lastInsertRowid, message: 'Job queued successfully' });
    } catch (err) {
        console.error('Execute script error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/scripts/jobs - List all jobs
router.get('/jobs', authenticateToken, (req, res) => {
    try {
        const jobs = db.prepare(`
            SELECT j.*, s.name as script_name, u.username as created_by_name
            FROM script_jobs j
            JOIN scripts s ON j.script_id = s.id
            LEFT JOIN users u ON j.created_by = u.id
            ORDER BY j.created_at DESC LIMIT 50
        `).all();
        res.json(jobs);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/scripts/jobs/:id - Get specific job results
router.get('/jobs/:id', authenticateToken, (req, res) => {
    try {
        const job = db.prepare(`
            SELECT j.*, s.name as script_name, s.code 
            FROM script_jobs j JOIN scripts s ON j.script_id = s.id 
            WHERE j.id = ?
        `).get(req.params.id);

        const results = db.prepare(`
            SELECT r.*, d.alias, d.hostname, d.rustdesk_id
            FROM job_results r
            JOIN devices d ON r.device_id = d.id
            WHERE r.job_id = ?
        `).all(req.params.id);

        res.json({ job, results });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==========================================
// EDGE DAEMON ROUTES (UNAUTHENTICATED)
// ==========================================

// GET /api/scripts/agent/:rustdesk_id/pending - Daemon fetching jobs
router.get('/agent/:rustdesk_id/pending', (req, res) => {
    try {
        const device = db.prepare('SELECT id, group_id FROM devices WHERE rustdesk_id = ?').get(req.params.rustdesk_id);
        if (!device) return res.json({ jobs: [] });

        // Find pending jobs strictly targeted at this specifically, or its parent group.
        const jobs = db.prepare(`
            SELECT j.id as job_id, s.code
            FROM script_jobs j
            JOIN scripts s ON j.script_id = s.id
            WHERE j.status = 'pending' 
            AND (
                (j.target_type = 'device' AND j.target_id = ?) OR
                (j.target_type = 'group' AND j.target_id = ?)
            )
            AND j.id NOT IN (SELECT job_id FROM job_results WHERE device_id = ?)
        `).all(device.id, device.group_id, device.id);

        res.json({ jobs });
    } catch (err) {
        console.error('Agent fetch error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/scripts/agent/:rustdesk_id/result/:job_id - Daemon posting results
router.post('/agent/:rustdesk_id/result/:job_id', (req, res) => {
    try {
        const { status, output_log } = req.body;
        const device = db.prepare('SELECT id FROM devices WHERE rustdesk_id = ?').get(req.params.rustdesk_id);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        // Insert result uniquely mapped to the device
        db.prepare(`
            INSERT INTO job_results (job_id, device_id, status, output_log)
            VALUES (?, ?, ?, ?)
        `).run(req.params.job_id, device.id, status, output_log);

        // Fetch job details to check for completion
        const job = db.prepare('SELECT target_type, target_id FROM script_jobs WHERE id = ?').get(req.params.job_id);
        if (job) {
            let isComplete = false;
            
            if (job.target_type === 'device') {
                isComplete = true; // Singe device job is finished when it reports back
            } else if (job.target_type === 'group') {
                // Count how many devices are in this group
                const totalTargets = db.prepare('SELECT COUNT(*) as count FROM devices WHERE group_id = ?').get(job.target_id).count;
                // Count how many have reported back for this job
                const currentResults = db.prepare('SELECT COUNT(*) as count FROM job_results WHERE job_id = ?').get(req.params.job_id).count;
                
                if (currentResults >= totalTargets) {
                    isComplete = true;
                }
            }

            // Update status: mark 'running' as soon as someone starts, and 'completed' only when all are done
            const newStatus = isComplete ? 'completed' : 'running';
            const completedAt = isComplete ? 'CURRENT_TIMESTAMP' : 'NULL';
            
            db.prepare(`UPDATE script_jobs SET status = ?, completed_at = ${completedAt} WHERE id = ?`)
              .run(newStatus, req.params.job_id);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Agent result error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

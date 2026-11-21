const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { initializeDatabase, seedDatabase, db } = require('./database');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Allow all origins for LAN access
app.use(express.json());

// Initialize database
initializeDatabase();
seedDatabase();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/connections', require('./routes/connections.js'));
app.use('/api/users', require('./routes/users.js'));
app.use('/api/scripts', require('./routes/scripts.js'));
app.use('/api/agent', require('./routes/agent.js'));
app.use('/api/settings', require('./routes/settings.js'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ollama proxy for n8n webhook
app.post('/api/ollama-chat', async (req, res) => {
    try {
        const message = req.body.message || req.query.message;
        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3.1:8b', prompt: message, stream: false })
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(502).json({ error: 'Ollama error', details: errText });
        }

        const data = await response.json();
        res.json({ response: data.response });
    } catch (err) {
        console.error('Ollama proxy error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`WebSocket client connected (${clients.size} total)`);

    // Send initial device statuses
    const devices = db.prepare('SELECT id, rustdesk_id, hostname, status, last_seen FROM devices').all();
    ws.send(JSON.stringify({ type: 'devices_status', data: devices }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`WebSocket client disconnected (${clients.size} total)`);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        clients.delete(ws);
    });
});

// Broadcast function for real-time updates
function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
        }
    }
}
app.set('broadcast', broadcast);

// Global Status Sweeper — marks devices as 'offline' if no heartbeat for 5 minutes
setInterval(() => {
    const threshold = new Date(Date.now() - 5 * 60000).toISOString();
    const result = db.prepare(
        "UPDATE devices SET status = 'offline' WHERE status != 'offline' AND last_seen < ?"
    ).run(threshold);
    if (result.changes > 0) {
        console.log(`🔄 Sweeper: ${result.changes} device(s) marked offline`);
        const allDevices = db.prepare('SELECT id, rustdesk_id, hostname, status, last_seen FROM devices').all();
        broadcast({ type: 'devices_status', data: allDevices });
    }
}, 60000);
console.log('🧹 Global Status Sweeper active (5-min timeout, 60s interval)');

// Run the real RustDesk Server API Sync!
const { startSyncLoop } = require('./rustdeskSync');
startSyncLoop(broadcast);

const buildPath = path.join(__dirname, '../dist');
if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
            res.sendFile(path.join(buildPath, 'index.html'));
        } else {
            next();
        }
    });
}

server.listen(PORT, () => {
    console.log(`\n🚀 RustDesk Dashboard API running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`\n📌 Demo credentials:`);
    console.log(`   Admin:      admin / admin123`);
    console.log(`   Technician: jsmith / tech123\n`);
});

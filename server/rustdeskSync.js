const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { db } = require('./database');
require('dotenv').config();

// Path to the hbbs server log file
const HBBS_LOG_PATH = process.env.HBBS_LOG_PATH || 'C:/Program Files/RustDeskServer/logs/hbbs.out';

/**
 * Parse the hbbs.out log file and extract unique peer IDs
 * that have registered with the server.
 * 
 * hbbs logs peer activity with 9-digit numeric IDs in lines like:
 *   "tcp-request from ..." or containing the peer ID in various contexts.
 */
function parseHbbsLog() {
    if (!fs.existsSync(HBBS_LOG_PATH)) {
        console.error('❌ hbbs log file not found at:', HBBS_LOG_PATH);
        return [];
    }

    const content = fs.readFileSync(HBBS_LOG_PATH, 'utf-8');
    const lines = content.split('\n');

    const peerIds = new Set();
    const peerTimestamps = {};
    const peerIps = {};

    for (const line of lines) {
        // Find 9 digit IDs
        const idMatches = line.match(/\b(\d{9})\b/g);
        if (idMatches) {
            for (const id of idMatches) {
                peerIds.add(id);
                // Extract full timestamp with timezone from the log line (e.g., [2025-12-28 23:24:09.071798 +02:00])
                const tsMatch = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?: [\+\-]\d{2}:\d{2})?)\]/);
                if (tsMatch) {
                    peerTimestamps[id] = tsMatch[1];
                }

                // Try to catch IP address from this log line as well, format: [::ffff:192.168.X.X]:PORT
                const ipMatch = line.match(/(?:\[::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\])?:\d+/);
                if (ipMatch) {
                    peerIps[id] = ipMatch[1];
                }
            }
        }
    }

    return Array.from(peerIds).map(id => {
        let normalizedDate = new Date().toISOString();
        if (peerTimestamps[id]) {
            const parsed = new Date(peerTimestamps[id]);
            if (!isNaN(parsed.getTime())) {
                normalizedDate = parsed.toISOString();
            }
        }
        return {
            rustdesk_id: id,
            last_seen: normalizedDate,
            ip_address: peerIps[id] || ''
        };
    });
}

/**
 * Sync peers from hbbs logs into our dashboard database.
 */
function syncFromLogs(broadcastFunction) {
    console.log('📂 Parsing hbbs.out log for registered peers...');

    const peers = parseHbbsLog();

    if (peers.length === 0) {
        console.log('⚠️  No peers found in hbbs log file.');
        return;
    }

    console.log(`✅ Found ${peers.length} unique peers in hbbs logs.`);

    const now = Date.now();

    for (const peer of peers) {
        try {
            // Because we only parse legacy files periodically, we SHOULD NOT forcefully apply 'offline' statuses.
            // Only update the last_seen if the log reveals a newer connection than what the DB currently knows.
            // The global sweeper running in index.js represents the absolute source of truth for offline timeouts natively.
            db.prepare(`
                INSERT INTO devices (rustdesk_id, hostname, alias, ip_address, status, last_seen) 
                VALUES (?, ?, '', ?, 'online', ?)
                ON CONFLICT(rustdesk_id) DO UPDATE SET 
                    last_seen = CASE 
                        WHEN excluded.last_seen > devices.last_seen THEN excluded.last_seen 
                        ELSE devices.last_seen 
                    END,
                    ip_address = CASE 
                        WHEN excluded.ip_address != '' THEN excluded.ip_address 
                        ELSE devices.ip_address 
                    END,
                    status = CASE 
                        WHEN excluded.last_seen > devices.last_seen AND (julianday('now') - julianday(excluded.last_seen)) * 24 < 24 THEN 'online'
                        ELSE devices.status
                    END
            `).run(peer.rustdesk_id, 'RD-' + peer.rustdesk_id, peer.ip_address, peer.last_seen);
        } catch (err) {
            console.error(`  Failed to upsert peer ${peer.rustdesk_id}:`, err.message);
        }
    }

    // Broadcast updated device list to frontend
    if (broadcastFunction) {
        const allDevices = db.prepare('SELECT id, rustdesk_id, hostname, status, last_seen FROM devices').all();
        broadcastFunction({
            type: 'devices_status',
            data: allDevices,
        });
    }
}

function startSyncLoop(broadcastFunction) {
    // Run immediately on startup
    syncFromLogs(broadcastFunction);

    // Re-parse logs every 60 seconds to pick up new peers
    setInterval(() => syncFromLogs(broadcastFunction), 60000);
}

module.exports = { startSyncLoop };

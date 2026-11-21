const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './server/database.sqlite';
const db = new Database(path.resolve(dbPath));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT CHECK(role IN ('admin', 'technician')) DEFAULT 'technician',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS device_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'folder',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rustdesk_id TEXT UNIQUE NOT NULL,
      alias TEXT,
      hostname TEXT NOT NULL,
      ip_address TEXT,
      mac_address TEXT,
      os TEXT,
      os_version TEXT,
      cpu TEXT,
      ram_mb INTEGER,
      disk_gb INTEGER,
      model TEXT,
      status TEXT CHECK(status IN ('online', 'offline', 'away')) DEFAULT 'offline',
      group_id INTEGER REFERENCES device_groups(id) ON DELETE SET NULL,
      last_seen DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      tags TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      connection_type TEXT CHECK(connection_type IN ('remote_desktop', 'file_transfer', 'tcp_tunnel')) DEFAULT 'remote_desktop',
      status TEXT CHECK(status IN ('success', 'failed', 'in_progress', 'disconnected')) DEFAULT 'in_progress',
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
    CREATE INDEX IF NOT EXISTS idx_devices_group ON devices(group_id);
    CREATE INDEX IF NOT EXISTS idx_connections_device ON connections(device_id);
    CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_connections_started ON connections(started_at);

    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      code TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS script_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER REFERENCES scripts(id) ON DELETE CASCADE,
      target_type TEXT CHECK(target_type IN ('device', 'group')) NOT NULL,
      target_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS job_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES script_jobs(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
      status TEXT CHECK(status IN ('success', 'failed')) DEFAULT 'success',
      output_log TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON script_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_results_job ON job_results(job_id);

    -- ============================================
    -- RMM DEEP MONITORING TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rustdesk_id TEXT NOT NULL,
      cpu_usage REAL DEFAULT 0,
      ram_usage REAL DEFAULT 0,
      disk_usage REAL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rustdesk_id) REFERENCES devices(rustdesk_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(rustdesk_id, timestamp);

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rustdesk_id TEXT UNIQUE NOT NULL,
      os_info TEXT,
      cpu_model TEXT,
      total_ram_mb INTEGER,
      disk_total_gb INTEGER,
      installed_apps TEXT DEFAULT '[]',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rustdesk_id) REFERENCES devices(rustdesk_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS remote_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rustdesk_id TEXT NOT NULL,
      command_string TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
      result TEXT,
      queued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_at DATETIME,
      FOREIGN KEY (rustdesk_id) REFERENCES devices(rustdesk_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commands_device_status ON remote_commands(rustdesk_id, status);

    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('allow_registration', 'false');
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('site_name', '${process.env.SITE_NAME || 'Client Site Appliance'}');
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('rustdesk_server', '${process.env.APPLIANCE_HOST || ''}');
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('rustdesk_secondary_server', '${process.env.APPLIANCE_SECONDARY_HOST || ''}');
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('rustdesk_key', '${process.env.RUSTDESK_KEY || ''}');
    INSERT OR IGNORE INTO system_settings (key, value) VALUES ('rustdesk_api_port', '21114');
  `);
}

function seedDatabase() {
  // 1. Seed default Cross-OS RMM scripts if they don't exist
  const defaultScripts = [
    {
      name: 'Hardware Specs & Serial',
      description: 'Detailed machine logic including BIOS Serial Number and RAM capacity (Windows & Linux).',
      code: 'Get-WmiObject win32_bios | Select-Object SerialNumber\nGet-WmiObject -Class Win32_ComputerSystem | Select-Object TotalPhysicalMemory',
      created_by: 1
    },
    {
      name: 'Flush DNS Cache',
      description: 'Clears the local DNS resolver cache to fix stale network routes (Windows & Linux).',
      code: 'ipconfig /flushdns',
      created_by: 1
    },
    {
      name: 'Top Resource Processes',
      description: 'Prints the top 10 processes consuming the most CPU/Memory dynamically (Windows & Linux).',
      code: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10',
      created_by: 1
    },
    {
      name: 'System Information Check',
      description: 'Collects OS version, uptime, CPU architecture, and disk space.',
      code: 'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime',
      created_by: 1
    },
    {
      name: 'System Cleanup',
      description: 'Clears temporary files and system cache to free disk space.',
      code: 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue\nWrite-Output "Temporary files cleaned successfully."',
      created_by: 1
    }
  ];

  for (const script of defaultScripts) {
    const exists = db.prepare('SELECT id FROM scripts WHERE name = ?').get(script.name);
    if (!exists) {
      console.log(`📜 Seeding default script: ${script.name}`);
      db.prepare('INSERT INTO scripts (name, description, code, created_by) VALUES (?, ?, ?, ?)').run(
        script.name, script.description, script.code, script.created_by
      );
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  console.log('🌱 Initializing Client Site Appliance database...');

  // Create default admin user (password: admin123) and technician user (password: tech123)
  const adminHash = bcrypt.hashSync(process.env.ADMIN_INITIAL_PASSWORD || 'admin123', 10);
  const techHash = bcrypt.hashSync('tech123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run('admin', 'admin@appliance.local', adminHash, 'Site Administrator', 'admin');
  insertUser.run('jsmith', 'tech@appliance.local', techHash, 'Site Technician', 'technician');

  // Create clean organizational groups for the client site (no fake demo devices)
  const groupCount = db.prepare('SELECT COUNT(*) as count FROM device_groups').get();
  if (groupCount.count === 0) {
    const insertGroup = db.prepare(`
      INSERT INTO device_groups (name, description, color, icon) VALUES (?, ?, ?, ?)
    `);
    insertGroup.run('Workstations', 'Office desktops and workstations', '#6366f1', 'monitor');
    insertGroup.run('Laptops & Remote', 'Mobile laptops and remote workers', '#06b6d4', 'wifi');
    insertGroup.run('Servers & Infra', 'On-premise servers and virtual machines', '#8b5cf6', 'server');
    insertGroup.run('Linux Stations', 'Linux desktops and headless nodes', '#10b981', 'terminal');
  }

  console.log('✅ Client Site Appliance initialized with clean device registry.');
}

module.exports = { db, initializeDatabase, seedDatabase };

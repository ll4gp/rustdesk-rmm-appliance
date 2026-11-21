const express = require('express');
const { db } = require('../database');
const { resolveApplianceConfig } = require('../applianceConfig');

const router = express.Router();

// ============================================
// BLOCKED COMMAND PATTERNS (security guardrails)
// ============================================
const BLOCKED_PATTERNS = [
    /rm\s+(-rf?|--recursive)\s+\//i,
    /format\s+[a-z]:/i,
    /del\s+\/[sfq]/i,
    /shutdown/i,
    /reboot/i,
    /init\s+[06]/i,
    /mkfs/i,
    /dd\s+if=/i,
    />\s*\/dev\/sd/i,
];

const MAX_COMMAND_LENGTH = 2000;

function isCommandSafe(cmd) {
    if (cmd.length > MAX_COMMAND_LENGTH) return false;
    return !BLOCKED_PATTERNS.some(pattern => pattern.test(cmd));
}

// ============================================
// AGENT HEARTBEAT (Unauthenticated — polled by edge machines)
// ============================================

// POST /api/agent/heartbeat
// The agent sends telemetry + inventory in one call.
// The server responds with any pending remote commands.
router.post('/heartbeat', (req, res) => {
    try {
        const {
            rustdesk_id,
            hostname,
            ip_address,
            model,
            cpu_usage,
            ram_usage,
            disk_usage,
            os_info,
            cpu_model,
            total_ram_mb,
            disk_total_gb,
            installed_apps,
            active_peer_ips
        } = req.body;

        if (!rustdesk_id) {
            return res.status(400).json({ error: 'rustdesk_id is required' });
        }

        const now = new Date().toISOString();

        if (Array.isArray(active_peer_ips) && active_peer_ips.length > 0) {
            const updatePeerStmt = db.prepare(`
                UPDATE devices SET status = 'online', last_seen = ?
                WHERE ip_address = ? AND rustdesk_id != 'REPLACE_ME_WITH_9_DIGIT_ID'
            `);
            for (const peerIp of active_peer_ips) {
                if (typeof peerIp === 'string' && peerIp.trim()) {
                    updatePeerStmt.run(now, peerIp.trim());
                }
            }
        }

        // 1. Upsert device record (mark online + update last_seen)
        const existingDevice = db.prepare('SELECT id FROM devices WHERE rustdesk_id = ?').get(rustdesk_id);

        if (existingDevice) {
            db.prepare(`
                UPDATE devices SET
                    status = 'online',
                    last_seen = ?,
                    hostname = COALESCE(?, hostname),
                    ip_address = COALESCE(?, ip_address),
                    model = COALESCE(?, model),
                    cpu = COALESCE(?, cpu),
                    os = COALESCE(?, os),
                    ram_mb = COALESCE(?, ram_mb),
                    disk_gb = COALESCE(?, disk_gb)
                WHERE rustdesk_id = ?
            `).run(now, hostname, ip_address, model, cpu_model, os_info, total_ram_mb, disk_total_gb, rustdesk_id);
        } else {
            db.prepare(`
                INSERT INTO devices (rustdesk_id, hostname, ip_address, model, cpu, os, ram_mb, disk_gb, status, last_seen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?)
            `).run(rustdesk_id, hostname || rustdesk_id, ip_address, model, cpu_model, os_info, total_ram_mb, disk_total_gb, now);
        }

        // 2. Insert telemetry data point
        if (cpu_usage !== undefined) {
            db.prepare(`
                INSERT INTO telemetry (rustdesk_id, cpu_usage, ram_usage, disk_usage)
                VALUES (?, ?, ?, ?)
            `).run(rustdesk_id, cpu_usage || 0, ram_usage || 0, disk_usage || 0);

            // Prune old telemetry (keep last 200 points per device)
            db.prepare(`
                DELETE FROM telemetry WHERE rustdesk_id = ? AND id NOT IN (
                    SELECT id FROM telemetry WHERE rustdesk_id = ? ORDER BY timestamp DESC LIMIT 200
                )
            `).run(rustdesk_id, rustdesk_id);
        }

        // 3. Upsert inventory snapshot
        if (os_info || installed_apps) {
            const appsJson = Array.isArray(installed_apps) ? JSON.stringify(installed_apps) : (installed_apps || '[]');
            db.prepare(`
                INSERT INTO inventory (rustdesk_id, os_info, cpu_model, total_ram_mb, disk_total_gb, installed_apps, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(rustdesk_id) DO UPDATE SET
                    os_info = COALESCE(excluded.os_info, inventory.os_info),
                    cpu_model = COALESCE(excluded.cpu_model, inventory.cpu_model),
                    total_ram_mb = COALESCE(excluded.total_ram_mb, inventory.total_ram_mb),
                    disk_total_gb = COALESCE(excluded.disk_total_gb, inventory.disk_total_gb),
                    installed_apps = CASE WHEN excluded.installed_apps != '[]' THEN excluded.installed_apps ELSE inventory.installed_apps END,
                    last_updated = excluded.last_updated
            `).run(rustdesk_id, os_info, cpu_model, total_ram_mb, disk_total_gb, appsJson, now);
        }

        // 4. Fetch pending remote commands for this device
        const pendingCommands = db.prepare(`
            SELECT id, command_string FROM remote_commands
            WHERE rustdesk_id = ? AND status = 'pending'
            ORDER BY queued_at ASC
        `).all(rustdesk_id);

        // Mark them as 'running' so they aren't double-dispatched
        if (pendingCommands.length > 0) {
            const ids = pendingCommands.map(c => c.id);
            db.prepare(`UPDATE remote_commands SET status = 'running' WHERE id IN (${ids.join(',')})`).run();
        }

        // 5. Broadcast updated status to WebSocket clients
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
            broadcast({
                type: 'devices_status',
                data: db.prepare('SELECT id, rustdesk_id, hostname, status, last_seen FROM devices').all()
            });

            // Also broadcast latest telemetry for live sparklines
            if (cpu_usage !== undefined) {
                broadcast({
                    type: 'telemetry_update',
                    data: { rustdesk_id, cpu_usage, ram_usage, disk_usage, timestamp: now }
                });
            }
        }

        // 6. Also check for pending script jobs (backward compat with existing RMM system)
        const device = db.prepare('SELECT id, group_id FROM devices WHERE rustdesk_id = ?').get(rustdesk_id);
        let scriptJobs = [];
        if (device) {
            scriptJobs = db.prepare(`
                SELECT j.id as job_id, s.code
                FROM script_jobs j
                JOIN scripts s ON j.script_id = s.id
                WHERE j.status IN ('pending', 'running')
                AND (
                    (j.target_type = 'device' AND j.target_id = ?) OR
                    (j.target_type = 'group' AND j.target_id = ?)
                )
                AND j.id NOT IN (SELECT job_id FROM job_results WHERE device_id = ?)
            `).all(device.id, device.group_id, device.id);
        }

        res.json({
            success: true,
            commands: pendingCommands.map(c => ({ id: c.id, command_string: c.command_string })),
            script_jobs: scriptJobs
        });

    } catch (err) {
        console.error('Agent heartbeat error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/agent/command-result
// Agent posts back the output of an executed command
router.post('/command-result', (req, res) => {
    try {
        const { command_id, status, result } = req.body;

        if (!command_id) {
            return res.status(400).json({ error: 'command_id is required' });
        }

        db.prepare(`
            UPDATE remote_commands SET
                status = ?,
                result = ?,
                executed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status || 'completed', result || '', command_id);

        res.json({ success: true });
    } catch (err) {
        console.error('Command result error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// DASHBOARD ROUTES (Authenticated)
// ============================================

const { authenticateToken } = require('../middleware/auth');

// GET /api/agent/telemetry/:rustdesk_id — Last 30 data points for sparklines
router.get('/telemetry/:rustdesk_id', authenticateToken, (req, res) => {
    try {
        const data = db.prepare(`
            SELECT cpu_usage, ram_usage, disk_usage, timestamp
            FROM telemetry
            WHERE rustdesk_id = ?
            ORDER BY timestamp DESC
            LIMIT 30
        `).all(req.params.rustdesk_id);

        res.json(data.reverse()); // chronological order
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/agent/inventory/:rustdesk_id — Full software/hardware inventory
router.get('/inventory/:rustdesk_id', authenticateToken, (req, res) => {
    try {
        const inv = db.prepare('SELECT * FROM inventory WHERE rustdesk_id = ?').get(req.params.rustdesk_id);
        if (!inv) return res.json({ installed_apps: [] });

        // Parse JSON apps
        try { inv.installed_apps = JSON.parse(inv.installed_apps); } catch { inv.installed_apps = []; }

        res.json(inv);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/agent/queue-command — Admin queues a command for a device
router.post('/queue-command', authenticateToken, (req, res) => {
    try {
        const { rustdesk_id, command_string } = req.body;

        if (!rustdesk_id || !command_string) {
            return res.status(400).json({ error: 'rustdesk_id and command_string are required' });
        }

        if (!isCommandSafe(command_string)) {
            return res.status(403).json({ error: 'Command blocked by security policy. Destructive or excessively long commands are not allowed.' });
        }

        const result = db.prepare(`
            INSERT INTO remote_commands (rustdesk_id, command_string, queued_by)
            VALUES (?, ?, ?)
        `).run(rustdesk_id, command_string, req.user.id);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Command queued for execution' });
    } catch (err) {
        console.error('Queue command error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/agent/commands/:rustdesk_id — Command history for a device
router.get('/commands/:rustdesk_id', authenticateToken, (req, res) => {
    try {
        const commands = db.prepare(`
            SELECT rc.*, u.username as queued_by_name
            FROM remote_commands rc
            LEFT JOIN users u ON rc.queued_by = u.id
            WHERE rc.rustdesk_id = ?
            ORDER BY rc.queued_at DESC
            LIMIT 50
        `).all(req.params.rustdesk_id);

        res.json(commands);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// 1-CLICK STATION INSTALLER ENDPOINTS (DYNAMIC SITE APPLIANCE)
// ============================================

function buildWindowsAgentPs1(cfg) {
    const urlsPsArray = cfg.candidateUrls.map(u => `    "${u}"`).join(',\n');
    return `# RUSTDESK DASHBOARD APPLIANCE - UNIFIED RMM & HEARTBEAT AGENT (FAST 5s POLL)
$CandidateURLs = @(
${urlsPsArray}
)

function Get-RustDeskID {
    $paths = @(
        "C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Roaming\\RustDesk\\config\\RustDesk.toml",
        "C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\RustDesk\\config\\RustDesk.toml",
        "$env:APPDATA\\RustDesk\\config\\RustDesk.toml"
    )
    $userConfigs = Get-ChildItem "C:\\Users\\*\\AppData\\Roaming\\RustDesk\\config\\RustDesk.toml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    if ($userConfigs) { $paths += $userConfigs }

    foreach ($p in $paths) {
        if ($p -and (Test-Path $p -ErrorAction SilentlyContinue)) {
            $raw = Get-Content $p -Raw -ErrorAction SilentlyContinue
            if ($raw -match "id\\s*=\\s*'(\\d{7,12})'") {
                return $Matches[1]
            }
        }
    }

    $exePaths = @(
        "C:\\Program Files\\RustDesk\\rustdesk.exe",
        "C:\\Program Files (x86)\\RustDesk\\rustdesk.exe"
    )
    $runningExe = (Get-Process rustdesk -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1).Path
    if ($runningExe -and ($exePaths -notcontains $runningExe)) { $exePaths = @($runningExe) + $exePaths }

    foreach ($exe in $exePaths) {
        if (Test-Path $exe) {
            try {
                $idOut = (& $exe --get-id 2>$null | Out-String).Trim()
                if ($idOut -match '^\\d{7,12}$') { return $idOut }
            } catch {}
        }
    }
    return "WIN-$env:COMPUTERNAME"
}

function Get-ActiveHbbsPeerIPs {
    $ips = @()
    try {
        $lines = netstat -ano | Select-String ":21116\\s+.*ESTABLISHED"
        foreach ($m in $lines) {
            $parts = ($m.Line -replace '^\\s+', '') -split '\\s+'
            if ($parts.Count -ge 3 -and $parts[1] -like "*:21116") {
                $remoteIp = ($parts[2] -replace ':\\d+$', '') -replace '^\\[|\\]$', ''
                if ($remoteIp -and $remoteIp -ne "127.0.0.1" -and $remoteIp -ne "::1") {
                    $ips += $remoteIp
                }
            }
        }
    } catch {}
    return @($ips | Select-Object -Unique)
}

function Get-ActiveDashboardURL {
    foreach ($url in $CandidateURLs) {
        try {
            $res = Invoke-RestMethod -Uri "$url/api/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
            if ($res.status -eq "ok") { return $url }
        } catch {}
    }
    return $CandidateURLs[0]
}

function Get-InstalledApps {
    try {
        $regPaths = @(
            "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
            "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
        )
        $apps = Get-ItemProperty $regPaths -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName } |
            Select-Object -ExpandProperty DisplayName -Unique |
            Sort-Object
        return @($apps)
    } catch {
        return @()
    }
}

$RustDeskID = Get-RustDeskID
$Tick = 0

while ($true) {
    try {
        if ($RustDeskID -eq "UNKNOWN" -or $RustDeskID -like "WIN-*") {
            $RustDeskID = Get-RustDeskID
        }

        $DashboardURL = Get-ActiveDashboardURL
        $ActivePeerIPs = Get-ActiveHbbsPeerIPs

        # Full hardware & telemetry every 12 ticks (60s), fast command/script poll every 5s
        if ($Tick % 12 -eq 0) {
            $cs   = Get-CimInstance Win32_ComputerSystem
            $proc = Get-CimInstance Win32_Processor | Select-Object -First 1
            $os   = Get-CimInstance Win32_OperatingSystem
            $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"

            $totalRamMB = [math]::round($cs.TotalPhysicalMemory / 1MB)
            $freeRamMB  = [math]::round($os.FreePhysicalMemory / 1024)
            $ramUsage   = if ($totalRamMB -gt 0) { [math]::round((($totalRamMB - $freeRamMB) / $totalRamMB) * 100, 1) } else { 0 }

            $totalDiskGB = if ($disk.Size) { [math]::round($disk.Size / 1GB) } else { 0 }
            $diskUsage   = if ($disk.Size -gt 0) { [math]::round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1) } else { 0 }
            $cpuUsage    = if ($null -ne $proc.LoadPercentage) { [double]$proc.LoadPercentage } else { 0 }

            $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.InterfaceAlias -notmatch "vEthernet|Loopback" -and $_.IPAddress -notlike "169.254.*" } |
                Select-Object -First 1).IPAddress

            $payload = @{
                rustdesk_id     = $RustDeskID
                hostname        = $env:COMPUTERNAME
                ip_address      = $ip
                model           = $cs.Model
                cpu_model       = $proc.Name
                os_info         = $os.Caption
                total_ram_mb    = $totalRamMB
                disk_total_gb   = $totalDiskGB
                cpu_usage       = $cpuUsage
                ram_usage       = $ramUsage
                disk_usage      = $diskUsage
                active_peer_ips = $ActivePeerIPs
            }

            if ($Tick % 60 -eq 0) {
                $payload["installed_apps"] = Get-InstalledApps
            }
        } else {
            $payload = @{
                rustdesk_id     = $RustDeskID
                hostname        = $env:COMPUTERNAME
                active_peer_ips = $ActivePeerIPs
            }
        }

        $hbResponse = Invoke-RestMethod -Uri "$DashboardURL/api/agent/heartbeat" -Method Post -Body ($payload | ConvertTo-Json -Depth 4) -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop

        if ($hbResponse.commands -and $hbResponse.commands.Count -gt 0) {
            foreach ($cmd in $hbResponse.commands) {
                try {
                    $cmdOut = (Invoke-Expression $cmd.command_string 2>&1 | Out-String -Width 120).Trim()
                    if ([string]::IsNullOrWhiteSpace($cmdOut)) { $cmdOut = "Command completed successfully." }
                    $cmdStatus = "completed"
                } catch {
                    $cmdOut = $_.Exception.Message
                    $cmdStatus = "failed"
                }
                $cmdResult = @{ command_id = $cmd.id; status = $cmdStatus; result = $cmdOut }
                Invoke-RestMethod -Uri "$DashboardURL/api/agent/command-result" -Method Post -Body ($cmdResult | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue
            }
        }

        if ($hbResponse.script_jobs -and $hbResponse.script_jobs.Count -gt 0) {
            foreach ($job in $hbResponse.script_jobs) {
                try {
                    $output = (Invoke-Expression $job.code 2>&1 | Out-String -Width 120).Trim()
                    if ([string]::IsNullOrWhiteSpace($output)) { $output = "Script executed successfully (no console output)." }
                    $status = "success"
                } catch {
                    $output = $_.Exception.Message
                    $status = "failed"
                }
                $resultPayload = @{ status = $status; output_log = $output }
                Invoke-RestMethod -Uri "$DashboardURL/api/scripts/agent/$RustDeskID/result/$($job.job_id)" -Method Post -Body ($resultPayload | ConvertTo-Json) -ContentType "application/json" -ErrorAction SilentlyContinue
            }
        }
    } catch {}

    $Tick++
    Start-Sleep -Seconds 5
}
`;
}

function buildWindowsSetupPs1(cfg) {
    const agentPs1 = buildWindowsAgentPs1(cfg);
    const encodedPs = Buffer.from(agentPs1, 'utf8').toString('base64');
    const fallbackHost = cfg.secondaryHost || cfg.primaryHost;
    const relayHost = cfg.relayHost || cfg.primaryHost;
    const defaultPw = (cfg.defaultPassword || '').replace(/'/g, "''");
    return `
$ErrorActionPreference = 'SilentlyContinue'
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$InstallDir = if ($IsAdmin) { 'C:\\ProgramData\\RustDeskDashboard' } else { Join-Path $env:LOCALAPPDATA 'RustDeskDashboard' }
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$ScriptPath = Join-Path $InstallDir 'sync-inventory.ps1'
$Bytes = [Convert]::FromBase64String('${encodedPs}')
[IO.File]::WriteAllBytes($ScriptPath, $Bytes)
$UserDir = Join-Path $env:LOCALAPPDATA 'RustDeskDashboard'
if (Test-Path $UserDir) { [IO.File]::WriteAllBytes((Join-Path $UserDir 'sync-inventory.ps1'), $Bytes) }
Write-Host '[1/3] Installed RMM & Heartbeat Agent to ' $ScriptPath -ForegroundColor Green

$RDKey = '${cfg.rustdeskKey}'
$RDServer = '${cfg.primaryHost}'
$RDRelay = '${relayHost}'
try {
    $null = Invoke-RestMethod -Uri 'http://${cfg.primaryHost}:${cfg.dashboardPort}/api/health' -TimeoutSec 2 -ErrorAction Stop
} catch {
    if ('${fallbackHost}' -ne '') { $RDServer = '${fallbackHost}' }
}

$TomlPaths = @(
    "$env:APPDATA\\RustDesk\\config\\RustDesk2.toml",
    "C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Roaming\\RustDesk\\config\\RustDesk2.toml",
    "C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\RustDesk\\config\\RustDesk2.toml"
)
foreach ($tp in $TomlPaths) {
    $dir = Split-Path $tp -Parent
    if ($dir -and (Test-Path $dir)) {
        $content = "rendezvous_server = '$RDServer:21116'\`r\`nAlwaysUseRelay = 'N'\`r\`n\`r\`n[options]\`r\`ncustom-rendezvous-server = '$RDServer'\`r\`nrelay-server = '$RDRelay'\`r\`nkey = '$RDKey'\`r\`napprove-mode = 'password'\`r\`nverification-method = 'use-both-passwords'\`r\`naccess-mode = 'full'\`r\`n"
        Set-Content -Path $tp -Value $content -Force -ErrorAction SilentlyContinue
    }
}
if ('${defaultPw}' -ne '') {
    $rdExe = @("C:\\Program Files\\RustDesk\\rustdesk.exe", "C:\\Program Files (x86)\\RustDesk\\rustdesk.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($rdExe) { & $rdExe --password '${defaultPw}' 2>$null | Out-Null }
}
Write-Host "[2/3] Configured RustDesk server ($RDServer), relay ($RDRelay), key & unattended access." -ForegroundColor Green

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -like '*sync-inventory.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($IsAdmin) {
    netsh advfirewall firewall delete rule name='Docker LAN Port ${cfg.dashboardPort}' >$null 2>&1
    netsh advfirewall firewall add rule name='Docker LAN Port ${cfg.dashboardPort}' dir=in action=allow protocol=TCP localport=${cfg.dashboardPort} profile=Domain,Private,Public >$null 2>&1
    $Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"$ScriptPath\`""
    $Trigger = New-ScheduledTaskTrigger -AtStartup
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'RustDeskDashboardHeartbeat' -Action $Action -Trigger $Trigger -Settings $Settings -User 'NT AUTHORITY\\SYSTEM' -RunLevel Highest -Force | Out-Null
    Start-ScheduledTask -TaskName 'RustDeskDashboardHeartbeat'
    Write-Host '[3/3] Registered & started SYSTEM-level RMM Agent (Full Admin Privileges)!' -ForegroundColor Cyan
} else {
    $StartupDir = [Environment]::GetFolderPath('Startup')
    $VbsPath = Join-Path $StartupDir 'RustDeskDashboardAgent.vbs'
    $VbsContent = "Set WshShell = CreateObject(\`"WScript.Shell\`")\`r\`nWshShell.Run \`"powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"\`"$ScriptPath\`"\`"\`", 0, False"
    Set-Content -Path $VbsPath -Value $VbsContent -Force
    Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "wscript.exe \`"$VbsPath\`"" } | Out-Null
    Write-Host '[3/3] Started background RMM Agent & enabled Windows auto-start!' -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'SUCCESS! Station is connected to ${cfg.siteName} and polling for RMM scripts every 5 seconds.' -ForegroundColor Green
`;
}

// GET /api/agent/agent.ps1 — Serves the PowerShell heartbeat daemon script
router.get('/agent.ps1', (req, res) => {
    const cfg = resolveApplianceConfig(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildWindowsAgentPs1(cfg).replace(/\r?\n/g, '\r\n'));
});

// GET /api/agent/onboard.ps1 — Serves 1-line Windows PowerShell onboarding (`irm http://<IP>:3031/api/agent/onboard.ps1 | iex`)
router.get('/onboard.ps1', (req, res) => {
    const cfg = resolveApplianceConfig(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildWindowsSetupPs1(cfg).replace(/\r?\n/g, '\r\n'));
});

// GET /api/agent/installer.bat — Downloads the 1-Click Windows Station Setup (.bat)
router.get('/installer.bat', (req, res) => {
    const cfg = resolveApplianceConfig(req);
    const setupPs = buildWindowsSetupPs1(cfg);
    const encodedSetup = Buffer.from(setupPs, 'utf16le').toString('base64');
    const batLines = [
        '@echo off',
        `title ${cfg.siteName} - 1-Click Station Setup`,
        'net session >nul 2>&1',
        'if %errorLevel% neq 0 (',
        '    if "%1" neq "elevated" (',
        '        echo Requesting Administrator privileges for RMM Script Deployment...',
        '        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath \'%~f0\' -ArgumentList \'elevated\' -Verb RunAs } catch { Start-Process -FilePath \'%~f0\' -ArgumentList \'elevated\' }"',
        '        exit /b',
        '    )',
        ')',
        'echo ========================================================',
        `echo   ${cfg.siteName} - 1-Click Station ^& RMM Agent`,
        'echo ========================================================',
        'echo.',
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedSetup}`,
        'echo.',
        'pause'
    ];
    res.setHeader('Content-Type', 'application/bat');
    res.setHeader('Content-Disposition', 'attachment; filename="Connect-Station.bat"');
    res.send(batLines.join('\r\n'));
});

// ============================================
// LINUX / CROSS-OS 1-CLICK AGENT & WAYLAND SETUP
// ============================================

function buildLinuxAgentPy(cfg) {
    const urlsPyList = cfg.candidateUrls.map(u => `    "${u}",`).join('\n');
    return `#!/usr/bin/env python3
"""
RustDesk Dashboard Appliance — Zero-Dependency Linux RMM & Heartbeat Agent (5s Fast Poll)
Works out-of-the-box with standard Python 3 on Ubuntu, Debian, Fedora, RHEL/Rocky, Arch, etc.
"""
import glob
import json
import os
import platform
import re
import socket
import subprocess
import time
import urllib.request

CANDIDATE_URLS = [
${urlsPyList}
]

def get_rustdesk_id():
    paths = (
        glob.glob("/root/.config/rustdesk/RustDesk.toml")
        + glob.glob("/home/*/.config/rustdesk/RustDesk.toml")
        + glob.glob("/var/lib/rustdesk/RustDesk.toml")
    )
    for p in paths:
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                m = re.search(r"id\\s*=\\s*'(\\d{7,12})'", f.read())
                if m:
                    return m.group(1)
        except Exception:
            pass
    try:
        out = subprocess.check_output(["rustdesk", "--get-id"], stderr=subprocess.DEVNULL, timeout=5).decode().strip()
        if re.match(r"^\\d{7,12}$", out):
            return out
    except Exception:
        pass
    return "UNKNOWN"

def get_active_url():
    for url in CANDIDATE_URLS:
        try:
            req = urllib.request.Request(f"{url}/api/health", method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                if data.get("status") == "ok":
                    return url
        except Exception:
            pass
    return CANDIDATE_URLS[0]

def get_linux_telemetry():
    cpu_usage = 0.0
    try:
        with open("/proc/stat", "r") as f:
            fields1 = [float(x) for x in f.readline().split()[1:]]
        time.sleep(0.5)
        with open("/proc/stat", "r") as f:
            fields2 = [float(x) for x in f.readline().split()[1:]]
        idle1, total1 = fields1[3], sum(fields1)
        idle2, total2 = fields2[3], sum(fields2)
        if total2 - total1 > 0:
            cpu_usage = round((1.0 - (idle2 - idle1) / (total2 - total1)) * 100.0, 1)
    except Exception:
        pass

    total_ram_mb = 0
    ram_usage = 0.0
    try:
        mem = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
        total_kb = mem.get("MemTotal", 0)
        avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
        total_ram_mb = round(total_kb / 1024)
        if total_kb > 0:
            ram_usage = round(((total_kb - avail_kb) / total_kb) * 100.0, 1)
    except Exception:
        pass

    disk_total_gb = 0
    disk_usage = 0.0
    try:
        st = os.statvfs("/")
        total_b = st.f_blocks * st.f_frsize
        free_b = st.f_bavail * st.f_frsize
        disk_total_gb = round(total_b / (1024 ** 3))
        if total_b > 0:
            disk_usage = round(((total_b - free_b) / total_b) * 100.0, 1)
    except Exception:
        pass

    os_info = f"Linux {platform.release()}"
    try:
        with open("/etc/os-release", "r") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    os_info = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass

    cpu_model = platform.processor() or "Linux CPU"
    try:
        with open("/proc/cpuinfo", "r") as f:
            for line in f:
                if "model name" in line:
                    cpu_model = line.split(":", 1)[1].strip()
                    break
    except Exception:
        pass

    model = "Linux Workstation"
    for dmi_path in ["/sys/class/dmi/id/product_name", "/sys/devices/virtual/dmi/id/product_name"]:
        try:
            if os.path.exists(dmi_path):
                with open(dmi_path, "r") as f:
                    val = f.read().strip()
                    if val:
                        model = val
                        break
        except Exception:
            pass

    ip_address = ""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip_address = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    return {
        "hostname": socket.gethostname(),
        "ip_address": ip_address,
        "model": model,
        "cpu_model": cpu_model,
        "os_info": os_info,
        "total_ram_mb": total_ram_mb,
        "disk_total_gb": disk_total_gb,
        "cpu_usage": cpu_usage,
        "ram_usage": ram_usage,
        "disk_usage": disk_usage,
    }

def get_installed_apps():
    for cmd in [
        "dpkg-query -W -f='\${binary:Package}\\n' 2>/dev/null | head -n 200",
        "rpm -qa --qf '%{NAME}\\n' 2>/dev/null | sort | head -n 200",
    ]:
        try:
            out = subprocess.check_output(cmd, shell=True, text=True, timeout=15).strip()
            if out:
                return [x.strip() for x in out.splitlines() if x.strip()]
        except Exception:
            pass
    return []

def run_cross_os_code(code):
    """Executes shell code on Linux, auto-translating built-in Windows PowerShell scripts if dispatched to Linux."""
    stripped = code.strip()
    if "ipconfig /flushdns" in stripped:
        cmd = "resolvectl flush-caches 2>/dev/null || systemd-resolve --flush-caches 2>/dev/null || service nscd restart 2>/dev/null || echo 'DNS cache flushed (Linux)'"
    elif "Get-Process" in stripped and "Sort-Object CPU" in stripped:
        cmd = "ps aux --sort=-%cpu | head -n 11"
    elif "win32_bios" in stripped.lower():
        cmd = "echo '=== BIOS & SERIAL ==='; cat /sys/class/dmi/id/product_serial 2>/dev/null || dmidecode -s system-serial-number 2>/dev/null || hostnamectl; echo ''; echo '=== MEMORY ==='; free -h"
    elif "Win32_Product" in stripped or "Win32_OperatingSystem" in stripped:
        cmd = "hostnamectl; echo ''; lscpu | head -n 20; echo ''; free -h; echo ''; df -h /"
    elif "Remove-Item" in stripped and "Temp" in stripped:
        cmd = "echo '=== CLEANING LINUX TEMP & CACHE ==='; rm -rf /tmp/* /var/tmp/* 2>/dev/null; journalctl --vacuum-time=3d 2>/dev/null; apt-get clean 2>/dev/null || dnf clean all 2>/dev/null || true; echo 'Linux cleanup completed.'"
    elif command_exists("pwsh") and ("Get-" in stripped or "Write-Output" in stripped):
        cmd = f"pwsh -NoProfile -NonInteractive -Command {json.dumps(stripped)}"
    else:
        cmd = stripped

    proc = subprocess.run(cmd, shell=True, executable="/bin/bash", capture_output=True, text=True, timeout=120)
    output = (proc.stdout or "") + ("\\n" + proc.stderr if proc.stderr else "")
    return proc.returncode == 0, output.strip() or "Command executed successfully (no console output)."

def command_exists(name):
    return subprocess.call(["which", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0

def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    rustdesk_id = get_rustdesk_id()
    tick = 0
    while True:
        try:
            if rustdesk_id == "UNKNOWN":
                rustdesk_id = get_rustdesk_id()
                if rustdesk_id == "UNKNOWN":
                    time.sleep(5)
                    continue

            dashboard_url = get_active_url()
            if tick % 12 == 0:
                payload = get_linux_telemetry()
                payload["rustdesk_id"] = rustdesk_id
                if tick % 60 == 0:
                    payload["installed_apps"] = get_installed_apps()
            else:
                payload = {
                    "rustdesk_id": rustdesk_id,
                    "hostname": socket.gethostname(),
                }

            hb = post_json(f"{dashboard_url}/api/agent/heartbeat", payload)

            for cmd in hb.get("commands") or []:
                try:
                    ok, out = run_cross_os_code(cmd.get("command_string", ""))
                    status = "completed" if ok else "failed"
                except Exception as e:
                    out = str(e)
                    status = "failed"
                try:
                    post_json(f"{dashboard_url}/api/agent/command-result", {
                        "command_id": cmd.get("id"),
                        "status": status,
                        "result": out,
                    })
                except Exception:
                    pass

            for job in hb.get("script_jobs") or []:
                try:
                    ok, out = run_cross_os_code(job.get("code", ""))
                    status = "success" if ok else "failed"
                except Exception as e:
                    out = str(e)
                    status = "failed"
                try:
                    post_json(f"{dashboard_url}/api/scripts/agent/{rustdesk_id}/result/{job.get('job_id')}", {
                        "status": status,
                        "output_log": out,
                    })
                except Exception:
                    pass
        except Exception:
            pass

        tick += 1
        time.sleep(5)

if __name__ == "__main__":
    main()
`;
}

// GET /api/agent/agent.py — Serves the Linux / Cross-OS Python heartbeat daemon
router.get('/agent.py', (req, res) => {
    const cfg = resolveApplianceConfig(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildLinuxAgentPy(cfg).replace(/\r\n/g, '\n'));
});

// GET /api/agent/installer.sh — Downloads the 1-Click Linux Station + Unattended Wayland/Xorg Setup (.sh)
router.get('/installer.sh', (req, res) => {
    const cfg = resolveApplianceConfig(req);
    const linuxAgentPy = buildLinuxAgentPy(cfg);
    const encodedPy = Buffer.from(linuxAgentPy.replace(/\r\n/g, '\n'), 'utf8').toString('base64');
    const fallbackHost = cfg.secondaryHost || cfg.primaryHost;
    const relayHost = cfg.relayHost || cfg.primaryHost;
    const defaultPw = (cfg.defaultPassword || '').replace(/"/g, '\\"');
    const shLines = [
        '#!/usr/bin/env bash',
        '# ==============================================================================',
        `# ${cfg.siteName} - 1-Click Linux Station & Unattended Wayland/Xorg Setup`,
        '# ==============================================================================',
        'set -e',
        '',
        'if [ "$EUID" -ne 0 ]; then',
        '    echo "Requesting sudo privileges for Linux Station & Wayland Unattended Setup..."',
        '    exec sudo bash "$0" "$@"',
        'fi',
        '',
        'echo "================================================================"',
        `echo "  ${cfg.siteName} - 1-Click Linux Station & Wayland Setup"`,
        'echo "================================================================"',
        '',
        `RD_KEY="${cfg.rustdeskKey}"`,
        `RD_SERVER="${cfg.primaryHost}"`,
        `RD_RELAY="${relayHost}"`,
        `DEFAULT_PW="${defaultPw}"`,
        `if ! curl -fsS --connect-timeout 2 "http://${cfg.primaryHost}:${cfg.dashboardPort}/api/health" >/dev/null 2>&1; then`,
        `    if [ -n "${fallbackHost}" ]; then RD_SERVER="${fallbackHost}"; fi`,
        'fi',
        '',
        '# 1. Configure Unattended Access & Wayland/Xorg permissions',
        'echo "[1/4] Configuring Unattended Access & Wayland/Xorg display permissions..."',
        '',
        'for gdm_conf in /etc/gdm3/custom.conf /etc/gdm/custom.conf /etc/gdm3/daemon.conf; do',
        '    if [ -f "$gdm_conf" ]; then',
        '        if grep -q "^#*WaylandEnable=" "$gdm_conf"; then',
        '            sed -i "s/^#*WaylandEnable=.*/WaylandEnable=false/" "$gdm_conf"',
        '        elif grep -q "\\[daemon\\]" "$gdm_conf"; then',
        '            sed -i "/\\[daemon\\]/a WaylandEnable=false" "$gdm_conf"',
        '        else',
        '            printf "\\n[daemon]\\nWaylandEnable=false\\n" >> "$gdm_conf"',
        '        fi',
        '        echo "  -> Disabled Wayland prompt requirement in $gdm_conf (WaylandEnable=false)"',
        '    fi',
        'done',
        '',
        'if [ -d /etc/polkit-1/rules.d ]; then',
        '    cat << \'EOF\' > /etc/polkit-1/rules.d/49-rustdesk-unattended.rules',
        'polkit.addRule(function(action, subject) {',
        '    if (action.id.indexOf("org.freedesktop.Flatpak") === 0 ||',
        '        action.id.indexOf("org.freedesktop.portal") === 0 ||',
        '        action.id.indexOf("org.gnome.remotedesktop") === 0 ||',
        '        action.id.indexOf("com.rustdesk") === 0) {',
        '        return polkit.Result.YES;',
        '    }',
        '});',
        'EOF',
        'fi',
        '',
        '# 2. Write RustDesk Server, Key, and Unattended Password Approval Config',
        'echo "[2/4] Configuring RustDesk Server ($RD_SERVER), Relay ($RD_RELAY), Key & Unattended mode..."',
        'TOML_CONTENT="rendezvous_server = \'${RD_SERVER}:21116\'',
        'AlwaysUseRelay = \'N\'',
        '',
        '[options]',
        'custom-rendezvous-server = \'${RD_SERVER}\'',
        'relay-server = \'${RD_RELAY}\'',
        'key = \'${RD_KEY}\'',
        'approve-mode = \'password\'',
        'verification-method = \'use-both-passwords\'',
        'access-mode = \'full\'',
        'allow-linux-headless = \'Y\'',
        'enable-wayland = \'Y\'',
        'enable-keyboard = \'Y\'',
        'enable-clipboard = \'Y\'',
        'enable-file-transfer = \'Y\'',
        '"',
        '',
        'mkdir -p /root/.config/rustdesk',
        'printf "%s" "$TOML_CONTENT" > /root/.config/rustdesk/RustDesk2.toml',
        'for user_home in /home/*; do',
        '    if [ -d "$user_home" ]; then',
        '        u_name=$(basename "$user_home")',
        '        mkdir -p "$user_home/.config/rustdesk"',
        '        printf "%s" "$TOML_CONTENT" > "$user_home/.config/rustdesk/RustDesk2.toml"',
        '        chown -R "$u_name:$u_name" "$user_home/.config/rustdesk" 2>/dev/null || true',
        '    fi',
        'done',
        '',
        'PW_TO_SET="${1:-$DEFAULT_PW}"',
        'if [ -n "$PW_TO_SET" ]; then',
        '    rustdesk --password "$PW_TO_SET" >/dev/null 2>&1 || true',
        '    echo "  -> Applied permanent unattended password."',
        'fi',
        '',
        'systemctl enable rustdesk >/dev/null 2>&1 || true',
        'systemctl restart rustdesk >/dev/null 2>&1 || true',
        '',
        '# 3. Install 5-Second Fast-Polling Linux RMM Agent',
        'echo "[3/4] Installing RustDesk Dashboard RMM Agent to /opt/rustdesk-dashboard/agent.py..."',
        'mkdir -p /opt/rustdesk-dashboard',
        `echo "${encodedPy}" | base64 -d > /opt/rustdesk-dashboard/agent.py`,
        'chmod +x /opt/rustdesk-dashboard/agent.py',
        '',
        '# 4. Register & Start systemd service',
        'echo "[4/4] Registering systemd service (rustdesk-dashboard-agent.service)..."',
        'cat << \'EOF\' > /etc/systemd/system/rustdesk-dashboard-agent.service',
        '[Unit]',
        'Description=RustDesk Dashboard RMM & Heartbeat Agent',
        'After=network-online.target',
        'Wants=network-online.target',
        '',
        '[Service]',
        'Type=simple',
        'User=root',
        'ExecStart=/usr/bin/env python3 /opt/rustdesk-dashboard/agent.py',
        'Restart=always',
        'RestartSec=5',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        'EOF',
        '',
        'systemctl daemon-reload',
        'systemctl enable rustdesk-dashboard-agent.service >/dev/null 2>&1',
        'systemctl restart rustdesk-dashboard-agent.service',
        '',
        'echo ""',
        `echo "SUCCESS! Linux station is connected to ${cfg.siteName}, polling for RMM scripts every 5s,"`,
        'echo "and configured for Unattended Access (no manual Allow prompt required)."',
        'echo "Note: If currently running a Wayland desktop session, reboot once to activate Xorg unattended login."'
    ];
    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Connect-Station.sh"');
    res.send(shLines.join('\n') + '\n');
});

module.exports = router;

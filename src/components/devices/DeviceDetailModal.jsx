import { useState, useEffect, useRef } from 'react';
import { X, Monitor, Terminal, Laptop, ExternalLink, Edit3, Save, Activity, Package, TerminalSquare, Send, RefreshCw, Trash2, Tag } from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatTimeAgo, formatBytes, formatDateTime, formatDuration } from '../../utils/helpers';

function OsDetailIcon({ os }) {
    if (!os) return <Monitor size={28} />;
    const lower = os.toLowerCase();
    if (lower.includes('linux')) return <Terminal size={28} />;
    if (lower.includes('mac')) return <Laptop size={28} />;
    return <Monitor size={28} />;
}

function getOsClass(os) {
    if (!os) return 'windows';
    const lower = os.toLowerCase();
    if (lower.includes('linux')) return 'linux';
    if (lower.includes('mac')) return 'macos';
    return 'windows';
}

// Mini chart component for telemetry sparklines
function SparklineChart({ data, dataKey, color, label }) {
    if (!data || data.length === 0) return null;
    const max = 100;
    const width = 280;
    const height = 50;
    const padding = 2;
    const stepX = (width - padding * 2) / Math.max(data.length - 1, 1);

    const points = data.map((d, i) => {
        const x = padding + i * stepX;
        const y = height - padding - ((d[dataKey] || 0) / max) * (height - padding * 2);
        return `${x},${y}`;
    }).join(' ');

    const latest = data[data.length - 1][dataKey] || 0;
    const latestColor = latest > 90 ? '#ef4444' : latest > 70 ? '#f59e0b' : color;

    return (
        <div className="sparkline-container">
            <div className="sparkline-header">
                <span className="sparkline-label">{label}</span>
                <span className="sparkline-value" style={{ color: latestColor }}>{latest.toFixed(1)}%</span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="sparkline-svg">
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                />
                <circle
                    cx={padding + (data.length - 1) * stepX}
                    cy={height - padding - (latest / max) * (height - padding * 2)}
                    r="3"
                    fill={latestColor}
                />
            </svg>
        </div>
    );
}

export default function DeviceDetailModal({ device, groups, onClose, onUpdate, onConnect, onDelete }) {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState({});
    const [activeTab, setActiveTab] = useState('info');
    const [telemetry, setTelemetry] = useState([]);
    const [inventory, setInventory] = useState(null);
    const [commands, setCommands] = useState([]);
    const [commandInput, setCommandInput] = useState('');
    const [sendingCommand, setSendingCommand] = useState(false);
    const terminalEndRef = useRef(null);
    const { addToast } = useToast();

    useEffect(() => {
        if (device?.id) {
            setLoading(true);
            api.getDevice(device.id)
                .then(data => {
                    setDetails(data);
                    setEditData({
                        alias: data.alias || '',
                        notes: data.notes || '',
                        tags: data.tags || '',
                        group_id: data.group_id || '',
                        model: data.model || '',
                        os: data.os || '',
                        cpu: data.cpu || '',
                        ram_mb: data.ram_mb || '',
                        disk_gb: data.disk_gb || ''
                    });
                    setLoading(false);
                })
                .catch(err => {
                    addToast('Failed to load device details', 'error');
                    setLoading(false);
                });
        }
    }, [device?.id]);

    // Load tab-specific data when switching
    useEffect(() => {
        if (!details?.rustdesk_id) return;
        const rid = details.rustdesk_id;

        if (activeTab === 'health') {
            api.getDeviceTelemetry(rid).then(setTelemetry).catch(() => setTelemetry([]));
            // Auto refresh every 15s
            const interval = setInterval(() => {
                api.getDeviceTelemetry(rid).then(setTelemetry).catch(() => {});
            }, 15000);
            return () => clearInterval(interval);
        }
        if (activeTab === 'inventory') {
            api.getDeviceInventory(rid).then(setInventory).catch(() => setInventory(null));
        }
        if (activeTab === 'shell') {
            api.getCommandHistory(rid).then(setCommands).catch(() => setCommands([]));
            const interval = setInterval(() => {
                api.getCommandHistory(rid).then(setCommands).catch(() => {});
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab, details?.rustdesk_id]);

    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [commands]);

    const handleSave = async () => {
        try {
            const payload = {
                ...editData,
                ram_mb: editData.ram_mb ? parseInt(editData.ram_mb) || 0 : undefined,
                disk_gb: editData.disk_gb ? parseInt(editData.disk_gb) || 0 : undefined,
            };
            const updated = await api.updateDevice(device.id, payload);
            setDetails(prev => ({ ...prev, ...updated }));
            onUpdate?.(updated);
            setEditing(false);
            addToast('Device updated successfully', 'success');
        } catch (err) {
            addToast('Failed to update device', 'error');
        }
    };

    const handleSendCommand = async (e) => {
        e.preventDefault();
        if (!commandInput.trim() || !details?.rustdesk_id) return;
        setSendingCommand(true);
        try {
            await api.queueCommand(details.rustdesk_id, commandInput.trim());
            addToast('Command queued', 'success');
            setCommandInput('');
            // Refresh history
            const updated = await api.getCommandHistory(details.rustdesk_id);
            setCommands(updated);
        } catch (err) {
            addToast(err.message || 'Failed to queue command', 'error');
        } finally {
            setSendingCommand(false);
        }
    };

    if (!device) return null;

    const tabs = [
        { id: 'info', label: 'Details', icon: Monitor },
        { id: 'health', label: 'Health', icon: Activity },
        { id: 'inventory', label: 'Inventory', icon: Package },
        { id: 'shell', label: 'Remote Shell', icon: TerminalSquare },
    ];

    const detailTags = details?.tags ? details.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h3 className="modal-title">Device Details</h3>
                    <button className="btn-icon" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Tab Navigation */}
                <div className="modal-tabs" style={{ display: 'flex', gap: '2px', padding: '0 20px', background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`modal-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px',
                                color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                transition: 'all 0.2s',
                            }}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div className="loader"><div className="spinner" /></div>
                    ) : details ? (
                        <>
                            {/* Device Header (always visible) */}
                            <div className="device-detail-header">
                                <div className={`device-detail-icon ${getOsClass(details.os)}`}>
                                    <OsDetailIcon os={details.os} />
                                </div>
                                <div className="device-detail-info" style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                        <h2>{details.alias || details.hostname}</h2>
                                        <span className={`status-badge ${details.status}`}>
                                            <span className="status-dot" />
                                            {details.status}
                                        </span>
                                    </div>
                                    <p>{details.rustdesk_id} • {details.hostname}</p>
                                </div>
                            </div>

                            {/* TAB: Info */}
                            {activeTab === 'info' && (
                                <>
                                    {editing ? (
                                        <div style={{ marginBottom: '20px' }}>
                                            <div className="form-group">
                                                <label className="form-label">Alias</label>
                                                <input className="form-input" value={editData.alias} onChange={e => setEditData(p => ({ ...p, alias: e.target.value }))} placeholder="Device alias..." />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Model</label>
                                                <input className="form-input" value={editData.model || ''} onChange={e => setEditData(p => ({ ...p, model: e.target.value }))} placeholder="e.g. Dell OptiPlex..." />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                <div className="form-group">
                                                    <label className="form-label">OS</label>
                                                    <input className="form-input" value={editData.os || ''} onChange={e => setEditData(p => ({ ...p, os: e.target.value }))} placeholder="e.g. Windows 11" />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">CPU</label>
                                                    <input className="form-input" value={editData.cpu || ''} onChange={e => setEditData(p => ({ ...p, cpu: e.target.value }))} placeholder="e.g. Intel i7" />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">RAM (MB)</label>
                                                    <input type="number" className="form-input" value={editData.ram_mb || ''} onChange={e => setEditData(p => ({ ...p, ram_mb: e.target.value }))} placeholder="16384" />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Disk (GB)</label>
                                                    <input type="number" className="form-input" value={editData.disk_gb || ''} onChange={e => setEditData(p => ({ ...p, disk_gb: e.target.value }))} placeholder="512" />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Group</label>
                                                <select className="form-select" value={editData.group_id || ''} onChange={e => setEditData(p => ({ ...p, group_id: e.target.value ? parseInt(e.target.value) : null }))}>
                                                    <option value="">No Group</option>
                                                    {groups?.map(g => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Tags (comma separated)</label>
                                                <input className="form-input" value={editData.tags || ''} onChange={e => setEditData(p => ({ ...p, tags: e.target.value }))} placeholder="e.g. priority, laptop, remote" />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Notes</label>
                                                <textarea className="form-input" rows={3} value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} placeholder="Add notes..." />
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn btn-primary btn-sm" onClick={handleSave}><Save size={14} /> Save</button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="device-detail-grid">
                                            <div className="device-detail-item">
                                                <label>IP Address</label>
                                                <span>{details.ip_address || '—'}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>MAC Address</label>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{details.mac_address || '—'}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Operating System</label>
                                                <span>{details.os} {details.os_version}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Processor</label>
                                                <span style={{ fontSize: '0.8rem' }}>{details.cpu || '—'}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Memory</label>
                                                <span>{formatBytes(details.ram_mb)}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Storage</label>
                                                <span>{details.disk_gb ? `${details.disk_gb} GB` : '—'}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Last Seen</label>
                                                <span>{formatTimeAgo(details.last_seen)}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Model</label>
                                                <span>{details.model || 'Unknown'}</span>
                                            </div>
                                            <div className="device-detail-item">
                                                <label>Group</label>
                                                <span>{details.group_name || 'Unassigned'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {detailTags.length > 0 && !editing && (
                                        <div style={{ marginBottom: '20px' }}>
                                            <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Tags</label>
                                            <div className="tag-list">
                                                {detailTags.map((tag, i) => (
                                                    <span key={i} className="tag-badge">
                                                        <Tag size={10} />
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {details.notes && !editing && (
                                        <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)' }}>
                                            <label className="form-label" style={{ marginBottom: '4px' }}>Notes</label>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{details.notes}</p>
                                        </div>
                                    )}

                                    {details.recentConnections?.length > 0 && (
                                        <div>
                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-secondary)' }}>Recent Connections</h4>
                                            <div className="table-container">
                                                <table className="data-table">
                                                    <thead><tr><th>User</th><th>When</th><th>Duration</th><th>Status</th></tr></thead>
                                                    <tbody>
                                                        {details.recentConnections.slice(0, 5).map(conn => (
                                                            <tr key={conn.id}>
                                                                <td>{conn.user_name || conn.username}</td>
                                                                <td>{formatTimeAgo(conn.started_at)}</td>
                                                                <td>{formatDuration(conn.duration_seconds)}</td>
                                                                <td><span className={`status-badge ${conn.status}`}>{conn.status.replace('_', ' ')}</span></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* TAB: Health */}
                            {activeTab === 'health' && (
                                <div className="health-tab">
                                    {telemetry.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '40px 0' }}>
                                            <Activity size={48} opacity={0.2} />
                                            <h3>No telemetry data</h3>
                                            <p>Run the Python agent on this machine to start collecting CPU, RAM, and Disk metrics.</p>
                                        </div>
                                    ) : (
                                        <div className="sparkline-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0' }}>
                                            <SparklineChart data={telemetry} dataKey="cpu_usage" color="#6366f1" label="CPU Usage" />
                                            <SparklineChart data={telemetry} dataKey="ram_usage" color="#06b6d4" label="Memory Usage" />
                                            <SparklineChart data={telemetry} dataKey="disk_usage" color="#8b5cf6" label="Disk Usage" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB: Inventory */}
                            {activeTab === 'inventory' && (
                                <div className="inventory-tab">
                                    {!inventory ? (
                                        <div className="empty-state" style={{ padding: '40px 0' }}>
                                            <Package size={48} opacity={0.2} />
                                            <h3>No inventory data</h3>
                                            <p>The Python agent will populate this with OS info and installed applications.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="device-detail-grid" style={{ marginBottom: '20px' }}>
                                                <div className="device-detail-item"><label>OS Info</label><span>{inventory.os_info || '—'}</span></div>
                                                <div className="device-detail-item"><label>CPU Model</label><span>{inventory.cpu_model || '—'}</span></div>
                                                <div className="device-detail-item"><label>Total RAM</label><span>{inventory.total_ram_mb ? `${Math.round(inventory.total_ram_mb / 1024)} GB` : '—'}</span></div>
                                                <div className="device-detail-item"><label>Disk Size</label><span>{inventory.disk_total_gb ? `${inventory.disk_total_gb} GB` : '—'}</span></div>
                                                <div className="device-detail-item"><label>Last Updated</label><span>{formatTimeAgo(inventory.last_updated)}</span></div>
                                            </div>

                                            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-secondary)' }}>
                                                Installed Applications ({Array.isArray(inventory.installed_apps) ? inventory.installed_apps.length : 0})
                                            </h4>
                                            <div className="app-list" style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '8px' }}>
                                                {Array.isArray(inventory.installed_apps) && inventory.installed_apps.length > 0 ? (
                                                    inventory.installed_apps.map((app, i) => (
                                                        <div key={i} style={{
                                                            padding: '6px 10px', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                            color: 'var(--text-secondary)'
                                                        }}>
                                                            {typeof app === 'string' ? app : app.name || JSON.stringify(app)}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No applications reported yet.</p>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* TAB: Remote Shell */}
                            {activeTab === 'shell' && (
                                <div className="shell-tab">
                                    <div className="terminal-window" style={{
                                        background: '#0d1117', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
                                        display: 'flex', flexDirection: 'column', maxHeight: '400px', overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <span style={{ fontSize: '0.75rem', color: '#8b949e', fontFamily: 'var(--font-mono)' }}>
                                                {details.rustdesk_id}@{details.hostname || 'remote'}
                                            </span>
                                            <button className="btn-icon sm" onClick={() => {
                                                api.getCommandHistory(details.rustdesk_id).then(setCommands).catch(() => {});
                                            }} title="Refresh"><RefreshCw size={12} /></button>
                                        </div>

                                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                            {commands.length === 0 ? (
                                                <div style={{ color: '#8b949e', padding: '20px 0', textAlign: 'center' }}>
                                                    No commands executed yet. Type a command below to get started.
                                                </div>
                                            ) : (
                                                [...commands].reverse().map(cmd => (
                                                    <div key={cmd.id} style={{ marginBottom: '16px' }}>
                                                        <div style={{ color: '#58a6ff', marginBottom: '4px' }}>
                                                            <span style={{ color: '#3fb950' }}>$</span> {cmd.command_string}
                                                        </div>
                                                        {cmd.status === 'pending' && (
                                                            <div style={{ color: '#d29922', fontSize: '0.75rem' }}>⏳ Waiting for agent to pick up...</div>
                                                        )}
                                                        {cmd.status === 'running' && (
                                                            <div style={{ color: '#d29922', fontSize: '0.75rem' }}>⚡ Running on machine...</div>
                                                        )}
                                                        {(cmd.status === 'completed' || cmd.status === 'failed') && (
                                                            <pre style={{
                                                                color: cmd.status === 'failed' ? '#f85149' : '#c9d1d9',
                                                                margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                                                background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px',
                                                                fontSize: '0.75rem', lineHeight: '1.5',
                                                            }}>
                                                                {cmd.result || '(no output)'}
                                                            </pre>
                                                        )}
                                                        <div style={{ fontSize: '0.65rem', color: '#484f58', marginTop: '2px' }}>
                                                            {cmd.queued_by_name} • {formatTimeAgo(cmd.queued_at)}
                                                            {cmd.status === 'completed' && cmd.executed_at && ` • executed ${formatTimeAgo(cmd.executed_at)}`}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            <div ref={terminalEndRef} />
                                        </div>

                                        <form onSubmit={handleSendCommand} style={{
                                            display: 'flex', gap: '8px', padding: '10px 12px',
                                            borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)'
                                        }}>
                                            <span style={{ color: '#3fb950', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: '34px' }}>$</span>
                                            <input
                                                type="text"
                                                value={commandInput}
                                                onChange={e => setCommandInput(e.target.value)}
                                                placeholder="Type a command..."
                                                disabled={sendingCommand}
                                                style={{
                                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                                    color: '#c9d1d9', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                                                }}
                                            />
                                            <button
                                                type="submit"
                                                disabled={sendingCommand || !commandInput.trim()}
                                                className="btn btn-primary btn-sm"
                                                style={{ padding: '6px 12px' }}
                                            >
                                                <Send size={14} />
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <p>Failed to load device details.</p>
                    )}
                </div>

                <div className="modal-footer">
                    {!editing && activeTab === 'info' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                            <Edit3 size={14} /> Edit
                        </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => onDelete?.(details)} style={{ marginRight: 'auto' }}>
                        <Trash2 size={14} /> Delete
                    </button>
                    <button className="btn btn-connect btn-sm" onClick={() => onConnect?.(details)}>
                        <ExternalLink size={14} /> Connect
                    </button>
                </div>
            </div>
        </div>
    );
}

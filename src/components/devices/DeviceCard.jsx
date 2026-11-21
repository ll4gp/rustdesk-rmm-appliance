import { useState, useEffect } from 'react';
import { Monitor, Terminal, Laptop, Cpu, HardDrive, Globe, Clock, Activity, Tag } from 'lucide-react';
import { formatTimeAgo } from '../../utils/helpers';
import api from '../../utils/api';

function OsIcon({ os }) {
    if (!os) return <Monitor size={16} />;
    const lower = os.toLowerCase();
    if (lower.includes('linux')) return <Terminal size={16} />;
    if (lower.includes('mac')) return <Laptop size={16} />;
    return <Monitor size={16} />;
}

function HealthBar({ label, value, color }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : color;
    return (
        <div className="health-bar-item" title={`${label}: ${pct.toFixed(0)}%`}>
            <span className="health-bar-label">{label}</span>
            <div className="health-bar-track">
                <div className="health-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="health-bar-value">{pct.toFixed(0)}%</span>
        </div>
    );
}

export default function DeviceCard({ device, onClick, onConnect }) {
    const [telemetry, setTelemetry] = useState(null);

    useEffect(() => {
        if (device.status === 'online' && device.rustdesk_id) {
            api.getDeviceTelemetry(device.rustdesk_id)
                .then(data => {
                    if (data && data.length > 0) {
                        setTelemetry(data[data.length - 1]); // latest reading
                    }
                })
                .catch(() => {}); // silent fail — not all devices have an agent
        }
    }, [device.rustdesk_id, device.status]);

    const tags = device.tags ? device.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    return (
        <div className="device-card" onClick={() => onClick?.(device)}>
            <div className="device-card-header">
                <div className="device-card-info">
                    <div className="device-card-name">{device.alias || device.hostname}</div>
                    <div className="device-card-hostname">{device.rustdesk_id}</div>
                </div>
                <div className={`device-card-status ${device.status}`}>
                    <span className="status-dot" />
                    {device.status}
                </div>
            </div>

            <div className="device-card-details">
                <div className="device-card-detail">
                    <OsIcon os={device.os} />
                    <span>{device.os} {device.os_version}</span>
                </div>
                <div className="device-card-detail">
                    <Globe size={14} />
                    <span>{device.ip_address || '—'}</span>
                </div>
                <div className="device-card-detail">
                    <Cpu size={14} />
                    <span>{device.cpu ? device.cpu.split(' ').slice(0, 3).join(' ') : '—'}</span>
                </div>
                <div className="device-card-detail">
                    <Clock size={14} />
                    <span>{formatTimeAgo(device.last_seen)}</span>
                </div>
            </div>

            {tags.length > 0 && (
                <div className="device-card-tags">
                    {tags.map((tag, i) => (
                        <span key={i} className="tag-badge">
                            <Tag size={10} />
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Health Sparkline Strip */}
            {telemetry && device.status === 'online' && (
                <div className="device-card-health">
                    <HealthBar label="CPU" value={telemetry.cpu_usage} color="#6366f1" />
                    <HealthBar label="RAM" value={telemetry.ram_usage} color="#06b6d4" />
                    <HealthBar label="DSK" value={telemetry.disk_usage} color="#8b5cf6" />
                </div>
            )}

            <div className="device-card-footer">
                <div className="device-card-group">
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {device.model || 'Unknown Model'}
                    </span>
                </div>
                <div className="device-card-actions">
                    <button
                        className="btn btn-connect btn-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onConnect?.(device);
                        }}
                    >
                        Connect
                    </button>
                </div>
            </div>
        </div>
    );
}

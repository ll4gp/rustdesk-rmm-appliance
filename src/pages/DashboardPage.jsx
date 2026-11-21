import { useState, useEffect } from 'react';
import {
    Monitor, Wifi, WifiOff, Clock, Activity, Zap, TrendingUp,
    LayoutGrid, List
} from 'lucide-react';
import api from '../utils/api';
import DeviceCard from '../components/devices/DeviceCard';
import DeviceDetailModal from '../components/devices/DeviceDetailModal';
import { useToast } from '../context/ToastContext';
import { formatTimeAgo } from '../utils/helpers';

export default function DashboardPage({ devices, onDeviceUpdate }) {
    const [stats, setStats] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const { addToast } = useToast();

    useEffect(() => {
        api.getDeviceStats().then(setStats).catch(console.error);
    }, [devices]);

    const handleConnect = async (device) => {
        try {
            const result = await api.connectDevice(device.id);
            addToast(`Connection initiated to ${device.alias || device.hostname}`, 'success');
            // Securely triggers the OS-level custom protocol handler
            window.location.href = result.rustdesk_uri;
        } catch (err) {
            addToast(err.message || 'Connection failed', 'error');
        }
    };

    const recentOnline = devices
        ?.filter(d => d.status === 'online')
        .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
        .slice(0, 8);

    return (
        <div>
            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon total"><Monitor size={20} /></div>
                        {stats && <span className="stat-card-change positive">Active</span>}
                    </div>
                    <div className="stat-card-value">{stats?.total || '—'}</div>
                    <div className="stat-card-label">Total Devices</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon online"><Wifi size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats?.online || '—'}</div>
                    <div className="stat-card-label">Online</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon offline"><WifiOff size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats?.offline || '—'}</div>
                    <div className="stat-card-label">Offline</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon away"><Clock size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats?.away || '—'}</div>
                    <div className="stat-card-label">Away</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon connections"><Activity size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats?.activeConnections || '0'}</div>
                    <div className="stat-card-label">Active Sessions</div>
                </div>

                <div className="stat-card">
                    <div className="stat-card-header">
                        <div className="stat-card-icon total"><TrendingUp size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats?.todayConnections || '0'}</div>
                    <div className="stat-card-label">Today's Connections</div>
                </div>
            </div>

            {/* OS and Group Distribution */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    {/* OS Distribution */}
                    <div className="stat-card" style={{ padding: '20px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '14px' }}>OS Distribution</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stats.osDistribution?.map(os => {
                                const pct = Math.round((os.count / stats.total) * 100);
                                return (
                                    <div key={os.os} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '0.8rem', width: '70px', color: 'var(--text-secondary)' }}>{os.os}</span>
                                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${pct}%`, height: '100%', borderRadius: '3px',
                                                background: os.os === 'Windows' ? '#3b82f6' : os.os === 'Linux' ? '#22c55e' : '#9ca3af',
                                                transition: 'width 0.5s ease'
                                            }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '40px', textAlign: 'right' }}>{os.count} ({pct}%)</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Model Distribution */}
                    <div className="stat-card" style={{ padding: '20px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '14px' }}>By Model</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {stats.modelDistribution?.map((mod, i) => {
                                const pct = stats.total > 0 ? Math.round((mod.count / stats.total) * 100) : 0;
                                const colors = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#ef4444'];
                                const color = colors[i % colors.length];
                                return (
                                    <div key={mod.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            background: color, flexShrink: 0
                                        }} />
                                        <span style={{ fontSize: '0.8rem', width: '100px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.name}</span>
                                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width 0.5s ease' }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '30px', textAlign: 'right' }}>{mod.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Recently Online Devices */}
            <div className="section-header">
                <h3 className="section-title">
                    <Zap size={18} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '8px', color: 'var(--accent-primary)' }} />
                    Online Devices
                </h3>
            </div>

            <div className="devices-grid">
                {recentOnline?.map(device => (
                    <DeviceCard
                        key={device.id}
                        device={device}
                        onClick={setSelectedDevice}
                        onConnect={handleConnect}
                    />
                ))}
            </div>

            {selectedDevice && (
                <DeviceDetailModal
                    device={selectedDevice}
                    onClose={() => setSelectedDevice(null)}
                    onConnect={handleConnect}
                    onUpdate={onDeviceUpdate}
                />
            )}
        </div>
    );
}

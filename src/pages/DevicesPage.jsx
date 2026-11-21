import { useState, useMemo } from 'react';
import {
    LayoutGrid, List, Monitor, Terminal, Laptop,
    Clock, Globe, Search, Tag, Download
} from 'lucide-react';
import DeviceCard from '../components/devices/DeviceCard';
import DeviceDetailModal from '../components/devices/DeviceDetailModal';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { formatTimeAgo } from '../utils/helpers';

export default function DevicesPage({ devices, groups, searchQuery, onSearchChange, onDeviceUpdate, onDeviceDelete }) {
    const [statusFilter, setStatusFilter] = useState('all');
    const [modelFilter, setModelFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const { addToast } = useToast();

    const statusCounts = useMemo(() => {
        const counts = { all: 0, online: 0, offline: 0, away: 0 };
        devices?.forEach(d => {
            counts.all++;
            counts[d.status]++;
        });
        return counts;
    }, [devices]);

    const allTags = useMemo(() => {
        const tags = new Set();
        devices?.forEach(d => {
            if (d.tags) {
                d.tags.split(',').forEach(t => {
                    const trimmed = t.trim();
                    if (trimmed) tags.add(trimmed);
                });
            }
        });
        return Array.from(tags).sort();
    }, [devices]);

    const filtered = useMemo(() => {
        let result = devices || [];
        if (statusFilter !== 'all') {
            result = result.filter(d => d.status === statusFilter);
        }
        if (modelFilter !== 'all') {
            result = result.filter(d => (d.model || 'Unknown') === modelFilter);
        }
        if (tagFilter !== 'all') {
            result = result.filter(d => {
                if (!d.tags) return false;
                return d.tags.split(',').some(t => t.trim() === tagFilter);
            });
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(d =>
                (d.hostname?.toLowerCase().includes(q)) ||
                (d.alias?.toLowerCase().includes(q)) ||
                (d.ip_address?.toLowerCase().includes(q)) ||
                (d.rustdesk_id?.toLowerCase().includes(q)) ||
                (d.tags?.toLowerCase().includes(q))
            );
        }
        return result;
    }, [devices, statusFilter, modelFilter, tagFilter, searchQuery]);

    const uniqueModels = useMemo(() => {
        const models = new Set(devices?.map(d => d.model || 'Unknown'));
        return Array.from(models).sort();
    }, [devices]);

    const handleConnect = async (device) => {
        try {
            const result = await api.connectDevice(device.id);
            addToast(`Connection initiated to ${device.alias || device.hostname}`, 'success');
            // Securely triggers the OS-level protocol handler
            window.location.href = result.rustdesk_uri;
        } catch (err) {
            addToast(err.message || 'Connection failed', 'error');
        }
    };

    const handleDelete = async (device) => {
        if (!window.confirm(`Are you sure you want to delete "${device.alias || device.hostname}"? This cannot be undone.`)) {
            return;
        }
        try {
            await api.deleteDevice(device.id);
            addToast('Device deleted successfully', 'success');
            onDeviceDelete?.(device.id);
            setSelectedDevice(null);
        } catch (err) {
            addToast(err.message || 'Failed to delete device', 'error');
        }
    };

    function OsIcon({ os }) {
        if (!os) return <Monitor size={14} />;
        const lower = os.toLowerCase();
        if (lower.includes('linux')) return <Terminal size={14} />;
        if (lower.includes('mac')) return <Laptop size={14} />;
        return <Monitor size={14} />;
    }

    return (
        <div>
            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="filter-chips">
                    {['all', 'online', 'offline', 'away'].map(status => (
                        <button
                            key={status}
                            className={`filter-chip ${statusFilter === status ? 'active' : ''}`}
                            onClick={() => setStatusFilter(status)}
                        >
                            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                            <span className="chip-count">{statusCounts[status]}</span>
                        </button>
                    ))}
                </div>

                <select
                    className="form-select"
                    style={{ width: '160px', padding: '6px 10px', fontSize: '0.8rem' }}
                    value={modelFilter}
                    onChange={e => setModelFilter(e.target.value)}
                >
                    <option value="all">All Models</option>
                    {uniqueModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                <select
                    className="form-select"
                    style={{ width: '160px', padding: '6px 10px', fontSize: '0.8rem' }}
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                >
                    <option value="all">All Tags</option>
                    {allTags.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                        href="/api/agent/installer.bat"
                        download="Connect-Station.bat"
                        className="btn btn-primary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                        title="Download 1-Click Windows Station & Unattended RMM Setup (.bat)"
                    >
                        <Download size={14} /> Windows Setup (.bat)
                    </a>
                    <a
                        href="/api/agent/installer.sh"
                        download="Connect-Station.sh"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                        title="Download 1-Click Linux Station + Unattended Wayland/Xorg Setup (.sh)"
                    >
                        <Terminal size={14} /> Linux + Wayland (.sh)
                    </a>
                    <div className="view-toggle">
                        <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
                            <LayoutGrid size={16} />
                        </button>
                        <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
                            <List size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Count */}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Showing {filtered.length} of {devices?.length || 0} devices
            </p>

            {/* Grid View */}
            {viewMode === 'grid' ? (
                <div className="devices-grid">
                    {filtered.map(device => (
                        <DeviceCard
                            key={device.id}
                            device={device}
                            onClick={setSelectedDevice}
                            onConnect={handleConnect}
                        />
                    ))}
                </div>
            ) : (
                /* Table View */
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Device</th>
                                <th>Status</th>
                                <th>OS</th>
                                <th>IP Address</th>
                                <th>Model</th>
                                <th>Tags</th>
                                <th>Last Seen</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(device => (
                                <tr key={device.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedDevice(device)}>
                                    <td>
                                        <div className="device-table-name">
                                            <strong>{device.alias || device.hostname}</strong>
                                            <small>{device.rustdesk_id}</small>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${device.status}`}>
                                            <span className="status-dot" />
                                            {device.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="os-icon">
                                            <OsIcon os={device.os} />
                                            <span>{device.os}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{device.ip_address || '—'}</td>
                                    <td>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {device.model || 'Unknown'}
                                        </span>
                                    </td>
                                    <td>
                                        {device.tags ? (
                                            <div className="tag-list">
                                                {device.tags.split(',').map((t, i) => (
                                                    <span key={i} className="tag-badge">{t.trim()}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatTimeAgo(device.last_seen)}</td>
                                    <td onClick={e => e.stopPropagation()}>
                                        {device.status !== 'offline' && (
                                            <button className="btn btn-connect btn-sm" onClick={() => handleConnect(device)}>
                                                Connect
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {filtered.length === 0 && (
                <div className="empty-state">
                    <Search size={64} />
                    <h3>No devices found</h3>
                    <p>Try adjusting your filters or search criteria</p>
                </div>
            )}

            {selectedDevice && (
                <DeviceDetailModal
                    device={selectedDevice}
                    groups={groups}
                    onClose={() => setSelectedDevice(null)}
                    onConnect={handleConnect}
                    onUpdate={onDeviceUpdate}
                    onDelete={handleDelete}
                />
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { History, ExternalLink, Monitor, Clock } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { formatTimeAgo, formatDuration, formatDateTime } from '../utils/helpers';

export default function ConnectionsPage() {
    const [connections, setConnections] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(0);
    const limit = 15;
    const { addToast } = useToast();

    const fetchConnections = async () => {
        setLoading(true);
        try {
            const params = { limit, offset: page * limit };
            if (filter !== 'all') params.status = filter;
            const data = await api.getConnections(params);
            setConnections(data.connections);
            setTotal(data.total);
        } catch (err) {
            addToast('Failed to load connections', 'error');
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchConnections();
    }, [filter, page]);

    const handleEndConnection = async (connId) => {
        try {
            await api.endConnection(connId);
            addToast('Connection ended', 'success');
            fetchConnections();
        } catch (err) {
            addToast('Failed to end connection', 'error');
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div>
            <div className="section-header">
                <h3 className="section-title">Connection History</h3>
            </div>

            <div className="filter-bar">
                <div className="filter-chips">
                    {[
                        { key: 'all', label: 'All' },
                        { key: 'in_progress', label: 'Active' },
                        { key: 'success', label: 'Completed' },
                        { key: 'failed', label: 'Failed' },
                    ].map(f => (
                        <button
                            key={f.key}
                            className={`filter-chip ${filter === f.key ? 'active' : ''}`}
                            onClick={() => { setFilter(f.key); setPage(0); }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="loader"><div className="spinner" /></div>
            ) : (
                <>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Device</th>
                                    <th>User</th>
                                    <th>Type</th>
                                    <th>Started</th>
                                    <th>Duration</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {connections.map(conn => (
                                    <tr key={conn.id}>
                                        <td>
                                            <div className="device-table-name">
                                                <strong>{conn.alias || conn.hostname || '—'}</strong>
                                                <small>{conn.rustdesk_id}</small>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-primary)' }}>{conn.user_name || conn.username}</td>
                                        <td>
                                            <span className="connection-type">
                                                {conn.connection_type === 'remote_desktop' ? <Monitor size={12} /> :
                                                    conn.connection_type === 'file_transfer' ? <ExternalLink size={12} /> :
                                                        <Clock size={12} />}
                                                {conn.connection_type?.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem' }}>{formatDateTime(conn.started_at)}</td>
                                        <td>{formatDuration(conn.duration_seconds)}</td>
                                        <td>
                                            <span className={`status-badge ${conn.status}`}>
                                                {conn.status === 'in_progress' ? 'active' : conn.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {conn.notes || '—'}
                                        </td>
                                        <td>
                                            {conn.status === 'in_progress' && (
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleEndConnection(conn.id)}
                                                >
                                                    End
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {connections.length === 0 && (
                        <div className="empty-state">
                            <History size={64} />
                            <h3>No connections found</h3>
                            <p>Connection history will appear here when devices are accessed</p>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
                            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Page {page + 1} of {totalPages}
                            </span>
                            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

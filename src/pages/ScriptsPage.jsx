import { useState, useEffect } from 'react';
import {
    Code, Plus, Play, Trash2, ChevronRight, Terminal,
    Search, Filter, Clock, CheckCircle2, XCircle, AlertCircle, History
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { formatDistanceToNow } from 'date-fns';

export default function ScriptsPage({ devices, groups = [] }) {
    const [scripts, setScripts] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('library'); // 'library' or 'history'
    const [showModal, setShowModal] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [selectedScript, setSelectedScript] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState({ type: 'device', id: '' });
    const [newScript, setNewScript] = useState({ name: '', description: '', code: '' });
    const [viewingJob, setViewingJob] = useState(null);
    const { addToast } = useToast();

    useEffect(() => {
        fetchData(false);
    }, []);

    useEffect(() => {
        // Auto-refresh execution history and open job results every 3 seconds
        const interval = setInterval(() => {
            if (activeTab === 'history' || viewingJob) {
                fetchData(true);
            }
            if (viewingJob?.job?.id && viewingJob?.job?.status !== 'completed') {
                api.getJobResults(viewingJob.job.id).then(setViewingJob).catch(() => {});
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [activeTab, viewingJob?.job?.id, viewingJob?.job?.status]);

    const fetchData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [scriptsData, jobsData] = await Promise.all([
                api.getScripts(),
                api.getScriptJobs()
            ]);
            setScripts(scriptsData);
            setJobs(jobsData);
        } catch (err) {
            if (!silent) addToast('Failed to load script data', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const getTargetLabel = (job) => {
        if (job.target_type === 'device') {
            const dev = devices?.find(d => String(d.id) === String(job.target_id));
            return dev ? `${dev.alias || dev.hostname} (${dev.rustdesk_id})` : `Device #${job.target_id}`;
        }
        const grp = groups?.find(g => String(g.id) === String(job.target_id));
        return grp ? `Group: ${grp.name}` : `Group #${job.target_id}`;
    };

    const handleCreateScript = async (e) => {
        e.preventDefault();
        try {
            await api.createScript(newScript);
            addToast('Script created successfully', 'success');
            setShowModal(false);
            setNewScript({ name: '', description: '', code: '' });
            fetchData(true);
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleDeleteScript = async (id) => {
        if (!window.confirm('Are you sure you want to delete this script?')) return;
        try {
            await api.deleteScript(id);
            addToast('Script deleted', 'success');
            fetchData(true);
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleExecute = async () => {
        if (!selectedTarget.id) {
            addToast('Please select a target device or group', 'error');
            return;
        }
        setIsExecuting(true);
        try {
            const res = await api.executeScript(selectedScript.id, selectedTarget.type, selectedTarget.id);
            addToast('Script deployed! Waiting for station output...', 'success');
            setSelectedScript(null);
            setActiveTab('history');
            await fetchData(true);
            if (res?.job_id) {
                viewJobDetails(res.job_id);
            }
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setIsExecuting(false);
        }
    };

    const viewJobDetails = async (jobId) => {
        try {
            const data = await api.getJobResults(jobId);
            setViewingJob(data);
        } catch (err) {
            addToast('Failed to load job results', 'error');
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="text-green-500" size={18} />;
            case 'pending': return <Clock className="text-amber-500" size={18} />;
            case 'running': return <div className="spinner-small" />;
            case 'failed': return <XCircle className="text-red-500" size={18} />;
            default: return <AlertCircle size={18} />;
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-left">
                    <h1 className="page-title">Remote Scripts (RMM)</h1>
                    <p className="page-subtitle">Manage and deploy PowerShell scripts across your fleet</p>
                </div>
                <div className="header-actions">
                    <button className="btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={18} />
                        <span>Create Script</span>
                    </button>
                </div>
            </div>

            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'library' ? 'active' : ''}`}
                    onClick={() => setActiveTab('library')}
                >
                    <Code size={18} />
                    <span>Script Library</span>
                </button>
                <button
                    className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <History size={18} />
                    <span>Execution History</span>
                </button>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading scripts...</p>
                </div>
            ) : activeTab === 'library' ? (
                <div className="scripts-grid">
                    {scripts.length === 0 ? (
                        <div className="empty-state">
                            <Code size={48} opacity={0.3} />
                            <h3>No scripts found</h3>
                            <p>Create your first administrative script to get started.</p>
                        </div>
                    ) : (
                        scripts.map(script => (
                            <div key={script.id} className="card script-card">
                                <div className="script-card-header">
                                    <div className="script-icon">
                                        <Terminal size={20} />
                                    </div>
                                    <div className="script-info">
                                        <h3>{script.name}</h3>
                                        <p>{script.description}</p>
                                    </div>
                                </div>
                                <div className="script-code-preview">
                                    <code>{script.code.substring(0, 100)}{script.code.length > 100 ? '...' : ''}</code>
                                </div>
                                <div className="script-card-footer">
                                    <button
                                        className="btn-secondary btn-sm"
                                        onClick={() => setSelectedScript(script)}
                                    >
                                        <Play size={14} />
                                        <span>Deploy</span>
                                    </button>
                                    <button
                                        className="btn-ghost btn-sm text-red"
                                        onClick={() => handleDeleteScript(script.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <div className="card table-card">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Script</th>
                                <th>Target</th>
                                <th>Created By</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(job => (
                                <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => viewJobDetails(job.id)}>
                                    <td>
                                        <div className="status-cell">
                                            {getStatusIcon(job.status)}
                                            <span className={`status-text ${job.status}`}>{job.status}</span>
                                        </div>
                                    </td>
                                    <td className="font-medium">{job.script_name}</td>
                                    <td>
                                        <span className="badge-secondary">
                                            {getTargetLabel(job)}
                                        </span>
                                    </td>
                                    <td>{job.created_by_name}</td>
                                    <td className="text-secondary small">
                                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                    </td>
                                    <td onClick={e => e.stopPropagation()}>
                                        <button
                                            className="btn-icon"
                                            onClick={() => viewJobDetails(job.id)}
                                            title="View Output"
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Script Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content script-modal">
                        <div className="modal-header">
                            <h2>Create New PowerShell Script</h2>
                            <button className="btn-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleCreateScript}>
                            <div className="form-group">
                                <label>Script Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newScript.name}
                                    onChange={e => setNewScript({ ...newScript, name: e.target.value })}
                                    placeholder="e.g. System Cleanup"
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input
                                    type="text"
                                    value={newScript.description}
                                    onChange={e => setNewScript({ ...newScript, description: e.target.value })}
                                    placeholder="What does this script do?"
                                />
                            </div>
                            <div className="form-group">
                                <label>PowerShell Code</label>
                                <textarea
                                    required
                                    className="code-editor-textarea"
                                    value={newScript.code}
                                    onChange={e => setNewScript({ ...newScript, code: e.target.value })}
                                    placeholder="# Write your PowerShell here..."
                                    rows={10}
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary">Save Script</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Execute Modal */}
            {selectedScript && (
                <div className="modal-overlay">
                    <div className="modal-content execution-modal">
                        <div className="modal-header">
                            <h2>Deploy: {selectedScript.name}</h2>
                            <button className="btn-close" onClick={() => setSelectedScript(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <p className="text-secondary mb-4">Select the target machine where this script should execute.</p>

                            <div className="target-toggle mb-4">
                                <div className="flex bg-slate-800 p-1 rounded-lg">
                                    <button
                                        className={`flex-1 py-2 text-sm rounded-md transition-all ${selectedTarget.type === 'device' ? 'bg-indigo-600 shadow' : 'hover:bg-slate-700'}`}
                                        onClick={() => setSelectedTarget({ ...selectedTarget, type: 'device', id: '' })}
                                    >
                                        Single Device
                                    </button>
                                    <button
                                        className={`flex-1 py-2 text-sm rounded-md transition-all ${selectedTarget.type === 'group' ? 'bg-indigo-600 shadow' : 'hover:bg-slate-700'}`}
                                        onClick={() => setSelectedTarget({ ...selectedTarget, type: 'group', id: '' })}
                                    >
                                        Entire Group
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Select {selectedTarget.type === 'device' ? 'Device' : 'Group'}</label>
                                {selectedTarget.type === 'device' ? (
                                    <select
                                        className="form-select"
                                        value={selectedTarget.id}
                                        onChange={e => setSelectedTarget({ ...selectedTarget, id: e.target.value })}
                                    >
                                        <option value="">-- Choose a Device --</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.alias || d.hostname} ({d.rustdesk_id}) {d.status === 'online' ? '🟢 Online' : '⚫ Offline'}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <select
                                        className="form-select"
                                        value={selectedTarget.id}
                                        onChange={e => setSelectedTarget({ ...selectedTarget, id: e.target.value })}
                                    >
                                        <option value="">-- Choose a Group --</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="execution-warning p-3 bg-amber-900/20 border border-amber-500/30 rounded mb-4">
                                <div className="flex gap-2">
                                    <AlertCircle className="text-amber-500" size={18} />
                                    <p className="text-sm text-amber-200">
                                        This script will execute on the target station via the background RMM agent.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn-secondary"
                                onClick={() => setSelectedScript(null)}
                                disabled={isExecuting}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleExecute}
                                disabled={isExecuting}
                            >
                                {isExecuting ? 'Queueing...' : 'Start Execution'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Modal */}
            {viewingJob && (
                <div className="modal-overlay">
                    <div className="modal-content results-modal max-w-4xl">
                        <div className="modal-header">
                            <div>
                                <h2>Execution Results: {viewingJob.job.script_name}</h2>
                                <p className="text-xs text-secondary">
                                    Job ID: {viewingJob.job.id} • Status: <strong>{viewingJob.job.status}</strong>
                                </p>
                            </div>
                            <button className="btn-close" onClick={() => setViewingJob(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="results-container">
                                {viewingJob.results.length === 0 ? (
                                    <div className="terminal-output empty">
                                        <span className="cursor">_</span>
                                        Waiting for machine to check-in and push results (auto-refreshing every 3s)...
                                    </div>
                                ) : (
                                    viewingJob.results.map(res => (
                                        <div key={res.id} className="device-result">
                                            <div className="result-header">
                                                <span className="font-bold">{res.alias || res.hostname} ({res.rustdesk_id})</span>
                                                <span className={`status-pill ${res.status}`}>{res.status}</span>
                                            </div>
                                            <pre className="terminal-output">
                                                <code>{res.output_log || 'Command completed with no console output.'}</code>
                                            </pre>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState } from 'react';
import { 
    FolderTree, Plus, Edit2, Trash2, Monitor, 
    Wifi, ChevronRight, X, UserPlus, UserMinus
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { formatTimeAgo } from '../utils/helpers';

export default function GroupsPage({ devices = [], groups = [], onDeviceUpdate }) {
    const [showModal, setShowModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', color: '#6366f1' });
    const [membersGroup, setMembersGroup] = useState(null);
    const [addDeviceId, setAddDeviceId] = useState('');
    const { addToast } = useToast();

    const handleCreateOrUpdate = async (e) => {
        e.preventDefault();
        try {
            if (editingGroup) {
                await api.updateGroup(editingGroup.id, formData);
                addToast('Group updated', 'success');
            } else {
                await api.createGroup(formData);
                addToast('Group created', 'success');
            }
            setShowModal(false);
            setEditingGroup(null);
            setFormData({ name: '', description: '', color: '#6366f1' });
            window.location.reload();
        } catch (err) {
            addToast(err.message || 'Action failed', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure? This will unassign all devices from this department.')) return;
        try {
            await api.deleteGroup(id);
            addToast('Group deleted', 'success');
            window.location.reload();
        } catch (err) {
            addToast(err.message || 'Delete failed', 'error');
        }
    };

    const handleRemoveMember = async (device) => {
        try {
            const updated = await api.updateDevice(device.id, { group_id: null });
            onDeviceUpdate?.(updated);
            addToast(`${device.alias || device.hostname} removed from group`, 'success');
        } catch (err) {
            addToast(err.message || 'Failed to remove device', 'error');
        }
    };

    const handleAddMember = async () => {
        if (!addDeviceId) return;
        try {
            const updated = await api.updateDevice(parseInt(addDeviceId), { group_id: membersGroup.id });
            onDeviceUpdate?.(updated);
            setAddDeviceId('');
            addToast('Device added to group', 'success');
        } catch (err) {
            addToast(err.message || 'Failed to add device', 'error');
        }
    };

    const unassignedDevices = devices.filter(d => d.group_id !== membersGroup?.id);

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="header-left">
                    <h1 className="page-title">Departments & Groups</h1>
                    <p className="page-subtitle">Organize your fleet by location, team, or function</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setEditingGroup(null); setShowModal(true); }}>
                    <Plus size={18} />
                    <span>Create Department</span>
                </button>
            </div>

            <div className="groups-container">
                {groups.length === 0 ? (
                    <div className="empty-state">
                        <FolderTree size={64} opacity={0.2} />
                        <h3>No departments yet</h3>
                        <p>Create a department to start grouping your devices.</p>
                    </div>
                ) : (
                    <div className="groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                        {groups.map(group => {
                            const groupDevices = devices.filter(d => d.group_id === group.id);
                            const onlineCount = groupDevices.filter(d => d.status === 'online').length;
                            
                            return (
                                <div key={group.id} className="card group-card" style={{ borderTop: `4px solid ${group.color}` }}>
                                    <div className="group-card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div className="group-icon-wrapper" style={{ 
                                                width: '40px', height: '40px', borderRadius: '10px', 
                                                background: `${group.color}20`, display: 'flex', 
                                                alignItems: 'center', justifyContent: 'center',
                                                color: group.color
                                            }}>
                                                <FolderTree size={20} />
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{group.name}</h3>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{group.description}</p>
                                            </div>
                                        </div>
                                        <div className="group-actions" style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn-icon sm" onClick={() => { setEditingGroup(group); setFormData(group); setShowModal(true); }}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button className="btn-icon sm text-red" onClick={() => handleDelete(group.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="group-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                        <div className="group-stat-pill" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Devices</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Monitor size={14} />
                                                <span style={{ fontWeight: 600 }}>{groupDevices.length}</span>
                                            </div>
                                        </div>
                                        <div className="group-stat-pill" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Online</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Wifi size={14} className="text-green" />
                                                <span style={{ fontWeight: 600 }}>{onlineCount}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="group-footer" style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <button 
                                            className="btn-link sm" 
                                            onClick={() => setMembersGroup(group)}
                                            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        >
                                            <span>View Group Members</span>
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create/Edit Group Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h2>{editingGroup ? 'Edit Department' : 'New Department'}</h2>
                            <button className="btn-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleCreateOrUpdate}>
                            <div className="form-group">
                                <label>Department Name</label>
                                <input 
                                    className="form-input"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Sales, UK Branch, Linux Servers..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea 
                                    className="form-input"
                                    rows={3}
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Optional description..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Brand Color</label>
                                <input 
                                    type="color"
                                    className="form-input"
                                    style={{ height: '40px' }}
                                    value={formData.color}
                                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingGroup ? 'Update' : 'Create'} Department
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Members Modal */}
            {membersGroup && (
                <div className="modal-overlay" onClick={() => setMembersGroup(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FolderTree size={20} color={membersGroup.color} />
                                {membersGroup.name} — Members
                            </h2>
                            <button className="btn-close" onClick={() => setMembersGroup(null)}><X size={18} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                            {/* Add Member */}
                            <div style={{ marginBottom: '20px', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                                    <UserPlus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                                    Add Device to Group
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select 
                                        className="form-select" 
                                        style={{ flex: 1 }}
                                        value={addDeviceId} 
                                        onChange={e => setAddDeviceId(e.target.value)}
                                    >
                                        <option value="">Select a device...</option>
                                        {unassignedDevices.map(d => (
                                            <option key={d.id} value={d.id}>{d.alias || d.hostname} ({d.rustdesk_id})</option>
                                        ))}
                                    </select>
                                    <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={!addDeviceId}>
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Member List */}
                            {(() => {
                                const groupDevices = devices.filter(d => d.group_id === membersGroup.id);
                                if (groupDevices.length === 0) {
                                    return (
                                        <div className="empty-state" style={{ padding: '30px 0' }}>
                                            <Monitor size={48} opacity={0.2} />
                                            <h3>No members yet</h3>
                                            <p>Use the dropdown above to add devices to this group.</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {groupDevices.map(device => (
                                            <div key={device.id} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                    <span className={`status-dot ${device.status}`} style={{ flexShrink: 0 }} />
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {device.alias || device.hostname}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                            {device.rustdesk_id} • {formatTimeAgo(device.last_seen)}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button 
                                                    className="btn-icon sm" 
                                                    onClick={() => handleRemoveMember(device)}
                                                    title="Remove from group"
                                                >
                                                    <UserMinus size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

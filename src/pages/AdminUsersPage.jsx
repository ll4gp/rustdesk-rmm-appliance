import { useState, useEffect } from 'react';
import { Users, Plus, Edit3, Shield, X, Save, UserCheck, UserX } from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';
import { getInitials, formatTimeAgo } from '../utils/helpers';

export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', email: '', password: '', full_name: '', role: 'technician' });
    const { addToast } = useToast();

    const fetchUsers = async () => {
        try {
            const data = await api.getUsers();
            setUsers(data);
        } catch (err) {
            addToast('Failed to load users', 'error');
        }
        setLoading(false);
    };

    useEffect(() => { fetchUsers(); }, []);

    const openCreate = () => {
        setEditUser(null);
        setFormData({ username: '', email: '', password: '', full_name: '', role: 'technician' });
        setShowModal(true);
    };

    const openEdit = (user) => {
        setEditUser(user);
        setFormData({ username: user.username, email: user.email, password: '', full_name: user.full_name, role: user.role });
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            if (editUser) {
                const updateData = { email: formData.email, full_name: formData.full_name, role: formData.role };
                if (formData.password) updateData.password = formData.password;
                await api.updateUser(editUser.id, updateData);
                addToast('User updated', 'success');
            } else {
                await api.createUser(formData);
                addToast('User created', 'success');
            }
            fetchUsers();
            setShowModal(false);
        } catch (err) {
            addToast(err.message || 'Operation failed', 'error');
        }
    };

    const toggleActive = async (user) => {
        try {
            await api.updateUser(user.id, { is_active: user.is_active ? 0 : 1 });
            addToast(`User ${user.is_active ? 'deactivated' : 'activated'}`, 'success');
            fetchUsers();
        } catch (err) {
            addToast('Failed to update user', 'error');
        }
    };

    return (
        <div>
            <div className="section-header">
                <h3 className="section-title">User Management</h3>
                <button className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Add User
                </button>
            </div>

            {loading ? (
                <div className="loader"><div className="spinner" /></div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="user-row">
                                            <div className="user-avatar-sm">{getInitials(user.full_name)}</div>
                                            <div>
                                                <strong style={{ color: 'var(--text-primary)' }}>{user.full_name || user.username}</strong>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{user.username}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td><span className={`role-badge ${user.role}`}>{user.role}</span></td>
                                    <td>
                                        <span className={`status-badge ${user.is_active ? 'online' : 'offline'}`}>
                                            <span className="status-dot" />
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatTimeAgo(user.last_login)}</td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatTimeAgo(user.created_at)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn-icon" onClick={() => openEdit(user)} title="Edit">
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className="btn-icon"
                                                onClick={() => toggleActive(user)}
                                                title={user.is_active ? 'Deactivate' : 'Activate'}
                                                style={{ color: user.is_active ? 'var(--error)' : 'var(--success)' }}
                                            >
                                                {user.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {users.length === 0 && !loading && (
                <div className="empty-state">
                    <Users size={64} />
                    <h3>No users found</h3>
                    <p>Create users to give technicians access to the dashboard</p>
                </div>
            )}

            {/* User Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editUser ? 'Edit User' : 'New User'}</h3>
                            <button className="btn-icon" onClick={() => setShowModal(false)}><X size={16} /></button>
                        </div>
                        <div className="modal-body">
                            {!editUser && (
                                <div className="form-group">
                                    <label className="form-label">Username</label>
                                    <input className="form-input" value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} placeholder="username" required />
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Full Name</label>
                                <input className="form-input" value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))} placeholder="John Doe" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input className="form-input" type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="user@example.com" required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                                <input className="form-input" type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" required={!editUser} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Role</label>
                                <select className="form-select" value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}>
                                    <option value="technician">Technician</option>
                                    <option value="teacher">Teacher</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={14} /> {editUser ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

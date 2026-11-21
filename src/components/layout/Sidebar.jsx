import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/helpers';
import {
    Monitor, LayoutDashboard, FolderTree, History, Users,
    Shield, LogOut, Settings, Zap, Terminal
} from 'lucide-react';

export default function Sidebar({ onlineCount, siteName }) {
    const { user, logout, isAdmin } = useAuth();
    const location = useLocation();

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/devices', icon: Monitor, label: 'Devices', badge: onlineCount },
        { path: '/groups', icon: FolderTree, label: 'Groups' },
        { path: '/connections', icon: History, label: 'Connections' },
        { path: '/scripts', icon: Terminal, label: 'Scripts' },
    ];

    const adminItems = [
        { path: '/admin/users', icon: Users, label: 'User Management' },
        { path: '/admin/settings', icon: Settings, label: 'Appliance Setup' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <Zap />
                </div>
                <div className="sidebar-brand">
                    <h1>RustDesk</h1>
                    <span>{siteName || 'RMM Appliance'}</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section">
                    <div className="sidebar-section-label">Main Menu</div>
                    {navItems.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                        >
                            <item.icon />
                            <span>{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                                <span className="sidebar-badge">{item.badge}</span>
                            )}
                        </NavLink>
                    ))}
                </div>

                {isAdmin && (
                    <div className="sidebar-section">
                        <div className="sidebar-section-label">Administration</div>
                        {adminItems.map(item => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                            >
                                <item.icon />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                )}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-user-avatar">
                        {getInitials(user?.full_name || user?.username)}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user?.full_name || user?.username}</div>
                        <div className="sidebar-user-role">{user?.role}</div>
                    </div>
                    <button className="btn-ghost" onClick={logout} title="Logout" style={{ padding: '6px' }}>
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
}

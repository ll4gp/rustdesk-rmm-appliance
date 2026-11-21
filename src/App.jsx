import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Key, ArrowRight } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { useWebSocket } from './hooks/useWebSocket';
import api from './utils/api';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import ConnectionsPage from './pages/ConnectionsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import SettingsPage from './pages/SettingsPage';
import ScriptsPage from './pages/ScriptsPage';
import GroupsPage from './pages/GroupsPage';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <div className="spinner" />
            </div>
        );
    }
    return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
    const { isAdmin, loading } = useAuth();
    if (loading) return null;
    return isAdmin ? children : <Navigate to="/" />;
}

function AppLayout() {
    const [devices, setDevices] = useState([]);
    const [groups, setGroups] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [applianceStatus, setApplianceStatus] = useState({ is_configured: true, site_name: 'RMM Appliance' });
    const location = useLocation();

    const fetchApplianceStatus = async () => {
        try {
            const st = await api.getApplianceStatus();
            setApplianceStatus(st);
        } catch {}
    };

    const fetchData = async () => {
        try {
            const [devicesData, groupsData] = await Promise.all([
                api.getDevices(),
                api.getGroups()
            ]);
            setDevices(devicesData);
            setGroups(groupsData);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        }
    };

    useEffect(() => {
        fetchData();
        fetchApplianceStatus();
    }, []);

    const handleWsMessage = useCallback((message) => {
        if (message.type === 'device_status_change') {
            const { id, status, last_seen } = message.data;
            setDevices(prev =>
                prev.map(d =>
                    d.id === id ? { ...d, status, last_seen: last_seen || d.last_seen } : d
                )
            );
        } else if (message.type === 'devices_status') {
            const statusMap = {};
            message.data.forEach(d => { statusMap[d.id] = d; });
            setDevices(prev =>
                prev.map(d => statusMap[d.id] ? { ...d, status: statusMap[d.id].status, last_seen: statusMap[d.id].last_seen || d.last_seen } : d)
            );
        }
    }, []);

    const { connected: wsConnected } = useWebSocket(handleWsMessage);

    const handleDeviceUpdate = (updated) => {
        setDevices(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    };

    const handleDeviceDelete = (id) => {
        setDevices(prev => prev.filter(d => d.id !== id));
    };

    const onlineCount = devices.filter(d => d.status === 'online').length;

    const pageTitles = {
        '/': 'Dashboard',
        '/devices': 'All Devices',
        '/connections': 'Connections',
        '/scripts': 'Remote Scripts (RMM)',
        '/admin/users': 'User Management',
        '/admin/settings': 'System Settings',
    };

    const currentPath = location.pathname;
    const title = pageTitles[currentPath] || 'Dashboard';

    return (
        <div className="app-layout">
            <Sidebar onlineCount={onlineCount} siteName={applianceStatus?.site_name} />
            <div className="main-content">
                <Header
                    title={title}
                    wsConnected={wsConnected}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                />
                <div className="page-content">
                    {!applianceStatus?.is_configured && currentPath !== '/admin/settings' && (
                        <div style={{
                            marginBottom: '20px',
                            padding: '16px 20px',
                            borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(16,185,129,0.12))',
                            border: '1px solid rgba(99,102,241,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '10px',
                                    background: 'rgba(99,102,241,0.25)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', color: '#818cf8'
                                }}>
                                    <Key size={20} />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                        Welcome! Connect This Appliance to Your RustDesk Server
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        Load your existing RustDesk <code>id_ed25519.pub</code> key and Server IP/Domain to activate 1-Click Windows & Linux station installers.
                                    </div>
                                </div>
                            </div>
                            <Link
                                to="/admin/settings"
                                className="btn btn-primary"
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                                Load Server Key & Configure <ArrowRight size={15} />
                            </Link>
                        </div>
                    )}
                    <Routes>
                        <Route
                            path="/"
                            element={<DashboardPage devices={devices} onDeviceUpdate={handleDeviceUpdate} />}
                        />
                        <Route
                            path="/devices"
                            element={
                                <DevicesPage
                                    devices={devices}
                                    groups={groups}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    onDeviceUpdate={handleDeviceUpdate}
                                    onDeviceDelete={handleDeviceDelete}
                                />
                            }
                        />
                        <Route path="/connections" element={<ConnectionsPage />} />
                        <Route
                            path="/groups"
                            element={<GroupsPage devices={devices} groups={groups} onDeviceUpdate={handleDeviceUpdate} />}
                        />
                        <Route
                            path="/scripts"
                            element={<ScriptsPage devices={devices} groups={groups} />}
                        />
                        <Route
                            path="/admin/users"
                            element={
                                <AdminRoute>
                                    <AdminUsersPage />
                                </AdminRoute>
                            }
                        />
                        <Route
                            path="/admin/settings"
                            element={
                                <AdminRoute>
                                    <SettingsPage onConfigSaved={fetchApplianceStatus} />
                                </AdminRoute>
                            }
                        />
                    </Routes>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route
                            path="/*"
                            element={
                                <ProtectedRoute>
                                    <AppLayout />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

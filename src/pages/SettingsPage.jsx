import { useState, useEffect, useRef } from 'react';
import {
    Save, Server, Shield, Terminal, Download, Copy, Check,
    Upload, Key, Activity, CheckCircle2, XCircle, Lock
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

export default function SettingsPage({ onConfigSaved }) {
    const [settings, setSettings] = useState({
        site_name: '',
        rustdesk_server: '',
        rustdesk_relay_server: '',
        rustdesk_key: '',
        dashboard_host: '',
        rustdesk_secondary_server: '',
        default_unattended_password: '',
        rustdesk_api_port: '21114',
    });
    const [resolved, setResolved] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [copiedCmd, setCopiedCmd] = useState('');
    const fileInputRef = useRef(null);
    const { addToast } = useToast();

    useEffect(() => {
        let cancelled = false;
        api.getSettings()
            .then(data => {
                if (cancelled) return;
                const resCfg = data._resolved || {};
                setResolved(resCfg);
                setSettings({
                    site_name: data.site_name || resCfg.siteName || 'RustDesk RMM Appliance',
                    rustdesk_server: data.rustdesk_server || resCfg.primaryHost || window.location.hostname || '',
                    rustdesk_relay_server: data.rustdesk_relay_server || resCfg.relayHost || '',
                    rustdesk_key: data.rustdesk_key || resCfg.rustdeskKey || '',
                    dashboard_host: data.dashboard_host || resCfg.dashboardHost || window.location.hostname || '',
                    rustdesk_secondary_server: data.rustdesk_secondary_server || resCfg.secondaryHost || '',
                    default_unattended_password: data.default_unattended_password || '',
                    rustdesk_api_port: data.rustdesk_api_port || '21114',
                });
            })
            .catch(err => {
                if (cancelled) return;
                addToast(err.message || 'Failed to load settings', 'error');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const handleKeyFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const raw = String(ev.target?.result || '').trim();
            if (!raw) {
                addToast('Selected key file is empty', 'error');
                return;
            }
            setSettings(s => ({ ...s, rustdesk_key: raw }));
            addToast(`Loaded key from ${file.name} — click "Save & Activate Appliance" to apply.`, 'success');
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleTestConnection = async () => {
        if (!settings.rustdesk_server.trim()) {
            addToast('Enter a RustDesk Server IP or Domain first', 'error');
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await api.testRustdeskServer({
                rustdesk_server: settings.rustdesk_server,
                rustdesk_relay_server: settings.rustdesk_relay_server || settings.rustdesk_server,
            });
            setTestResult(res);
            if (res.ok) {
                addToast(`Verified connectivity to RustDesk Server (${res.hbbs.latency_ms}ms)!`, 'success');
            } else {
                addToast(`Could not reach port 21116 on ${settings.rustdesk_server}`, 'error');
            }
        } catch (err) {
            addToast(err.message || 'Connection test failed', 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await api.updateSettings({
                site_name: settings.site_name,
                rustdesk_server: settings.rustdesk_server,
                rustdesk_relay_server: settings.rustdesk_relay_server || settings.rustdesk_server,
                rustdesk_key: settings.rustdesk_key,
                dashboard_host: settings.dashboard_host || window.location.hostname,
                rustdesk_secondary_server: settings.rustdesk_secondary_server,
                default_unattended_password: settings.default_unattended_password,
                rustdesk_api_port: settings.rustdesk_api_port,
            });
            if (updated._resolved) setResolved(updated._resolved);
            if (onConfigSaved) onConfigSaved();
            addToast('Appliance configuration saved! All 1-Click station installers are now live.', 'success');
        } catch (err) {
            addToast(err.message || 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const copyText = (text, label) => {
        navigator.clipboard.writeText(text);
        setCopiedCmd(label);
        addToast(`Copied ${label} to clipboard`, 'info');
        setTimeout(() => setCopiedCmd(''), 2000);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" />
            </div>
        );
    }

    const activeDashboardHost = settings.dashboard_host || resolved?.dashboardHost || window.location.hostname;
    const activePort = resolved?.dashboardPort || window.location.port || '3031';
    const winOneLiner = `irm http://${activeDashboardHost}:${activePort}/api/agent/onboard.ps1 | iex`;
    const linuxOneLiner = `curl -fsSL http://${activeDashboardHost}:${activePort}/api/agent/installer.sh | sudo bash`;
    const isValidKey = /^[A-Za-z0-9+/]{42,44}={0,2}$/.test((settings.rustdesk_key || '').trim());

    return (
        <div>
            <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h3 className="section-title">Plug-In Appliance Setup & RustDesk Integration</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Connect this appliance to any existing RustDesk Server (<code>hbbs</code> / <code>hbbr</code>) by entering your server address and loading your <code>id_ed25519.pub</code> key.
                    </p>
                </div>
                <span
                    className={`badge ${isValidKey && settings.rustdesk_server ? 'badge-online' : 'badge-away'}`}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                    {isValidKey && settings.rustdesk_server ? '✓ Appliance Ready & Configured' : '⚠ Waiting for Server Key (id_ed25519.pub)'}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px', alignItems: 'start' }}>
                {/* Step 1 & 2: Plug Into Existing RustDesk Server */}
                <div className="stat-card" style={{ padding: '24px' }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                        <Server size={18} color="var(--accent-primary)" />
                        1. Connect to Your Existing RustDesk Server
                    </h4>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label className="form-label">Client / Organization Name</label>
                        <input
                            className="form-input"
                            value={settings.site_name}
                            onChange={e => setSettings(s => ({ ...s, site_name: e.target.value }))}
                            placeholder="e.g. Acme Corp IT Environment"
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="form-group">
                            <label className="form-label">RustDesk ID Server (hbbs) *</label>
                            <input
                                className="form-input"
                                value={settings.rustdesk_server}
                                onChange={e => setSettings(s => ({ ...s, rustdesk_server: e.target.value }))}
                                placeholder="e.g. rustdesk.yourdomain.com or IP"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Relay Server (hbbr)</label>
                            <input
                                className="form-input"
                                value={settings.rustdesk_relay_server}
                                onChange={e => setSettings(s => ({ ...s, rustdesk_relay_server: e.target.value }))}
                                placeholder="Same as ID Server if blank"
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '18px' }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleTestConnection}
                            disabled={testing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Activity size={14} />
                            {testing ? 'Testing TCP Ports 21115–21117...' : 'Test Connection to RustDesk Server'}
                        </button>

                        {testResult && (
                            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: testResult.hbbs?.reachable ? '#22c55e' : '#ef4444' }}>
                                    {testResult.hbbs?.reachable ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                    <strong>ID Server (hbbs :21116):</strong>
                                    <span>{testResult.hbbs?.reachable ? `Reachable (${testResult.hbbs.latency_ms}ms)` : `Unreachable (${testResult.hbbs?.error || 'Check IP/Firewall'})`}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: testResult.hbbr?.reachable ? '#22c55e' : '#f59e0b' }}>
                                    {testResult.hbbr?.reachable ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                    <strong>Relay Server (hbbr :21117):</strong>
                                    <span>{testResult.hbbr?.reachable ? `Reachable (${testResult.hbbr.latency_ms}ms)` : `Unreachable (${testResult.hbbr?.error || 'Check Relay IP/Firewall'})`}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Public Key Loader */}
                    <div className="form-group" style={{ marginBottom: '16px', padding: '14px', background: 'rgba(99,102,241,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                            <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Key size={15} color="var(--accent-primary)" />
                                RustDesk Server Public Key (<code>id_ed25519.pub</code>) *
                            </label>
                            <div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pub,.txt,*"
                                    style={{ display: 'none' }}
                                    onChange={handleKeyFileUpload}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <Upload size={13} /> Upload id_ed25519.pub File
                                </button>
                            </div>
                        </div>
                        <input
                            className="form-input"
                            value={settings.rustdesk_key}
                            onChange={e => setSettings(s => ({ ...s, rustdesk_key: e.target.value }))}
                            placeholder="Paste your 44-character id_ed25519.pub key or upload the file above..."
                            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.76rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>
                                Located in your RustDesk server folder as <code>id_ed25519.pub</code>.
                            </span>
                            {settings.rustdesk_key && (
                                <span style={{ color: isValidKey ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                                    {isValidKey ? '✓ Valid Ed25519 Key' : '⚠ Check key format'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Appliance Dashboard Host & Failover */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div className="form-group">
                            <label className="form-label">This Appliance IP / Hostname</label>
                            <input
                                className="form-input"
                                value={settings.dashboard_host}
                                onChange={e => setSettings(s => ({ ...s, dashboard_host: e.target.value }))}
                                placeholder="e.g. 192.168.1.50"
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Where RMM agents send heartbeats (port {activePort}).
                            </p>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Secondary / VPN / Tailscale IP</label>
                            <input
                                className="form-input"
                                value={settings.rustdesk_secondary_server}
                                onChange={e => setSettings(s => ({ ...s, rustdesk_secondary_server: e.target.value }))}
                                placeholder="Optional failover IP"
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Lock size={14} /> Optional Default Unattended Password for New Stations
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={settings.default_unattended_password}
                            onChange={e => setSettings(s => ({ ...s, default_unattended_password: e.target.value }))}
                            placeholder="Leave blank to keep existing station passwords"
                        />
                    </div>

                    <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                        <Save size={16} /> {saving ? 'Saving Configuration...' : 'Save & Activate Appliance'}
                    </button>
                </div>

                {/* Step 3: 1-Click Station Onboarding Card */}
                <div className="stat-card" style={{ padding: '24px' }}>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Terminal size={18} color="#10b981" />
                        2. Deploy Pre-Configured Client Agents
                    </h4>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        These 1-Click installers are dynamically compiled with your RustDesk Server (<code>{settings.rustdesk_server || 'not set'}</code>), your <code>id_ed25519.pub</code> key, and this Appliance Dashboard (<code>{activeDashboardHost}:{activePort}</code>).
                    </p>

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <a
                            href="/api/agent/installer.bat"
                            download="Connect-Station.bat"
                            className="btn btn-primary"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Download size={15} /> Windows 1-Click (.bat)
                        </a>
                        <a
                            href="/api/agent/installer.sh"
                            download="Connect-Station.sh"
                            className="btn btn-secondary"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Download size={15} /> Linux + Wayland 1-Click (.sh)
                        </a>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            Windows PowerShell 1-Line Enrollment (Run as Admin):
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <code style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', overflowX: 'auto', border: '1px solid var(--border-primary)' }}>
                                {winOneLiner}
                            </code>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyText(winOneLiner, 'Windows command')}>
                                {copiedCmd === 'Windows command' ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            Linux + Unattended Wayland 1-Line Enrollment:
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <code style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', overflowX: 'auto', border: '1px solid var(--border-primary)' }}>
                                {linuxOneLiner}
                            </code>
                            <button className="btn btn-secondary btn-sm" onClick={() => copyText(linuxOneLiner, 'Linux command')}>
                                {copiedCmd === 'Linux command' ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: '14px', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#10b981', fontWeight: 600, fontSize: '0.82rem' }}>
                            <Shield size={15} /> What the 1-Click Agent Configures on Endpoints
                        </div>
                        <ul style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <li>Points RustDesk client to <code>{settings.rustdesk_server || '<your-hbbs>'}</code> & loads your <code>id_ed25519.pub</code> key.</li>
                            <li>Enables unattended password access & disables Linux Wayland interactive screen-share popups.</li>
                            <li>Installs the 5-second fast-polling RMM & Telemetry service for instant script execution and live CPU/RAM/Disk monitoring.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

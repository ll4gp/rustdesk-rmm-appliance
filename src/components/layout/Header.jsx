import { Search, Bell, Wifi, WifiOff } from 'lucide-react';

export default function Header({ title, subtitle, searchValue, onSearchChange, wsConnected }) {
    return (
        <header className="header">
            <div className="header-left">
                <div>
                    <h2 className="header-title">{title}</h2>
                    {subtitle && <p className="header-subtitle">{subtitle}</p>}
                </div>
            </div>
            <div className="header-right">
                {onSearchChange && (
                    <div className="header-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search devices, IPs, hostnames..."
                            value={searchValue || ''}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                    </div>
                )}
                <button className="header-icon-btn" title={wsConnected ? 'Live connection active' : 'Disconnected'}>
                    {wsConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                    {wsConnected && <span className="notification-dot" style={{ background: '#22c55e' }} />}
                </button>
                <button className="header-icon-btn">
                    <Bell size={16} />
                    <span className="notification-dot" />
                </button>
            </div>
        </header>
    );
}

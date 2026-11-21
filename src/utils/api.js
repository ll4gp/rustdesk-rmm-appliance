const API_BASE = '/api';
const WS_URL = `ws://${window.location.host}/ws`;

async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

export const api = {
    // Auth
    login: (username, password) =>
        apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }),
    getMe: () => apiRequest('/auth/me'),

    // Devices
    getDevices: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/devices${query ? `?${query}` : ''}`);
    },
    getDeviceStats: () => apiRequest('/devices/stats'),
    getDevice: (id) => apiRequest(`/devices/${id}`),
    updateDevice: (id, data) =>
        apiRequest(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    connectDevice: (id, data = {}) =>
        apiRequest(`/devices/${id}/connect`, { method: 'POST', body: JSON.stringify(data) }),

    // Groups
    getGroups: () => apiRequest('/groups'),
    createGroup: (data) =>
        apiRequest('/groups', { method: 'POST', body: JSON.stringify(data) }),
    updateGroup: (id, data) =>
        apiRequest(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteGroup: (id) =>
        apiRequest(`/groups/${id}`, { method: 'DELETE' }),

    // Connections
    getConnections: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/connections${query ? `?${query}` : ''}`);
    },
    endConnection: (id) =>
        apiRequest(`/connections/${id}/end`, { method: 'PUT' }),

    // Users
    getUsers: () => apiRequest('/users'),
    createUser: (data) =>
        apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) =>
        apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) =>
        apiRequest(`/users/${id}`, { method: 'DELETE' }),
    deleteDevice: (id) =>
        apiRequest(`/devices/${id}`, { method: 'DELETE' }),

    // Scripts (RMM)
    getScripts: () => apiRequest('/scripts'),
    createScript: (data) =>
        apiRequest('/scripts', { method: 'POST', body: JSON.stringify(data) }),
    deleteScript: (id) =>
        apiRequest(`/scripts/${id}`, { method: 'DELETE' }),
    executeScript: (id, target_type, target_id) =>
        apiRequest(`/scripts/${id}/execute`, {
            method: 'POST',
            body: JSON.stringify({ target_type, target_id })
        }),
    getScriptJobs: () => apiRequest('/scripts/jobs'),
    getJobResults: (id) => apiRequest(`/scripts/jobs/${id}`),

    // Agent / RMM Deep Monitoring
    getDeviceTelemetry: (rustdeskId) => apiRequest(`/agent/telemetry/${rustdeskId}`),
    getDeviceInventory: (rustdeskId) => apiRequest(`/agent/inventory/${rustdeskId}`),
    queueCommand: (rustdeskId, commandString) =>
        apiRequest('/agent/queue-command', {
            method: 'POST',
            body: JSON.stringify({ rustdesk_id: rustdeskId, command_string: commandString })
        }),
    getCommandHistory: (rustdeskId) => apiRequest(`/agent/commands/${rustdeskId}`),

    // Settings & Appliance Onboarding
    getSettings: () => apiRequest('/settings'),
    getApplianceStatus: () => apiRequest('/settings/status'),
    testRustdeskServer: (data) =>
        apiRequest('/settings/test-server', { method: 'POST', body: JSON.stringify(data) }),
    updateSettings: (data) =>
        apiRequest('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

export { WS_URL };
export default api;

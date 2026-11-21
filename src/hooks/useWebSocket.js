import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../utils/api';

export function useWebSocket(onMessage) {
    const wsRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const reconnectTimer = useRef(null);

    const connect = useCallback(() => {
        try {
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                setConnected(true);
                console.log('WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onMessage?.(data);
                } catch (e) {
                    console.error('WS parse error:', e);
                }
            };

            ws.onclose = () => {
                setConnected(false);
                console.log('WebSocket disconnected, reconnecting...');
                reconnectTimer.current = setTimeout(connect, 3000);
            };

            ws.onerror = () => {
                ws.close();
            };

            wsRef.current = ws;
        } catch (e) {
            reconnectTimer.current = setTimeout(connect, 3000);
        }
    }, [onMessage]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect]);

    return { connected };
}

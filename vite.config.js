import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        host: true,
        port: 3030,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3031',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:3031',
                ws: true,
            },
        },
    },
});

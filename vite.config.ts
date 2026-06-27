import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/bot-service': {
        target: 'https://monadier-production.up.railway.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bot-service/, ''),
      },
    },
  },
});

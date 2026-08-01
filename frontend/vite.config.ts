import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  // Build de produção — saída em ../backend/public para ser servida pelo Express
  build: {
    outDir: fileURLToPath(new URL('../backend/public', import.meta.url)),
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    proxy: {
      // Em desenvolvimento, chamadas /api são encaminhadas para o backend
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
      },
    },
  },
});

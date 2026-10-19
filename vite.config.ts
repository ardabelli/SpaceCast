import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// "npm run dev" sırasında WebSocket isteklerini "npm run server" ile açılan sunucuya yönlendir.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:5199', ws: true } },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@solaris/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@solaris/data': fileURLToPath(new URL('../shared/src/data.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
  },
});

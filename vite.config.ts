/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    /* El setup carga .env (DATABASE_URL) para los tests de integración
       del drain; sin él solo corren los tests puros. */
    setupFiles: ['./vitest.setup.ts'],
  },
  server: {
    /* npm run dev sirve solo la UI; /api se proxea al deploy de producción
       para poder desarrollar la interfaz sin levantar vercel dev. */
    proxy: {
      '/api': {
        target: 'https://hookwire.vercel.app',
        changeOrigin: true,
      },
    },
  },
});

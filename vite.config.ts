import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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

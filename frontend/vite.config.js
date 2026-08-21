import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // O editor é o único bloco grande que vale separar manualmente.
          // Deixar o Rollup agrupar React e as demais dependências evita o ciclo
          // vendor -> react-vendor -> vendor observado no build de produção.
          if (id.includes('node_modules/react-quill') || id.includes('node_modules/quill')) {
            return 'editor';
          }
        }
      }
    }
  }
});

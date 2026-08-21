import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-quill') || id.includes('/quill/')) return 'editor';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('axios')) return 'http';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          return 'vendor';
        }
      }
    }
  }
});

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js alone is ~500 kB minified; the whole game is ~160 kB gzipped.
    chunkSizeWarningLimit: 800,
  },
});

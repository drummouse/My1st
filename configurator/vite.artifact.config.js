import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build variant used only to generate the single-file Claude Artifact demo
// link — inlines all image assets as base64 data URIs so the whole app is
// one HTML file with no separate asset requests. Not used for the real
// production build (see vite.config.js).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-artifact',
    assetsInlineLimit: 200000,
    rollupOptions: {
      output: {
        // Force everything (including jsPDF's dynamically-imported chunks)
        // into the single JS file this build's HTML-inlining step reads.
        inlineDynamicImports: true,
      },
    },
  },
});

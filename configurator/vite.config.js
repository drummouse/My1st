import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// `vercel dev` skips the production build that normally creates the
// standalone Share Design template. The package dev command prepares it in
// .local/, and this development-only middleware exposes it at the same URL
// the application uses online without adding the 2.3 MB file to PWA assets.
const localSnapshotTemplate = {
  name: 'ironwrap-local-snapshot-template',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/snapshot-template.html') return next();
      try {
        const html = await readFile(resolve(process.cwd(), '.local/snapshot-template.html'));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch {
        next();
      }
    });
  },
};

export default defineConfig({
  plugins: [
    react(),
    localSnapshotTemplate,
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'IronWrap 3D Configurator',
        short_name: 'IronWrap',
        description: 'Real-time 3D roofing & siding estimator for IronWrap Exteriors / i Roof Alberta',
        start_url: '.',
        display: 'standalone',
        background_color: '#101418',
        theme_color: '#14181d',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // Texture photos push individual assets past Workbox's 2MB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Workbox generateSW uses @rollup/plugin-terser, whose worker pool
        // cannot start in runtimes where os.cpus() is empty. injectManifest
        // uses Vite's supported worker build and keeps production PWA output.
        minify: 'esbuild',
      },
    }),
  ],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          jspdf: ['jspdf'],
        },
      },
    },
  },
});

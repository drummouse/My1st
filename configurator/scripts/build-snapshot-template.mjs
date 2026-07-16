// Inlines the single-page artifact build (dist-artifact/, built from
// vite.artifact.config.js) into one self-contained HTML file, then copies it
// into the main production build (dist/) as snapshot-template.html. The
// running app fetches this at export time, injects the customer's current
// design as window.__IRONWRAP_DESIGN__, and offers it as a standalone
// downloadable file — so it must have zero external asset requests.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const artifactDir = resolve(root, 'dist-artifact');
const outPath = resolve(root, process.argv[2] || 'dist/snapshot-template.html');

let html = readFileSync(resolve(artifactDir, 'index.html'), 'utf8');

html = html.replace(
  /<script([^>]*)\ssrc="\.\/(assets\/[^"]+\.js)"([^>]*)><\/script>/,
  (_match, before, assetPath, after) => {
    const js = readFileSync(resolve(artifactDir, assetPath), 'utf8');
    const attrs = (before + after).replace(/\scrossorigin/g, '');
    return `<script${attrs}>${js}</script>`;
  }
);

html = html.replace(
  /<link[^>]*\shref="\.\/(assets\/[^"]+\.css)"[^>]*>/,
  (_match, assetPath) => {
    const css = readFileSync(resolve(artifactDir, assetPath), 'utf8');
    return `<style>${css}</style>`;
  }
);

// The favicon <link> is a literal HTML reference (not something Vite's
// asset pipeline touches), so it 404s once this file is standalone. Inline
// it as a data URI too.
const iconPath = resolve(root, 'public/icons/icon-192.png');
const iconDataUri = `data:image/png;base64,${readFileSync(iconPath).toString('base64')}`;
html = html.replace(/href="icons\/icon-192\.png"/, `href="${iconDataUri}"`);
html = html.replace(/href="icons\/apple-touch-icon\.png"/, `href="${iconDataUri}"`);

const remainingAssetRefs = html.match(/\.\/assets\//g);
if (remainingAssetRefs) {
  throw new Error(
    `snapshot-template.html still references external assets (${remainingAssetRefs.length} occurrence(s)) — inlining failed.`
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(`snapshot-template.html written (${(html.length / 1024).toFixed(0)} KB) -> ${outPath}`);

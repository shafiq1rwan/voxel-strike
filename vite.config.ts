import { defineConfig, type Plugin } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const POKI_SDK = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/**
 * `--mode poki`: load the Poki SDK in <head> (Poki requires it there) and
 * strip the PWA bits — Poki hosts the game in its own iframe, so the web
 * manifest and service worker must not ship. Store art in public/marketing
 * is for the Poki dashboard, not the game bundle, so it's dropped too.
 */
function pokiPlugin(outDir: string): Plugin {
  return {
    name: 'voxelstrike-poki',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace('</title>', `</title>\n    <script src="${POKI_SDK}"></script>`);
    },
    closeBundle() {
      for (const f of ['sw.js', 'manifest.webmanifest', 'marketing']) {
        rmSync(resolve(outDir, f), { force: true, recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const poki = mode === 'poki';
  const outDir = poki ? 'dist-poki' : 'dist';
  return {
    // relative base so the build works on GitHub Pages project sites
    // (https://<user>.github.io/<repo>/), Poki's CDN, and any other static host
    base: './',
    build: { outDir },
    plugins: poki ? [pokiPlugin(outDir)] : [],
  };
});

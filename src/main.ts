import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app root');
new Game(app);

// PWA: offline cache + installability (production builds only, so the
// service worker never interferes with dev/HMR)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // not fatal — the game just won't work offline
    });
  });
}

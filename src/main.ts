import { Game } from './game';
import { POKI, poki, blockPageScroll } from './platform/poki';
import { biofoundry } from './preview/biofoundry';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app root');

if (POKI) {
  blockPageScroll();
  // Poki: init the SDK first, then build the game (level gen is the
  // "loading"); continue whether or not init succeeded
  void poki.init().then(() => {
    new Game(app);
    poki.loadingFinished();
  });
} else {
  // ?sector4 opens the Biofoundry alone, ?operative the main-character
  // viewer (web builds only — never Poki); the viewer is lazy-loaded, so
  // ordinary visits never download it
  const params = new URLSearchParams(location.search);
  if (params.has('operative')) {
    void import('./preview/operative-viewer').then(({ startOperativeViewer }) => startOperativeViewer(app));
  } else if (params.has('sector4')) {
    // the Biofoundry is campaign content now (sector 4), so it is already in
    // the bundle; ?sector4 just opens it alone
    new Game(app, biofoundry);
  } else {
    new Game(app);
  }
}

// PWA: offline cache + installability (production builds only, so the
// service worker never interferes with dev/HMR; never on Poki, which hosts
// the game in its own iframe)
if ('serviceWorker' in navigator && import.meta.env.PROD && !POKI) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // not fatal — the game just won't work offline
    });
  });
}

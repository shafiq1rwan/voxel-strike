import { Game } from './game';
import { POKI, poki, blockPageScroll } from './platform/poki';
import { biofoundry } from './preview/biofoundry';
import { environmentPreview } from './preview/environments';
import { isNewTheme } from './world/environments';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app root');

if (POKI) {
  blockPageScroll();
  // Poki: init the SDK first, then build the game (level gen is the
  // "loading"); continue whether or not init succeeded
  void poki.init().then(() => {
    new Game(app);
    poki.loadingFinished();
    // which upload this page load is: Poki's event tables add every build
    // together, so without it later events can't be told from older ones.
    // The SDK drops an event with more than two runs of digits across its
    // three values ("build 0.3.7 load" has three — 0.3.7 never arrived), so
    // the version goes as ONE: v + major + two-digit minor + two-digit patch
    // (0.3.7 → v00307, 1.12.4 → v11204).
    poki.measure('build', buildTag(__APP_VERSION__), 'load');
  });
} else {
  // ?sector6 opens the geothermal preview, ?sector4 the Biofoundry, ?operative the main-character
  // viewer (web builds only — never Poki); the viewer is lazy-loaded, so
  // ordinary visits never download it
  const params = new URLSearchParams(location.search);
  if (params.has('operative')) {
    void import('./preview/operative-viewer').then(({ startOperativeViewer }) => startOperativeViewer(app));
  } else if (isNewTheme(params.get('map') ?? '')) {
    new Game(app, environmentPreview(params.get('map') as import('./world/environments').NewTheme));
  } else if (params.has('sector6')) {
    void import('./preview/geothermal').then(({ geothermal }) => new Game(app, geothermal));
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

/** a version as one run of digits for Poki's measure(): 0.3.7 → v00307 */
export function buildTag(version: string): string {
  const [major = '0', minor = '0', patch = '0'] = version.split('.');
  return `v${major}${minor.padStart(2, '0')}${patch.padStart(2, '0')}`;
}

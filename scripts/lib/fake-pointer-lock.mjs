/**
 * Fake Pointer Lock for the headless test suites.
 *
 * Headless Edge is a real (hidden) browser window, and a real pointer lock
 * captures the OS cursor: it hides it, clips it to that window and keeps
 * warping it back — yanking the developer's mouse around while tests run.
 *
 * This swaps the Pointer Lock API for an in-page emulation before any game
 * code runs. The game still sees `pointerLockElement`, `pointerlockchange`
 * and `exitPointerLock()` behave as usual, and the rules tests depend on are
 * kept: a lock needs a fresh user gesture (puppeteer's mouse/keyboard input
 * counts, a JS `.click()` doesn't) in a visible, focused tab, and ESC
 * releases it.
 *
 * Usage: `fakePointerLock(browser)` right after `puppeteer.launch()` — every
 * page opened with `browser.newPage()` afterwards gets the emulation.
 */
export function fakePointerLock(browser) {
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    await page.evaluateOnNewDocument(install);
    return page;
  };
  return browser;
}

/** runs inside the page, before its scripts */
function install() {
  let lockEl = null;
  const changed = () => document.dispatchEvent(new Event('pointerlockchange'));
  Object.defineProperty(Document.prototype, 'pointerLockElement', {
    configurable: true,
    get: () => (lockEl && lockEl.isConnected ? lockEl : null),
  });
  Element.prototype.requestPointerLock = function () {
    // real browsers refuse a lock without a fresh gesture or in a hidden /
    // unfocused tab (coop.mjs runs the host in a background tab and relies on it)
    const gesture = !navigator.userActivation || navigator.userActivation.isActive;
    if (!gesture || document.visibilityState !== 'visible' || !document.hasFocus()) {
      setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
      return Promise.reject(new DOMException('no user gesture', 'NotAllowedError'));
    }
    const el = this;
    return new Promise((resolve) => setTimeout(() => {
      const was = lockEl;
      lockEl = el;
      if (was !== el) changed();
      resolve();
    }, 0));
  };
  Document.prototype.exitPointerLock = function () {
    if (!lockEl) return;
    lockEl = null;
    setTimeout(changed, 0);
  };
  // the browser's own ESC-to-release
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && lockEl) document.exitPointerLock();
  }, true);
}

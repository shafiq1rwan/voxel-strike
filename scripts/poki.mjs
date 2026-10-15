/**
 * Poki build test: runs against `npm run dev:poki` (or a preview of
 * dist-poki). The CDN SDK is swapped for a recording stub so the run is
 * deterministic (no real ads, no network): checks init/loading order, the
 * hidden co-op button, ad breaks muting audio, gameplayStart/Stop following
 * pause/death/intermission, the measure() events (level 1 start on a new
 * run, level N complete / fail, nothing else), page-scroll blocking — and
 * that the game still boots when an ad blocker drops the SDK.
 * Usage: node scripts/poki.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
mkdirSync(OUT, { recursive: true });

const errors = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) errors.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// records every SDK call; commercialBreak "plays" a 400ms ad
const STUB = `
window.__poki = [];
const log = (...a) => window.__poki.push(a.join(' '));
window.PokiSDK = {
  init: () => { log('init'); return Promise.resolve(); },
  gameLoadingFinished: () => log('gameLoadingFinished'),
  gameplayStart: () => log('gameplayStart'),
  gameplayStop: () => log('gameplayStop'),
  commercialBreak: (onStart) => {
    log('commercialBreak');
    onStart && onStart();
    window.__adPlaying = true;
    return new Promise((r) => setTimeout(() => { window.__adPlaying = false; r(); }, 400));
  },
  measure: (c, w, a) => log('measure', c, w, a),
};`;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser); // keep the real OS cursor free

async function openPage(sdk) {
  const page = await browser.newPage();
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/poki-sdk\.js|ERR_FAILED|ERR_BLOCKED_BY_CLIENT/.test(msg.text())) {
      errors.push(`[console.error] ${msg.text()}`);
    }
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url() !== SDK_URL) return void req.continue();
    if (sdk === 'blocked') return void req.abort('blockedbyclient');
    void req.respond({ status: 200, contentType: 'application/javascript', body: STUB });
  });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#start-btn', { timeout: 10000 });
  return page;
}

const calls = (page) => page.evaluate(() => window.__poki.slice());
const state = (page) => page.evaluate(() => window.__voxelstrike.state);

try {
  // ---- with the SDK -------------------------------------------------------
  const page = await openPage('stub');
  let c = await calls(page);
  check(c[0] === 'init' && c[1] === 'gameLoadingFinished', `init then gameLoadingFinished (${c.slice(0, 2)})`);
  check(!c.includes('gameplayStart'), 'no gameplayStart on the title screen');
  check((await page.$('#coop-btn')) === null, 'co-op button is hidden');
  check((await page.$('#title-settings-btn')) !== null, 'settings button still shown');

  const scrollBlocked = await page.evaluate(() => {
    const k = new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', cancelable: true });
    window.dispatchEvent(k);
    const w = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    window.dispatchEvent(w);
    return k.defaultPrevented && w.defaultPrevented;
  });
  check(scrollBlocked, 'arrow keys + wheel cannot scroll the host page');

  // start → ad break (audio muted while it plays) → gameplay
  await page.click('#start-btn');
  await sleep(150);
  const mid = await page.evaluate(() => ({
    ad: window.__adPlaying,
    state: window.__voxelstrike.state,
    gain: window.__voxelstrike.audio.masterBus?.gain.value,
  }));
  check(mid.ad && mid.state === 'title', `game waits on the ad (state=${mid.state})`);
  check(mid.gain === 0, `audio muted during the ad (gain=${mid.gain})`);
  await sleep(600);
  const after = await page.evaluate(() => window.__voxelstrike.audio.masterBus?.gain.value);
  check(after > 0, `audio restored after the ad (gain=${after})`);
  // an ad spends the click gesture: desktop asks for one more click to
  // re-capture the mouse before play starts
  const ready = await page.evaluate(() => ({
    state: window.__voxelstrike.state,
    ready: document.body.textContent.includes('CLICK TO CONTINUE'),
  }));
  check(ready.state === 'paused' && ready.ready, `after an ad: READY / click to continue (state=${ready.state})`);
  await page.mouse.click(640, 360);
  await sleep(400);
  check((await state(page)) === 'playing', 'playing after the ad + click');
  c = await calls(page);
  check(c.includes('commercialBreak'), 'commercialBreak before the run');
  check(c.indexOf('commercialBreak') < c.indexOf('gameplayStart'), 'ad comes before gameplayStart');
  check(c.filter((x) => x.startsWith('measure')).join() === 'measure level 1 start', 'starting a run sends exactly one level 1 start');

  // pause / resume
  await page.evaluate(() => window.__voxelstrike.requestPause());
  await sleep(150);
  c = await calls(page);
  check(c[c.length - 1] === 'gameplayStop', 'pause → gameplayStop');
  await page.evaluate(() => { const g = window.__voxelstrike; g.state = 'playing'; g.hud.hideScreen(); });
  await sleep(150);
  c = await calls(page);
  check(c[c.length - 1] === 'gameplayStart', 'resume → gameplayStart');
  const starts = c.filter((x) => x === 'gameplayStart').length;
  await sleep(300);
  check((await calls(page)).filter((x) => x === 'gameplayStart').length === starts, 'gameplayStart is not re-sent every frame');

  // side objectives are not measured
  await page.evaluate(() => window.__voxelstrike.onKeyPickup());
  check((await calls(page)).filter((x) => x.startsWith('measure')).length === 1, 'keycard pickup sends no game event');

  // clear sector 1 → intermission → ad → sector 2
  await page.evaluate(() => window.__voxelstrike.win());
  await sleep(150);
  c = await calls(page);
  check(c.includes('measure level 1 complete'), 'level 1 complete measured');
  check(c[c.length - 1] === 'gameplayStop' && (await state(page)) === 'intermission', 'intermission → gameplayStop');
  const breaks = c.filter((x) => x === 'commercialBreak').length;
  await sleep(800); // the intermission screen arms after 0.7s
  await page.evaluate(() => {
    document.querySelector('.screen').click();
    document.querySelector('.screen').click(); // impatient double click during the ad
  });
  await sleep(700);
  await page.mouse.click(640, 360); // READY → click to continue
  await sleep(400);
  c = await calls(page);
  check(c.filter((x) => x === 'commercialBreak').length === breaks + 1, 'one ad per break, even on double click');
  check((await page.evaluate(() => window.__voxelstrike.levelIndex)) === 2, 'advanced exactly one sector');
  check(c[c.length - 1] !== 'gameplayStop', 'sector 2: gameplay resumed');
  await page.screenshot({ path: `${OUT}/poki-sector2.png` });

  // death → fail events + gameplayStop
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.health = 0;
    g.player.dead = true;
    g.onPlayerDeath();
  });
  await sleep(150);
  c = await calls(page);
  check(c.filter((x) => x === 'measure level 2 fail').length === 1, 'death measured once as level 2 fail');
  check(c[c.length - 1] === 'gameplayStop', 'death → gameplayStop');
  check(!c.some((x) => /[\/^]/.test(x.replace(/^measure /, ''))), "no '/' or '^' in measure values");

  // retry from the death screen: an ad break, then a NEW level-2 attempt (in place, no reload)
  await page.evaluate(() => (window.__bootMarker = 'same-page'));
  await sleep(2200); // death screen appears after 1.4s, arms 0.7s later
  const breaksBefore = c.filter((x) => x === 'commercialBreak').length;
  await page.evaluate(() => document.querySelector('#retry-btn').click());
  await sleep(700);
  await page.mouse.click(640, 360); // READY → click to continue
  await sleep(400);
  c = await calls(page);
  check(c.filter((x) => x === 'commercialBreak').length === breaksBefore + 1, 'retry is an ad break');
  const sent = c.filter((x) => x.startsWith('measure'));
  check(sent.join() === 'measure level 1 start,measure level 1 complete,measure level 2 fail',
    `only level 1 start + level complete / fail were sent, retry adds nothing (${sent.join(', ')})`);
  check(c[c.length - 1] === 'gameplayStart' && (await state(page)) === 'playing', 'retry → gameplay resumed');
  check(!c.slice(2).includes('init'), 'retry did not reload the page (no second SDK init)');
  check(await page.evaluate(() => window.__bootMarker === 'same-page'), 'same page after retry');
  console.log('  calls:', c.join(' | '));
  await page.close();

  // ---- SDK blocked (ad blocker) ------------------------------------------
  const blocked = await openPage('blocked');
  check(await blocked.evaluate(() => typeof window.PokiSDK === 'undefined'), 'SDK really blocked');
  await blocked.click('#start-btn');
  await sleep(500);
  check((await state(blocked)) === 'playing', 'game still starts without the SDK');
  check((await blocked.$('#coop-btn')) === null, 'co-op still hidden without the SDK');
  await blocked.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log(`\nPOKI TEST FAILED (${errors.length})`);
  for (const e of errors) console.log('  -', e);
  process.exit(1);
}
console.log('\nPOKI TEST PASSED');

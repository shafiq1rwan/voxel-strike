/**
 * Poki build test: runs against `npm run dev:poki` (or a preview of
 * dist-poki). The CDN SDK is swapped for a recording stub so the run is
 * deterministic (no real ads, no network): checks init/loading order, the
 * hidden co-op button, ad breaks muting audio, gameplayStart/Stop following
 * pause/death/intermission, the measure() events (level 1 fresh-start on a new
 * run, level N complete / fail, nothing else), page-scroll blocking — and
 * that the game still boots when an ad blocker drops the SDK.
 * Usage: node scripts/poki.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
mkdirSync(OUT, { recursive: true });

const errors = [];
/** level / endless progress events only (death + playtime are checked separately) */
const prog = (c) => c.filter((x) => /^measure (level|endless) /.test(x));
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
  // rewarded video: resolves true (watched) unless the test sets __rewardOk = false
  rewardedBreak: (onStart) => {
    log('rewardedBreak');
    const ok = window.__rewardOk !== false;
    if (ok && onStart) onStart();
    window.__adPlaying = ok;
    return new Promise((r) => setTimeout(() => { window.__adPlaying = false; r(ok); }, 400));
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
  const builds = c.filter((x) => x.startsWith('measure build'));
  check(builds.length === 1 && /^measure build \d+\.\d+\.\d+ load$/.test(builds[0]) && c.indexOf(builds[0]) > c.indexOf('gameLoadingFinished'),
    `every load sends its version once, after gameLoadingFinished (${builds.join(', ')})`);
  check(prog(c).join() === 'measure level 1 fresh-start,measure level 1 start',
    'starting a run sends level 1 fresh-start + level 1 start (Poki\'s Started column needs start)');

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
  check(prog(await calls(page)).length === 2, 'keycard pickup sends no game event');

  // clear sector 1 → intermission → ad → sector 2
  await page.evaluate(() => window.__voxelstrike.win());
  await sleep(150);
  c = await calls(page);
  check(c.includes('measure level 1 complete'), 'level 1 complete measured');
  check(c[c.length - 1] === 'gameplayStop' && (await state(page)) === 'intermission', 'intermission → gameplayStop');
  const breaks = c.filter((x) => x === 'commercialBreak').length;
  // the sector-clear screen: skip the tally, wait for the perk cards to arm
  await page.evaluate(() => document.querySelector('#sector-clear').click());
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (await page.evaluate(() => { const b = document.querySelector('.sc-perk'); return !!b && !b.disabled; })) break;
  }
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.sc-perk');
    cards[0].click();
    cards[1].click(); // impatient double pick during the ad
  });
  await sleep(700);
  await page.mouse.click(640, 360); // READY → click to continue
  await sleep(400);
  c = await calls(page);
  check(c.filter((x) => x === 'commercialBreak').length === breaks + 1, 'one ad per break, even on double click');
  check(c.filter((x) => x === 'measure level 2 start').length === 1, 'entering sector 2 sends level 2 start once');
  check((await page.evaluate(() => window.__voxelstrike.levelIndex)) === 2, 'advanced exactly one sector');
  check((await page.evaluate(() => window.__voxelstrike.perks.size)) === 1, 'a double pick still takes exactly one perk');
  check(c[c.length - 1] !== 'gameplayStop', 'sector 2: gameplay resumed');
  await page.screenshot({ path: `${OUT}/poki-sector2.png` });

  // death → fail events + gameplayStop (a real killing hit, tagged like a ticker blast)
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.buffs.shield = 0;
    g.player.damage(9999, g, { x: g.player.pos.x + 2, z: g.player.pos.z, by: 'ticker' });
  });
  await sleep(150);
  c = await calls(page);
  check(c.filter((x) => x === 'measure level 2 fail').length === 1, 'death measured once as level 2 fail');
  check(c.filter((x) => x.startsWith('measure death')).join() === 'measure death 2 ticker',
    `the death says what killed them, per sector: death 2 ticker (${c.filter((x) => x.startsWith('measure death')).join(', ')})`);
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
  const sent = prog(c);
  check(sent.join() === 'measure level 1 fresh-start,measure level 1 start,measure level 1 complete,measure level 2 start,measure level 2 fail,measure level 2 start',
    `each attempt sends start, then complete / fail; the retry is a new level 2 start (${sent.join(', ')})`);
  check(c[c.length - 1] === 'gameplayStart' && (await state(page)) === 'playing', 'retry → gameplay resumed');
  check(!c.slice(2).includes('init'), 'retry did not reload the page (no second SDK init)');
  check(await page.evaluate(() => window.__bootMarker === 'same-page'), 'same page after retry');

  // rewarded revive: offered on the death screen with the ad icon, equal in
  // size to the retry beside it; the video mutes audio, and only a watched
  // video revives — in place, once per sector attempt
  const die = () => page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.health = 0;
    g.player.dead = true;
    g.onPlayerDeath();
  });
  const fellAt = await page.evaluate(() => {
    const p = window.__voxelstrike.player.pos;
    return { x: p.x, z: p.z };
  });
  await die();
  await sleep(2200);
  const offer = await page.evaluate(() => {
    const rv = document.querySelector('#revive-btn');
    const rt = document.querySelector('#retry-btn');
    if (!rv || !rt) return { ok: false };
    const a = rv.getBoundingClientRect();
    const b = rt.getBoundingClientRect();
    return { ok: true, icon: !!rv.querySelector('svg'), text: rv.textContent, dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height), sameRow: Math.abs(a.top - b.top) < 2 };
  });
  check(offer.ok && offer.icon && /watch ad/i.test(offer.text), `death screen offers a rewarded revive with the ad icon ("${offer.text}")`);
  check(offer.ok && offer.dw <= 2 && offer.dh <= 2 && offer.sameRow, `revive and retry are equal-size, side by side (Δw ${offer.dw?.toFixed(1)}, Δh ${offer.dh?.toFixed(1)})`);
  const rewardedBefore = (await calls(page)).filter((x) => x === 'rewardedBreak').length;
  const breaksBeforeRevive = (await calls(page)).filter((x) => x === 'commercialBreak').length;
  await page.evaluate(() => document.querySelector('#revive-btn').click());
  await sleep(150);
  const during = await page.evaluate(() => ({
    ad: window.__adPlaying, state: window.__voxelstrike.state,
    gain: window.__voxelstrike.audio.masterBus?.gain.value,
  }));
  check(during.ad && during.state === 'dead', `revive waits on the rewarded video (state=${during.state})`);
  check(during.gain === 0, `audio muted during the rewarded video (gain=${during.gain})`);
  await sleep(600);
  await page.mouse.click(640, 360); // READY → click to continue
  await sleep(400);
  const rev = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return { state: g.state, dead: g.player.dead, hp: g.player.health, x: g.player.pos.x, z: g.player.pos.z, idx: g.levelIndex };
  });
  c = await calls(page);
  check(c.filter((x) => x === 'rewardedBreak').length === rewardedBefore + 1, 'revive called rewardedBreak once');
  check(c.filter((x) => x === 'commercialBreak').length === breaksBeforeRevive, 'revive is not also a commercial break');
  check(rev.state === 'playing' && !rev.dead && rev.hp >= 60 && rev.idx === 2, `watched video → revived and playing (hp=${rev.hp})`);
  check(Math.hypot(rev.x - fellAt.x, rev.z - fellAt.z) < 0.6, 'revived where it fell, not at the sector start');
  await die();
  await sleep(2200);
  check(await page.evaluate(() => !document.querySelector('#revive-btn') && !!document.querySelector('#retry-btn')),
    'second death in the same attempt: no revive, retry still there');
  // a retry is a new attempt: the revive comes back — and an unwatched video pays nothing
  await page.evaluate(() => document.querySelector('#retry-btn').click());
  await sleep(700);
  await page.mouse.click(640, 360);
  await sleep(400);
  await die();
  await sleep(2200);
  await page.evaluate(() => { window.__rewardOk = false; document.querySelector('#revive-btn').click(); });
  await sleep(700);
  const noVideo = await page.evaluate(() => {
    const b = document.querySelector('#revive-btn');
    return { state: window.__voxelstrike.state, dead: window.__voxelstrike.player.dead, disabled: !!b?.disabled, text: b?.textContent ?? '' };
  });
  check(noVideo.state === 'dead' && noVideo.dead, 'no video watched → no revive (still dead)');
  check(noVideo.disabled && /no video/i.test(noVideo.text), `the revive button says so and is disabled ("${noVideo.text}")`);
  const sentNow = prog(await calls(page));
  check(sentNow.every((x) => /^measure level [1-7] (fresh-start|start|complete|fail)$/.test(x)), 'revive adds no game events of its own');
  // endless descent (past sector 7): depths get their own `endless` bucket, capped at 20;
  // sectors 6-7 (the Geothermal Core) are still campaign `level` events
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.dead = false; g.player.health = 100;
    g.levelIndex = 7; g.state = 'playing'; g.hud.hideScreen();
    g.win();
  });
  await sleep(150);
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.dead = false; g.player.health = 100;
    g.hud.hideScreen(); g.levelIndex = 9; g.state = 'playing';
    g.win();
  });
  await sleep(150);
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.hud.hideScreen(); g.levelIndex = 25; g.state = 'playing';
    g.player.health = 0; g.player.dead = true;
    g.onPlayerDeath();
  });
  await sleep(150);
  const deep = prog(await calls(page)).slice(-3);
  check(deep.join() === 'measure level 7 complete,measure endless 9 complete,measure endless 20 fail',
    `sector 7 is a level; endless depths send endless N complete / fail, capped at 20 (${deep.join(', ')})`);
  // entering an endless depth starts it in the endless bucket (same cap)
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.dead = false; g.player.health = 100;
    g.levelIndex = 12; g.enterSector('test', false);
    g.levelIndex = 25; g.enterSector('test', false);
  });
  const deepStarts = prog(await calls(page)).slice(-2);
  check(deepStarts.join() === 'measure endless 12 start,measure endless 20 start',
    `endless depths send endless N start, capped at 20 (${deepStarts.join(', ')})`);
  // play-time markers: once per page load at each minute of real play
  const marks = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.player.dead = false; g.player.health = 100; g.hud.hideScreen(); g.state = 'playing';
    g.playSeconds = 59.95;
    await wait(300);
    g.playSeconds = 185; // two more marks pass in one frame
    await wait(300);
    g.state = 'paused';
    const before = g.playSeconds;
    await wait(300);
    return { pausedGrew: g.playSeconds !== before };
  });
  const pt = (await calls(page)).filter((x) => x.startsWith('measure playtime'));
  check(pt.join() === 'measure playtime 1 reached,measure playtime 2 reached,measure playtime 3 reached',
    `playtime N reached fires once per minute mark (${pt.join(', ')})`);
  check(!marks.pausedGrew, 'paused time is not play time');
  // scrap upgrades: a purchase sends upgrade <id> tier<N> (no ad involved)
  const upg = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.upgrades.earn(60);
    g.openUpgrades(() => g.hud.hideScreen());
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('.upg-buy[data-id="scanner"]').click();
    await new Promise((r) => setTimeout(r, 100));
    g.hud.hideScreen();
    return g.upgrades.level('scanner');
  });
  const upgEv = (await calls(page)).filter((x) => x.startsWith('measure upgrade'));
  check(upg === 1 && upgEv.join() === 'measure upgrade scanner tier1', `buying an upgrade sends upgrade scanner tier1 (${upgEv.join(', ')})`);
  // Armory: a locked skin can be unlocked early with a rewarded video — the
  // button says Watch ad with the clapperboard, isn't the primary look, and
  // only a watched video pays out
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.hud.hideScreen();
    g.state = 'title';
    g.openArmory('title');
    document.querySelector('.arm-tab[data-w="arc"]').click();
    document.querySelector('.arm-skin[data-id="arc.voidSignal"]').click();
  });
  const adBtn = await page.evaluate(() => {
    const b = document.querySelector('#armory-ad');
    return b ? { text: b.textContent, icon: !!b.querySelector('svg'), primary: b.classList.contains('tbtn-primary') } : null;
  });
  check(!!adBtn && /watch ad/i.test(adBtn.text) && adBtn.icon && !adBtn.primary, `a locked skin offers "Unlock now · Watch ad" with the ad icon (${adBtn?.text})`);
  const rwBefore = (await calls(page)).filter((x) => x === 'rewardedBreak').length;
  await page.evaluate(() => { window.__rewardOk = false; document.querySelector('#armory-ad').click(); });
  await sleep(700);
  const noVid = await page.evaluate(() => ({
    owned: window.__voxelstrike.skins.unlocked.has('arc.voidSignal'),
    text: document.querySelector('#armory-ad')?.textContent ?? '',
    disabled: !!document.querySelector('#armory-ad')?.disabled,
  }));
  check(!noVid.owned && noVid.disabled && /no video/i.test(noVid.text), `no video watched → not unlocked, the button says so ("${noVid.text}")`);
  await page.evaluate(() => {
    window.__rewardOk = true;
    document.querySelector('.arm-skin[data-id="arc.voidSignal"]').click();
    document.querySelector('#armory-ad').click();
  });
  await sleep(150);
  const muted = await page.evaluate(() => window.__voxelstrike.audio.masterBus?.gain.value);
  await sleep(600);
  const won = await page.evaluate(() => ({
    owned: window.__voxelstrike.skins.unlocked.has('arc.voidSignal'),
    worn: window.__voxelstrike.weapons.skinOf('arc'),
    status: document.querySelector('#arm-status')?.textContent ?? '',
    gain: window.__voxelstrike.audio.masterBus?.gain.value,
  }));
  check((await calls(page)).filter((x) => x === 'rewardedBreak').length === rwBefore + 2, 'each Watch ad press is one rewardedBreak');
  check(muted === 0 && won.gain !== 0, `audio is muted during the video and back after (${muted} → ${won.gain})`);
  check(won.owned && won.worn === 'arc.voidSignal' && /EQUIPPED/.test(won.status), `a watched video unlocks and equips the skin (${won.worn})`);
  await page.evaluate(() => localStorage.removeItem('voxelstrike-skins'));
  console.log('  calls:', (await calls(page)).join(' | '));
  await page.close();

  // ---- SDK blocked (ad blocker) ------------------------------------------
  const blocked = await openPage('blocked');
  check(await blocked.evaluate(() => typeof window.PokiSDK === 'undefined'), 'SDK really blocked');
  await blocked.click('#start-btn');
  await sleep(500);
  check((await state(blocked)) === 'playing', 'game still starts without the SDK');
  check((await blocked.$('#coop-btn')) === null, 'co-op still hidden without the SDK');
  await blocked.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.health = 0;
    g.player.dead = true;
    g.onPlayerDeath();
  });
  await sleep(2200);
  check(await blocked.evaluate(() => !!document.querySelector('#retry-btn') && !document.querySelector('#revive-btn')),
    'without the SDK the rewarded revive is not offered (it could never pay out)');
  await blocked.evaluate(() => {
    const g = window.__voxelstrike;
    g.hud.hideScreen();
    g.openArmory('title');
    document.querySelector('.arm-tab[data-w="arc"]').click();
    document.querySelector('.arm-skin[data-id="arc.voidSignal"]').click();
  });
  check(await blocked.evaluate(() => !!document.querySelector('.arm-goal') && !document.querySelector('#armory-ad')),
    'SDK blocked: a locked skin shows its goal but no Watch ad button');
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

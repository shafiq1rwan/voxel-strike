/**
 * Run-flow test: sector checkpoints, retry, save + continue, quit to menu,
 * new run, campaign end, and the graphics-lost overlay. Every restart must
 * happen IN PLACE (no page reload) — a window marker set at boot must survive.
 * Usage: node scripts/checkpoint.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

const errors = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) errors.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser); // keep the real OS cursor free

try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('voxelstrike-run');
    localStorage.setItem('voxelstrike-tutorial-done', '1');
  });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#start-btn', { timeout: 10000 });
  await page.evaluate(() => (window.__bootMarker = 'same-page'));
  const samePage = () => page.evaluate(() => window.__bootMarker === 'same-page');
  const g = (fn, ...args) => page.evaluate(fn, ...args);
  const save = () => g(() => JSON.parse(localStorage.getItem('voxelstrike-run') || 'null'));
  const clickBtn = (sel) => g((s) => document.querySelector(s)?.click(), sel);
  const die = () => g(() => {
    const game = window.__voxelstrike;
    game.player.health = 0;
    game.player.dead = true;
    game.onPlayerDeath();
  });
  const waitDeathScreen = async () => {
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      if (await g(() => !!document.querySelector('#retry-btn') && !document.querySelector('.screen.arming'))) return true;
    }
    return false;
  };

  // --- 1. title, start ---------------------------------------------------------
  check((await page.$('#continue-btn')) === null, 'no Continue button without a save');
  await clickBtn('#start-btn');
  await sleep(400);
  const s1 = await g(() => ({ state: window.__voxelstrike.state, seed: window.__voxelstrike.baseSeed, idx: window.__voxelstrike.levelIndex }));
  check(s1.state === 'playing' && s1.idx === 1, `run started in sector 1 (state=${s1.state})`);

  // --- 2. die in sector 1 → retry restores the sector-1 checkpoint in place ----
  await g(() => { window.__voxelstrike.score = 777; });
  await die();
  check(await waitDeathScreen(), 'death screen shows Retry / New run once armed');
  check(await g(() => document.querySelector('#retry-btn').textContent.includes('Retry sector 1')), 'retry button names the sector');
  await page.screenshot({ path: `${OUT}/checkpoint-death.png` });
  await clickBtn('#retry-btn');
  await sleep(400);
  const r1 = await g(() => {
    const game = window.__voxelstrike;
    return { state: game.state, idx: game.levelIndex, seed: game.baseSeed, hp: game.player.health, dead: game.player.dead, score: game.score };
  });
  check(r1.state === 'playing' && r1.idx === 1 && !r1.dead, `retry → playing sector 1 again (state=${r1.state})`);
  check(r1.seed === s1.seed, 'retry keeps the same layout seed');
  check(r1.hp >= 60, `retry restores health (hp=${r1.hp})`);
  check(r1.score === 0, `retry rolls the score back to the sector start (score=${r1.score})`);
  check(await samePage(), 'retry happened without a page reload');
  check((await save()) === null, 'sector 1 is not saved to storage');

  // --- 3. clear sector 1 → intermission saves sector 2 -------------------------
  await g(() => window.__voxelstrike.win());
  await sleep(200);
  const inter = await g(() => ({ state: window.__voxelstrike.state, text: document.querySelector('.screen')?.textContent ?? '' }));
  check(inter.state === 'intermission' && inter.text.includes('Progress saved'), 'intermission says progress is saved');
  const sv2 = await save();
  check(sv2 && sv2.sector === 2 && sv2.seed === s1.seed, `save points at sector 2 (${sv2 && sv2.sector})`);
  await sleep(800); // screen arms after 0.7s
  await g(() => document.querySelector('.screen').click());
  await sleep(500);
  check((await g(() => window.__voxelstrike.levelIndex)) === 2, 'descended to sector 2');

  // --- 4. gear picked up mid-sector is lost on retry --------------------------
  const entry = await g(() => window.__voxelstrike.weapons.loadout());
  await g(() => {
    const game = window.__voxelstrike;
    game.weapons.restoreLoadout(['pistol', 'shotgun', 'smg', 'rocket', 'arc'], 'rocket');
    game.player.ammo.rockets = 25;
  });
  await die();
  await waitDeathScreen();
  await clickBtn('#retry-btn');
  await sleep(400);
  const after = await g(() => ({ lo: window.__voxelstrike.weapons.loadout(), rockets: window.__voxelstrike.player.ammo.rockets, idx: window.__voxelstrike.levelIndex }));
  check(after.idx === 2, 'retry stays in sector 2');
  check(JSON.stringify(after.lo.owned) === JSON.stringify(entry.owned), `retry restores the sector-entry loadout (${after.lo.owned.join(',')})`);
  check(after.rockets === 0, `retry restores sector-entry ammo (rockets=${after.rockets})`);

  // --- 5. pause → "Save & quit to menu" → title offers Continue ---------------
  await g(() => window.__voxelstrike.requestPause());
  await sleep(200);
  const quitLabel = await g(() => document.querySelector('#pause-newrun-btn')?.textContent ?? '');
  check(quitLabel.includes('Save') && quitLabel.includes('quit'), `pause offers "${quitLabel}" in sector 2`);
  await clickBtn('#pause-newrun-btn');
  await sleep(500);
  const t = await g(() => ({ state: window.__voxelstrike.state, cont: document.querySelector('#continue-btn')?.textContent ?? '' }));
  check(t.state === 'title' && t.cont.includes('Sector 2'), `title shows "${t.cont}"`);
  check(await samePage(), 'quit to menu happened without a page reload');
  await page.screenshot({ path: `${OUT}/checkpoint-title-continue.png` });

  // --- 6. continue → back in sector 2 on the saved layout ---------------------
  await clickBtn('#continue-btn');
  await sleep(500);
  const c = await g(() => ({ state: window.__voxelstrike.state, idx: window.__voxelstrike.levelIndex, seed: window.__voxelstrike.baseSeed }));
  check(c.state === 'playing' && c.idx === 2 && c.seed === s1.seed, `continue → sector 2 on the saved seed (idx=${c.idx})`);

  // --- 7. graphics lost → overlay + pause; restored → pause screen ------------
  await g(() => {
    window.__ext = window.__voxelstrike.rendererSys.renderer.getContext().getExtension('WEBGL_lose_context');
    window.__ext.loseContext();
  });
  await sleep(300);
  const lost = await g(() => ({ state: window.__voxelstrike.state, overlay: document.body.textContent.includes('GRAPHICS LOST') }));
  check(lost.overlay && lost.state === 'paused', `context loss → GRAPHICS LOST overlay, paused (state=${lost.state})`);
  await g(() => window.__voxelstrike.resumeGame());
  await sleep(200);
  check((await g(() => window.__voxelstrike.state)) === 'paused', 'cannot resume while graphics are lost');
  await g(() => window.__ext.restoreContext());
  await sleep(500);
  const restored = await g(() => ({ overlay: document.body.textContent.includes('GRAPHICS LOST'), pause: !!document.querySelector('#pause-screen') }));
  check(!restored.overlay && restored.pause, 'context restored → overlay gone, pause menu shown');

  // --- 8. finish the campaign → save cleared → new layout in place ------------
  await g(() => { const game = window.__voxelstrike; game.state = 'playing'; game.hud.hideScreen(); game.levelIndex = 3; game.win(); });
  await sleep(200);
  check((await save()) === null, 'campaign complete clears the save');
  await sleep(1300); // win screen arms after 1.2s
  await clickBtn('#again-btn');
  await sleep(500);
  const nr = await g(() => ({ state: window.__voxelstrike.state, idx: window.__voxelstrike.levelIndex, seed: window.__voxelstrike.baseSeed, score: window.__voxelstrike.score }));
  check(nr.state === 'playing' && nr.idx === 1 && nr.score === 0, `"Play a new layout" → sector 1, score 0 (state=${nr.state})`);
  check(nr.seed !== s1.seed, 'new run gets a new layout seed');
  check(await samePage(), 'new run started without a page reload');

  // --- 9. title "New run" discards a save --------------------------------------
  await g(() => localStorage.setItem('voxelstrike-run', JSON.stringify({ ...JSON.parse('{}'), v: 1, seed: 5, sector: 3, score: 1, health: 100, armor: 0, ammo: { bullets: 48 }, owned: ['pistol'], current: 'pistol', totalKills: 0, totalEnemies: 0, totalSecretsFound: 0, totalSecrets: 0, totalTime: 0 })));
  await g(() => window.__voxelstrike.goToTitle());
  await sleep(300);
  check(await g(() => (document.querySelector('#continue-btn')?.textContent ?? '').includes('Sector 3')), 'a saved sector-3 run offers Continue');
  await clickBtn('#start-btn');
  await sleep(400);
  check((await save()) === null && (await g(() => window.__voxelstrike.levelIndex)) === 1, 'title "New run" discards the save and starts sector 1');
} finally {
  await browser.close();
}

if (errors.length) {
  console.log(`\nCHECKPOINT TEST FAILED (${errors.length})`);
  for (const e of errors) console.log('  -', e);
  process.exit(1);
}
console.log('\nCHECKPOINT TEST PASSED');

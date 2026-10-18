/** Optional Overload: two-wave lifecycle, real reward UI, firing and save/retry. */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const base = (process.argv[2] ?? 'http://localhost:5180').replace(/\/$/, '');
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);
mkdirSync('scripts/shots', { recursive: true });
const errors = [];
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${text}`); if (!ok) errors.push(text); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/?overload&seed=12345`, { waitUntil: 'networkidle0' });
  await page.click('#start-btn');
  await sleep(350);
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    // Freeze ambient enemies, keeping the challenge's newly spawned AI real.
    for (const e of g.enemies.list) e.update = () => {};
  });
  check(await page.evaluate(() => window.__voxelstrike.overload?.near(window.__voxelstrike)), 'test shortcut starts beside a valid terminal');
  await page.keyboard.press('KeyE'); await sleep(300);
  check(await page.evaluate(() => window.__voxelstrike.state === 'overload'), 'E opens the optional offer and pauses gameplay');
  await page.screenshot({ path: 'scripts/shots/overload-offer.png' });
  await page.click('#overload-back');
  check(await page.evaluate(() => window.__voxelstrike.overload.status === 'idle'), 'declining starts no enemies and preserves the campaign route');
  await page.keyboard.press('KeyE'); await sleep(300);
  await page.click('#overload-start');
  check(await page.evaluate(() => window.__voxelstrike.overload.status === 'active'), 'activation begins the challenge');
  const waves = await page.evaluate(() => {
    const g = window.__voxelstrike, o = g.overload;
    g.state = 'paused';
    const before = g.enemies.list.length, total = g.level.totalEnemies;
    // No spawns if the player retreats before the incoming wave.
    const p = g.player.pos.clone();
    g.player.pos.copy(g.level.spawn);
    o.update(2, g);
    const outside = g.enemies.list.length === before;
    g.player.pos.copy(p);
    let overlap = false;
    for (let i = 0; i < 20 && o.status === 'active'; i++) {
      o.update(2, g);
      for (const e of g.enemies.list.slice(before)) {
        if (!e.alive) continue;
        if (Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) < 4) overlap = true;
        e.damage(999, 0, -1, g);
      }
    }
    o.update(2, g);
    g.state = 'playing';
    return { outside, overlap, count: g.enemies.list.length - before, total: g.level.totalEnemies - total,
      kinds: g.enemies.list.slice(before).map((e) => e.kind), ready: o.status === 'ready', restart: o.start() };
  });
  check(waves.outside, 'retreating pauses incoming spawns');
  check(!waves.overlap, 'waves spawn on supported free tiles at least four units from the player');
  check(waves.ready && waves.count === 4 && waves.total === 4, 'two bounded waves clear and update the kill denominator exactly once');
  check(waves.kinds.filter((k) => k === 'husk').length === 3 && waves.kinds.filter((k) => k === 'sentinel').length === 1, 'challenge uses three Husks and one Sentinel');
  check(!waves.restart, 'completed challenge cannot be started again');
  await page.keyboard.press('KeyE'); await sleep(300);
  await page.screenshot({ path: 'scripts/shots/overload-rewards.png' });
  await page.click('#overload-focus');
  const focus = await page.evaluate(() => {
    const g = window.__voxelstrike, d = g.weapons.definition('shotgun');
    return { active: g.weapons.focusedShotgun, claimed: g.overload.status, name: document.querySelector('#weaponname').textContent,
      rate: d.rate, spread: d.spread, damage: d.damage, pellets: d.pellets, again: g.overload.claim('repair', g) };
  });
  check(focus.active && focus.claimed === 'claimed' && focus.name.includes('FOCUSED'), 'reward equips the focused shotgun and labels it in the HUD');
  check(Math.abs(focus.rate - 1.05 * 0.85) < 0.0001 && Math.abs(focus.spread - 0.062 * 0.65) < 0.0001 && focus.damage === 7 && focus.pellets === 7, 'focus tightens spread, slows firing and preserves pellet count/damage');
  check(!focus.again, 'claiming one reward prevents taking another');
  const firing = await page.evaluate(() => {
    const g = window.__voxelstrike, w = g.weapons;
    g.state = 'paused';
    w.pending = null; w.raiseT = 1;
    const realHitscan = w.hitscan;
    const sample = (focused) => {
      g.camera.rotation.set(0, 0, 0);
      g.camera.updateMatrixWorld(true);
      w.focusedShotgun = focused;
      w.cooldown = 0;
      const directions = [];
      w.hitscan = (_o, d) => directions.push(d.clone().toArray());
      const random = Math.random;
      Math.random = () => 0.75;
      try {
        g.player.ammo.shells = 40;
        g.input.pressFire();
        w.update(0.001, g.input, g);
        return { directions, cooldown: w.cooldown };
      } finally { Math.random = random; }
    };
    const plain = sample(false), focused = sample(true);
    w.hitscan = realHitscan;
    return { plain, focused };
  });
  check(firing.plain.directions.length === 7 && firing.focused.directions.length === 7 && firing.focused.cooldown > firing.plain.cooldown, 'actual firing path emits seven pellets and uses the slower focused cooldown');
  check(Math.abs(firing.focused.directions[0][0]) < Math.abs(firing.plain.directions[0][0]), 'actual focused pellet directions have tighter spread');
  const saves = await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.weapons.focusedShotgun = true;
    const cp = g.makeCheckpoint(2);
    g.applyCheckpoint(cp); g.buildLevel(); g.captureCheckpoint();
    const kept = g.weapons.focusedShotgun && g.overload.status === 'idle';
    const saved = JSON.parse(localStorage.getItem('voxelstrike-run')).focusedShotgun === true;
    g.retrySector(false);
    const retry = g.weapons.focusedShotgun && g.overload.status === 'idle';
    g.resetRun();
    return { kept, saved, retry, reset: !g.weapons.focusedShotgun };
  });
  check(saves.kept && saves.saved && saves.retry, 'sidegrade survives sector change, save and sector-entry retry');
  check(saves.reset, 'starting a new run removes the sidegrade');
  const caps = await page.evaluate(() => {
    const g = window.__voxelstrike, o = g.overload;
    o.status = 'ready'; g.player.health = 90; g.player.armor = 95;
    const repaired = o.claim('repair', g) && g.player.health === 100 && g.player.armor === 100;
    o.status = 'ready';
    const fullRepair = !o.canClaim('repair', g);
    g.weapons.restoreLoadout(['pistol', 'shotgun'], 'shotgun');
    g.player.ammo.shells = 58;
    const ammo = o.claim('ammo', g) && g.player.ammo.shells === 60;
    o.status = 'ready';
    const fullAmmo = !o.canClaim('ammo', g);
    g.weapons.focusedShotgun = true;
    return { repaired, fullRepair, ammo, fullAmmo, noStack: !o.canClaim('focus', g) };
  });
  check(caps.repaired && caps.fullRepair && caps.ammo && caps.fullAmmo && caps.noStack, 'repair/ammo obey caps and focus cannot stack');

  await page.setViewport({ width: 667, height: 375, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(`${base}/?overload&seed=12345`, { waitUntil: 'networkidle0' });
  // Avoid browser fullscreen changing the viewport under this layout test.
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.resolve(); });
  await page.tap('#start-btn');
  await sleep(400);
  await page.evaluate(() => { const g = window.__voxelstrike; for (const e of g.enemies.list) e.update = () => {}; });
  await page.waitForSelector('#overload-action:not([hidden])');
  await page.tap('#overload-action'); await sleep(300);
  const touch = await page.evaluate(() => {
    const screen = document.querySelector('.overload-screen'), start = document.querySelector('#overload-start');
    const rect = start?.getBoundingClientRect();
    return { open: !!screen, fits: !!rect && rect.bottom <= window.innerHeight && rect.top >= 0, overflow: document.documentElement.scrollWidth <= window.innerWidth };
  });
  await page.screenshot({ path: 'scripts/shots/overload-mobile.png' });
  check(touch.open && touch.fits && touch.overflow, 'touch action opens an offer with reachable controls on a 667×375 phone');
  await page.tap('#overload-start');
  check(await page.evaluate(() => window.__voxelstrike.overload.status === 'active'), 'touch activation starts the real encounter');

  // Reproduce the old one-pixel pseudo-element overflow from the first paint,
  // including the arming transition and a portrait phone's rotated game area.
  for (const [width, height] of [[1280, 720], [667, 375], [568, 320], [375, 667]]) {
    await page.setViewport({ width, height, isMobile: width < 700, hasTouch: width < 700 });
    for (const ready of [false, true]) {
      const layout = await page.evaluate(async (ready) => {
        const g = window.__voxelstrike;
        g.state = 'overload';
        g.hud.showOverload(ready, { focus: true, repair: true, ammo: true }, '+8 shells', () => {}, () => {}, () => {});
        const samples = [];
        for (let frame = 0; frame < 24; frame++) {
          await new Promise(requestAnimationFrame);
          const panel = document.querySelector('.overload-screen .panel');
          const content = document.querySelector('.overload-content');
          samples.push({ width: panel.clientWidth, height: panel.clientHeight,
            overflow: panel.scrollWidth > panel.clientWidth || panel.scrollHeight > panel.clientHeight ||
              content.scrollWidth > content.clientWidth || content.scrollHeight > content.clientHeight });
        }
        return { overflow: samples.some((s) => s.overflow),
          stable: samples.every((s) => s.width === samples[0].width && s.height === samples[0].height) };
      }, ready);
      check(!layout.overflow && layout.stable, `${ready ? 'reward' : 'offer'} ${width}×${height}: no scrollbar or layout shift from first paint`);
    }
  }
} finally { await browser.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }

/**
 * Survival — the quiet button under PLAY on the title (docs/RETENTION_PLAN.md
 * §4; it was PLAY for one Fit Test) drops you into a sealed arena; waves spawn at its edges, kills drop
 * supplies and SCRAP (a pickup that flies to you; the HUD counts it), each
 * cleared wave offers a pick of three and then a shop with gun pictures
 * (guns bought with scrap), wave 5 moves you to the next map, death ends the
 * run with your best wave, and Try again / Main menu work. Plus the title
 * layout (PLAY = Survival, Campaign quiet) and phone-size break screens.
 * Usage: node scripts/survival.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) failed++;
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);

/** kill every enemy of the current wave as it spawns, until the wave-clear screen shows */
const clearWave = (page, maxMs = 30000) => page.evaluate(async (maxMs) => {
  const g = window.__voxelstrike;
  const t0 = performance.now();
  while (performance.now() - t0 < maxMs) {
    if (document.querySelector('#wave-clear')) return true;
    g.player.health = g.player.maxHealth;
    for (const e of g.enemies.list) if (e.alive && !e.scripted) g.applyEnemyHit(e, 99999, 1, 0, false);
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}, maxMs);

/** pick the first card once the cards arm */
const pickFirst = async (page) => {
  await sleep(700);
  await page.evaluate(() => document.querySelector('#wave-clear .sc-perk')?.click());
  await sleep(300);
};

/** the whole break: the pick, then (if it opens) the shop's Continue */
const finishBreak = async (page) => {
  await pickFirst(page);
  await sleep(400);
  if (await page.evaluate(() => !!document.querySelector('#shop-screen'))) {
    await sleep(600);
    await page.evaluate(() => document.querySelector('#shop-go')?.click());
    await sleep(300);
  }
};

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#survival-btn');

  // 1. the title: PLAY is the campaign, Survival a quiet button under it
  const title = await page.evaluate(() => ({
    play: document.querySelector('#start-btn')?.className ?? '',
    camp: document.querySelector('#survival-btn')?.textContent?.trim() ?? '',
    campQuiet: document.querySelector('#survival-btn')?.classList.contains('tbtn-quiet') ?? false,
    goal: document.querySelector('.title-goal')?.textContent ?? '',
    steps: document.querySelectorAll('#title-steps .tstep').length,
  }));
  check(/tbtn-primary/.test(title.play) && title.camp === 'Survival' && title.campQuiet,
    `title: PLAY (the campaign) is the primary button, "Survival" sits quiet under it (${title.camp})`);
  check(/Escape the facility/i.test(title.goal) && title.steps === 3, `first visit: the campaign's "Escape the facility" + three steps (${title.goal})`);

  // 2. PLAY: a sealed arena, the player in its middle
  // (every spawn's distance from the player is recorded at the moment it appears)
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    window.__spawnD = [];
    const fx = g.spawnFX.bind(g);
    window.__spawnLos = [];
    g.spawnFX = (x, y, z) => {
      window.__spawnD.push(Math.hypot(x - g.player.pos.x, z - g.player.pos.z));
      if (g.survival) window.__spawnLos.push(g.hasLOS(g.player.pos.x, g.player.eyeY(), g.player.pos.z, x, 1.6, z));
      fx(x, y, z);
    };
  });
  await sleep(800);
  await page.click('#survival-btn');
  await sleep(1200);
  const start = await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.hud.clearHint();
    g.player.health = 99999;
    const r = g.level.rooms.find((q) => q.kind === 'arena');
    const p = g.player.pos;
    const inside = p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d;
    let gaps = 0;
    const ring = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) ring.push([x, r.z - 1], [x, r.z + r.d]);
    for (let z = r.z; z < r.z + r.d; z++) ring.push([r.x - 1, z], [r.x + r.w, z]);
    for (const [x, z] of ring) for (let y = 1; y <= 3; y++) if (!g.world.isSolid(x, y, z)) gaps++;
    let cover = 0, breakable = 0;
    for (let x = r.x; x < r.x + r.w; x++) for (let z = r.z; z < r.z + r.d; z++) {
      const b = g.world.get(x, 1, z);
      if (b === 11 || b === 15) breakable++;
      else if (b !== 0) cover++;
    }
    return { survival: !!g.survival, state: g.state, inside, gaps, theme: g.level.theme, enemies: g.level.enemies.length, pickups: g.pickups.items.length,
      w: r.w, d: r.d, cover, breakable, corner: g.survival.nav.stepsAt(r.x + 2.5, r.z + 2.5), far: !!g.survival.nav.dirAt(r.x + r.w - 2.5, r.z + r.d - 2.5) };
  });
  check(start.survival && start.state === 'playing', 'the Survival button starts a Survival run');
  check(start.inside && start.gaps === 0 && start.theme === 'facility', `map 1 is the Facility arena, walled off (gaps ${start.gaps}), the player inside`);
  check(start.enemies === 0 && start.pickups === 0, 'the arena starts empty: no campaign enemies or pickups');
  check(start.w >= 31 && start.d >= 29, `the Survival arena is big (${start.w} × ${start.d})`);
  check(start.cover >= 20 && start.breakable >= 12, `it has cover to hide behind (${start.cover} cells) and things to break (${start.breakable} crates / barrels)`);
  check(start.corner >= 0 && start.far, 'the flow field reaches the arena corners (enemies path around the cover)');

  // 3. wave 1 starts within a few seconds: a warning glow first, then the enemy rises out of it
  const glow = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      const lit = g.survival.fx.children.filter((m) => m.visible).length;
      if (lit) return { lit, enemies: g.enemies.list.filter((e) => e.alive).length };
      await new Promise((r) => setTimeout(r, 50));
    }
    return { lit: 0, enemies: -1 };
  });
  check(glow.lit > 0 && glow.enemies === 0, `a warning glow lights up before any enemy appears (${glow.lit} glowing)`);
  const rising = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const e = g.enemies.list.find((q) => q.alive && q.rise > 0 && q.rise < 0.5); // mid-rise (after its first update)
      if (e) return { below: e.mesh.position.y < e.pos.y - 0.2 };
      await new Promise((r) => setTimeout(r, 20));
    }
    return null;
  });
  check(!!rising && rising.below, 'the enemy climbs up out of the floor (its body starts below the floor)');
  await sleep(1500);
  const w1 = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const p = g.player.pos;
    const alive = g.enemies.list.filter((e) => e.alive);
    const near = Math.min(99, ...window.__spawnD);
    return {
      wave: g.survival.wave, phase: g.survival.phase, alive: alive.length, near,
      label: document.querySelector('#obj-label')?.textContent, text: document.querySelector('#obj-text')?.textContent ?? '',
    };
  });
  check(w1.wave === 1 && w1.phase === 'fight' && w1.alive > 0, `wave 1 is on within ~4 s (${w1.alive} enemies in)`);
  check(w1.near >= 5, `enemies spawn away from the player (closest ${w1.near.toFixed(1)} u when it appeared)`);
  const los = await page.evaluate(() => window.__spawnLos);
  check(los.length > 0 && los.filter(Boolean).length >= los.length - 1, `spawns happen where the player can see them (${los.filter(Boolean).length} / ${los.length} in sight)`);
  check(w1.label === 'WAVE' && /LEFT/.test(w1.text), `the HUD says WAVE 1 · ${w1.text}`);

  // 4. clear it: kills drop supplies, the wave-clear screen offers three
  const s0 = await page.evaluate(() => window.__voxelstrike.upgrades.scrap);
  check(await clearWave(page), 'killing every enemy ends wave 1 with the wave-clear screen');
  const clear1 = await page.evaluate((s0) => {
    const g = window.__voxelstrike;
    return {
      cards: document.querySelectorAll('#wave-clear .sc-perk').length, head: document.querySelector('#wave-clear h1')?.textContent,
      drops: g.pickups.items.filter((p) => p.spec.kind !== 'scrap').length, scrapDrops: g.pickups.items.filter((p) => p.spec.kind === 'scrap').length,
      looseScrap: g.pickups.items.filter((p) => p.spec.kind === 'scrap' && !p.taken).length,
      scrap: g.upgrades.scrap - s0, bank: g.upgrades.scrap, state: g.state, kills: g.survival.kills,
      shopOnPickScreen: !!document.querySelector('#wave-clear .shop-card, #wave-clear .wc-buy'),
    };
  }, s0);
  check(clear1.cards === 3 && clear1.state === 'intermission', `"${clear1.head}" offers 3 picks and pauses the arena`);
  check(!clear1.shopOnPickScreen, 'the pick screen is only the pick (the shop is its own screen)');
  check(clear1.drops >= 1, `kills dropped supplies (${clear1.drops} pickups from ${clear1.kills} kills)`);
  check(clear1.scrapDrops >= 1 && clear1.looseScrap === 0, `kills dropped scrap pickups (${clear1.scrapDrops}); what was left flew home at the clear`);
  const floor = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return g.pickups.items.filter((p) => !p.taken).every((p) => {
      const top = p.spec.y - (p.spec.kind === 'scrap' ? 0.35 : 0.4);
      return Math.abs(top - Math.round(top)) < 0.01 && g.world.isSolid(Math.floor(p.spec.x), Math.round(top) - 1, Math.floor(p.spec.z));
    });
  });
  check(floor, 'every drop sits on the floor (no supplies floating where a flyer died)');
  check(clear1.scrap >= 20, `kills + the clear paid scrap (+${clear1.scrap}), enough for the Scattergun`);
  await page.screenshot({ path: 'scripts/shots/survival-wave-clear.png' });

  // 5. pick → the shop: gun cards with pictures; the Scattergun costs 20 scrap and takes the next free slot
  await pickFirst(page);
  await sleep(500);
  const shopView = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-screen .shop-card')];
    return {
      open: !!document.querySelector('#shop-screen'), bank: document.querySelector('#shop-scrap')?.textContent,
      ids: cards.map((c) => c.dataset.id),
      pics: cards.filter((c) => c.dataset.id !== 'ammo').map((c) => { const i = c.querySelector('img'); return !!i && i.src.startsWith('data:image/png') && i.naturalWidth > 0; }),
      names: cards.map((c) => c.querySelector('.shop-name')?.textContent),
      go: !!document.querySelector('#shop-go'),
    };
  });
  check(shopView.open && shopView.ids.join() === 'shotgun,smg,rocket,arc,ammo' && shopView.go,
    `after the pick the shop opens: ${shopView.names.join(' | ')} + CONTINUE`);
  check(shopView.pics.length === 4 && shopView.pics.every(Boolean), 'every gun card shows a picture of the gun');
  await page.screenshot({ path: 'scripts/shots/survival-shop.png' });
  await sleep(300);
  const shop = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const bank0 = g.upgrades.scrap;
    document.querySelector('#shop-screen .shop-card[data-id="shotgun"]')?.click();
    await new Promise((r) => setTimeout(r, 100));
    return {
      bank0, bank: g.upgrades.scrap, has: g.weapons.has('shotgun'), slots: [...g.weapons.slots()],
      owned: document.querySelector('#shop-screen .shop-card[data-id="shotgun"] .shop-price')?.textContent ?? '',
      shopBank: document.querySelector('#shop-scrap')?.textContent, hud: document.querySelector('#scrap-num')?.textContent,
    };
  });
  check(shop.has && shop.bank === shop.bank0 - 20 && /OWNED/.test(shop.owned) && shop.shopBank === String(shop.bank) && shop.hud === String(shop.bank),
    `buying the Scattergun costs 20 scrap (${shop.bank0} → ${shop.bank}); the card says OWNED, shop + HUD show ${shop.hud}`);
  check(shop.slots.join() === 'pistol,shotgun', `it takes the next free slot (${shop.slots.join(', ')})`);
  await page.evaluate(() => document.querySelector('#shop-go')?.click());
  await sleep(300);
  const after = await page.evaluate(() => ({ state: window.__voxelstrike.state, phase: window.__voxelstrike.survival.phase, hud: !document.querySelector('#scrap').hidden }));
  check(after.state === 'playing' && after.phase === 'break', 'CONTINUE resumes the arena with a short break');
  check(after.hud, 'the HUD shows the scrap counter while playing');
  // a scrap pickup flies to the player from a few steps away and lands in the bank
  const fly = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const p = g.player.pos;
    let x = p.x + 3, z = p.z;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2.5, 2.5], [-2.5, -2.5]]) {
      if (!g.world.isSolid(Math.floor(p.x + dx), Math.floor(p.y), Math.floor(p.z + dz))) { x = p.x + dx; z = p.z + dz; break; }
    }
    const b0 = g.upgrades.scrap;
    g.spawnPickup('scrap', x, Math.floor(p.y) + 0.35, z, { amount: 7 });
    await new Promise((r) => setTimeout(r, 1500));
    return { gained: g.upgrades.scrap - b0, hud: document.querySelector('#scrap-num')?.textContent, bank: g.upgrades.scrap };
  });
  check(fly.gained === 7 && fly.hud === String(fly.bank), `scrap 3 u away flies in and banks +${fly.gained} (HUD ${fly.hud})`);
  await sleep(3600);
  const w2 = await page.evaluate(() => ({ wave: window.__voxelstrike.survival.wave, shotgun: window.__voxelstrike.weapons.has('shotgun') }));
  check(w2.wave === 2 && w2.shotgun, 'wave 2 starts, the bought Scattergun in hand');
  // slots fill in pickup order: a Thumper bought next sits in slot 3, key 3 picks it
  const slot3 = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.weapons.give('rocket');
    g.player.ammo.rockets = 5;
    await new Promise((r) => setTimeout(r, 600));
    g.weapons.switchTo('pistol');
    await new Promise((r) => setTimeout(r, 600));
    g.input.switchRequest = 2;
    await new Promise((r) => setTimeout(r, 700));
    const tags = [...document.querySelectorAll('#slots .slot small')].map((t) => t.textContent);
    return { current: g.weapons.current, tags };
  });
  check(slot3.current === 'rocket' && slot3.tags.join() === 'PST,SG,RKT', `slot 3 holds the third gun picked up (${slot3.tags.join(' ')}), key 3 selects it`);
  await page.screenshot({ path: 'scripts/shots/survival-wave2.png' });

  // 6. jump to wave 5: its clear moves the run to the next map
  check(await clearWave(page), 'wave 2 clears');
  await page.evaluate(() => { window.__voxelstrike.survival.wave = 4; });
  await finishBreak(page);
  await sleep(3600);
  const w5 = await page.evaluate(() => ({ wave: window.__voxelstrike.survival.wave, brutes: window.__voxelstrike.enemies.list.filter((e) => e.kind === 'brute').length }));
  check(w5.wave === 5, `wave 5 is the Facility's last (heavies in it: ${w5.brutes} so far)`);
  check(await clearWave(page, 45000), 'wave 5 clears');
  const evac = await page.evaluate(() => document.querySelector('#wave-clear .wc-next')?.textContent ?? '');
  check(/BIOFOUNDRY/.test(evac), `the map's last wave announces the next map ("${evac}")`);
  await finishBreak(page);
  await sleep(1200);
  const map2 = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const r = g.level.rooms.find((q) => q.kind === 'arena');
    const p = g.player.pos;
    return { theme: g.level.theme, state: g.state, inside: p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d, shotgun: g.weapons.has('shotgun') };
  });
  check(map2.theme === 'biofoundry' && map2.state === 'playing' && map2.inside && map2.shotgun, 'map 2 is the Biofoundry arena; the gear came along');
  await sleep(3200);
  check(await page.evaluate(() => window.__voxelstrike.survival.wave) === 6, 'wave 6 starts on the new map');
  await page.screenshot({ path: 'scripts/shots/survival-map2.png' });

  // 7. death ends the run: how far, the best, Try again / Main menu
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.buffs.shield = 0;
    g.player.health = 10;
    g.player.damage(9999, g, { x: g.player.pos.x + 1, z: g.player.pos.z, by: 'husk' });
  });
  await sleep(2400);
  const death = await page.evaluate(() => ({
    text: document.querySelector('.screen p')?.textContent ?? '',
    retry: document.querySelector('#retry-btn')?.textContent ?? '',
    menu: document.querySelector('#newrun-btn')?.textContent ?? '',
    best: localStorage.getItem('voxelstrike-survival-best'),
    upgrades: !!document.querySelector('#upgrades-btn'),
  }));
  check(/Reached wave 6/.test(death.text) && /Best: wave 6/.test(death.text), `the death screen: "${death.text.slice(0, 60)}…"`);
  check(death.retry.trim() === 'Try again' && death.menu.trim() === 'Main menu' && death.upgrades, 'buttons: Try again, Upgrades, Main menu');
  check(death.best === '6', `best wave saved (${death.best})`);
  await page.screenshot({ path: 'scripts/shots/survival-death.png' });

  // 8. Try again: a fresh run on map 1
  await page.evaluate(() => document.querySelector('#retry-btn').click());
  await sleep(1200);
  const again = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return { wave: g.survival?.wave, theme: g.level.theme, state: g.state, shotgun: g.weapons.has('shotgun'), health: g.player.health };
  });
  check(again.wave === 0 && again.theme === 'facility' && again.state === 'playing' && !again.shotgun, 'Try again starts over on map 1 with the sidearm');

  // 9. Main menu: back to the title, best wave in the footer, the campaign still plays
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.buffs.shield = 0;
    g.player.damage(9999, g, { x: g.player.pos.x + 1, z: g.player.pos.z, by: 'husk' });
  });
  await sleep(2400);
  await page.evaluate(() => document.querySelector('#newrun-btn').click());
  await sleep(800);
  const menu = await page.evaluate(() => ({ title: !!document.querySelector('#title-screen'), survival: window.__voxelstrike.survival, foot: document.querySelector('.title-foot')?.textContent ?? '' }));
  check(menu.title && menu.survival === null && /BEST WAVE 6/.test(menu.foot), 'Main menu returns to the title, showing BEST WAVE 6');
  await page.evaluate(() => document.querySelector('#start-btn').click());
  await sleep(1200);
  const camp = await page.evaluate(() => ({ survival: window.__voxelstrike.survival, theme: window.__voxelstrike.level.theme, enemies: window.__voxelstrike.level.enemies.length }));
  check(camp.survival === null && camp.theme === 'facility' && camp.enemies > 0, 'PLAY still starts the campaign');
  await page.close();

  // 10. a phone: the wave-clear screen fits
  const ph = await browser.newPage();
  ph.on('pageerror', (e) => errors.push(e.message));
  await ph.setViewport({ width: 667, height: 375, hasTouch: true, isMobile: true });
  await ph.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await ph.waitForSelector('#survival-btn');
  await sleep(800);
  await ph.tap('#survival-btn');
  await sleep(4500);
  await ph.evaluate(() => { window.__voxelstrike.player.health = 99999; });
  await clearWave(ph);
  await sleep(700);
  const fit = await ph.evaluate(() => {
    const cards = [...document.querySelectorAll('#wave-clear .sc-perk')].map((c) => c.getBoundingClientRect());
    return { n: cards.length, inside: cards.every((r) => r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1) };
  });
  await ph.screenshot({ path: 'scripts/shots/survival-wave-clear-phone.png' });
  check(fit.n === 3 && fit.inside, 'phone: the three picks fit a 667×375 screen');
  await ph.evaluate(() => document.querySelector('#wave-clear .sc-perk')?.click());
  await sleep(900);
  const shopFit = await ph.evaluate(() => {
    const els = [...document.querySelectorAll('#shop-screen .shop-card, #shop-go')].map((c) => c.getBoundingClientRect());
    return { n: els.length, inside: els.every((r) => r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1) };
  });
  await ph.screenshot({ path: 'scripts/shots/survival-shop-phone.png' });
  check(shopFit.n === 6 && shopFit.inside, `phone: the shop's 5 cards + CONTINUE fit a 667×375 screen (${shopFit.n})`);
  await ph.close();

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}

if (failed) {
  console.log(`SURVIVAL TEST FAILED (${failed})`);
  process.exit(1);
}
console.log('SURVIVAL TEST PASSED');

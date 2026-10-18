/**
 * Tool (not a test): renders every weapon skin on the real first-person view
 * model and tiles them into one contact sheet per gun (skins-sheet-<gun>.png),
 * for reviewing paint against reference/weapon-skins/. Clears the device's
 * skin progress in that browser profile.
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
// Usage: node scripts/skin-sheets.mjs [outDir] (dev server on :5173) — one contact sheet per gun
const OUT = process.argv[2] ?? 'scripts/shots';
mkdirSync(`${OUT}/skins`, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'] });
fakePointerLock(b);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pg = await b.newPage();
await pg.setViewport({ width: 1280, height: 720 });
await pg.goto('http://localhost:5173/?seed=12345', { waitUntil: 'networkidle0' });
await pg.evaluate(() => localStorage.removeItem('voxelstrike-skins'));
await pg.reload({ waitUntil: 'networkidle0' });
await pg.click('#start-btn');
await sleep(1500);
const ids = await pg.evaluate(async () => {
  const g = window.__voxelstrike;
  g.input.locked = true;
  for (const e of g.enemies.list) e.update = () => {};
  document.querySelector('#hud').style.visibility = 'hidden';
  g.weapons.restoreLoadout(['pistol','shotgun','smg','rocket','arc'], 'pistol');
  const { SKINS } = await import('/src/core/skins.ts');
  // a neutral lit spot: look at the floor ahead
  return [ ...['pistol','shotgun','smg','rocket','arc'].map((w) => `${w}.standard`), ...SKINS.map((s) => s.id)];
});
const files = [];
for (const id of ids) {
  const [w, name] = id.split('.');
  await pg.evaluate(async (w, id, std) => {
    const g = window.__voxelstrike;
    const { SKIN_BY_ID } = await import('/src/core/skins.ts');
    g.weapons.setSkin(w, std ? null : SKIN_BY_ID.get(id));
    g.weapons.restoreLoadout(['pistol','shotgun','smg','rocket','arc'], w);
    g.player.pitch = -0.2;
  }, w, id, name === 'standard');
  await sleep(450);
  const f = `${OUT}/skins/${id}.png`;
  await pg.screenshot({ path: f, clip: { x: 640, y: 330, width: 640, height: 390 } });
  files.push([id, f]);
}
// contact sheets: one per weapon
const page2 = await b.newPage();
for (const w of ['pistol','shotgun','smg','rocket','arc']) {
  const mine = files.filter(([id]) => id.startsWith(w + '.'));
  const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,320px);gap:4px;font:bold 12px monospace;color:#eee">${mine.map(([id, f]) => `<div><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:320px;display:block"><div style="padding:2px 4px">${id}</div></div>`).join('')}</body>`;
  await page2.setViewport({ width: 1292, height: Math.ceil(mine.length / 4) * 216 });
  await page2.setContent(html);
  await page2.screenshot({ path: `${OUT}/skins-sheet-${w}.png` });
}
await b.close();

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
mkdirSync('scripts/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('#hud');
await page.click('#start-btn');
await new Promise((r) => setTimeout(r, 600));

const kinds = ['ammoBullets', 'ammoShells', 'healthSmall', 'keyRed', 'weaponShotgun'];
for (const kind of kinds) {
  const ok = await page.evaluate((k) => {
    const g = window.__voxelstrike;
    const p = g.level.pickups.find((q) => q.kind === k);
    if (!p) return false;
    // stand 2.5 units away looking at the item
    g.player.pos.set(p.x + 2.5, 2.0, p.z);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = Math.atan2(-(p.x - g.player.pos.x), -(p.z - g.player.pos.z));
    g.player.pitch = -0.25;
    return true;
  }, kind);
  if (!ok) {
    console.log(`skip ${kind} (not in level)`);
    continue;
  }
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: `scripts/shots/pickup-${kind}.png` });
  console.log(`shot pickup-${kind}.png`);
}
await browser.close();

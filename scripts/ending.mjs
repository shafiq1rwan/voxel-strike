import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
});
fakePointerLock(browser); // keep the real OS cursor free
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.argv[2] ?? 'http://localhost:5173/?seed=12345', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#start-btn');
  await new Promise(resolve => setTimeout(resolve, 900));
  await page.click('#start-btn');
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 3;
    g.win();
  });
  await page.waitForSelector('.terminal-screen');
  assert.equal(await page.$('.screen h1'), null, 'results must wait for the story');
  await page.waitForFunction(() => {
    const text = document.querySelector('#terminal-text').textContent;
    return text.length > 0 && text.length < 20;
  });
  await page.waitForFunction(() => document.querySelector('.terminal-action').textContent === 'CONTINUE TO RESULTS');
  const story = await page.$eval('#terminal-text', el => el.textContent);
  assert.equal(story, 'UPPER FACILITY OFFLINE\n\nUnknown power source detected below.\n\nDescending to Sector 4…');
  mkdirSync('scripts/shots', { recursive: true });
  await page.screenshot({ path: 'scripts/shots/ending.png' });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#again-btn');
  assert.equal(await page.$('.terminal-screen'), null);

  // Co-op client uses the same story, with reveal before continue.
  await page.evaluate(() => window.__voxelstrike.netShowWin(true, 'CAMPAIGN COMPLETE', 'Test results'));
  await new Promise(resolve => setTimeout(resolve, 750));
  await page.click('.terminal-action');
  assert.equal(await page.$eval('#terminal-text', el => el.textContent), story);
  await page.click('.terminal-action');
  await page.waitForSelector('#again-btn');

  // Reduced motion displays the full transmission immediately, even on a small screen.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 667, height: 375 });
  await page.evaluate(() => window.__voxelstrike.netShowWin(true, 'CAMPAIGN COMPLETE', 'Test results'));
  assert.equal(await page.$eval('#terminal-text', el => el.textContent), story);
  assert.ok(await page.$eval('.terminal-panel', el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  }), 'terminal must fit a phone in landscape');
  await page.screenshot({ path: 'scripts/shots/ending-mobile.png' });
  await page.evaluate(() => window.__voxelstrike.hud.hideScreen());
  assert.equal(await page.$('.terminal-screen'), null);
  assert.deepEqual(errors, []);
  console.log('PASS: ending types, reveals, continues, supports co-op and reduced motion, and fits mobile');
} finally {
  await browser.close();
}

/**
 * Downloads the files of a free / pay-what-you-want itch.io project through
 * the normal anonymous browser flow ("Download Now" → "No thanks" → download).
 * Check the project's license before using what you download.
 *
 * Usage: node scripts/itch-download.mjs <project-url> <output-dir>
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const [url, outDirArg] = process.argv.slice(2);
if (!url) {
  console.error('usage: node scripts/itch-download.mjs <itch-project-url> <output-dir>');
  process.exit(1);
}
const outDir = resolve(outDirArg ?? 'downloads');
mkdirSync(outDir, { recursive: true });

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: outDir,
    eventsEnabled: true,
  });

  console.log('opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // step 1: "Download Now" opens the pay-what-you-want lightbox (JS click —
  // some layouts keep an offscreen duplicate that isn't coordinate-clickable)
  const hasBuy = await page.evaluate(() => {
    const btn = document.querySelector('a.buy_btn, .buy_row a.button');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (hasBuy) {
    await new Promise((r) => setTimeout(r, 1500));
    // step 2: decline paying — "No thanks, just take me to the downloads"
    const declined = await page.evaluate(() => {
      const link = [...document.querySelectorAll('a')].find((a) =>
        a.textContent.toLowerCase().includes('no thanks')
      );
      if (link) {
        link.click();
        return true;
      }
      return false;
    });
    console.log(declined ? 'declined payment, going to downloads' : 'no payment prompt');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  }

  // step 3: click every download button on the downloads page
  await new Promise((r) => setTimeout(r, 1000));
  const count = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('a.button.download_btn, .upload .download_btn')];
    btns.forEach((b) => b.click());
    return btns.length;
  });
  console.log(`clicked ${count} download button(s), waiting for files...`);
  if (count === 0) {
    console.error('no download buttons found — page layout may differ');
    process.exit(2);
  }

  // wait for downloads to finish (no .crdownload files, sizes stable)
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < 120000 && !done) {
    await new Promise((r) => setTimeout(r, 1000));
    const files = readdirSync(outDir);
    const partial = files.some((f) => f.endsWith('.crdownload'));
    done = files.length >= count && !partial;
  }
  for (const f of readdirSync(outDir)) {
    console.log(`downloaded: ${f} (${statSync(resolve(outDir, f)).size} bytes)`);
  }
} finally {
  await browser.close();
}

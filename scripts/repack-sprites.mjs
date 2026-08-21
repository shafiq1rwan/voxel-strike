/**
 * Repacks a downloaded sprite sheet into the game's fixed 5-row layout
 * (idle / walk / attack / pain / death — see public/sprites/README.md).
 *
 * Inspect mode (emit an enlarged, grid-labeled contact sheet):
 *   node scripts/repack-sprites.mjs inspect <sheet.png> <frameW> <frameH> <out.png>
 *
 * Pack mode (JSON config):
 *   node scripts/repack-sprites.mjs pack <config.json>
 *
 * Config format — frames are addressed as "col,row" in the SOURCE sheet:
 * {
 *   "src": "path/to/sheet.png", "frameW": 32, "frameH": 32,
 *   "out": "public/sprites/troll.png",
 *   "idle":   ["0,0", "1,0"],
 *   "walk":   ["0,1", "1,1", "2,1"],
 *   "attack": ["0,2", "1,2"],
 *   "pain":   ["0,0"],
 *   "death":  ["0,3", "1,3"]        // or "auto" to synthesize a collapse
 * }
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const ROWS = ['idle', 'walk', 'attack', 'pain', 'death'];

function loadPNG(path) {
  return PNG.sync.read(readFileSync(path));
}

function savePNG(path, png) {
  writeFileSync(path, PNG.sync.write(png));
}

function getFrame(src, fw, fh, col, row) {
  const out = new PNG({ width: fw, height: fh });
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const si = ((row * fh + y) * src.width + col * fw + x) * 4;
      const di = (y * fw + x) * 4;
      if (si + 3 >= src.data.length) continue;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function blitFrame(dst, frame, col, row, fw, fh) {
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const si = (y * fw + x) * 4;
      const di = ((row * fh + y) * dst.width + col * fw + x) * 4;
      dst.data[di] = frame.data[si];
      dst.data[di + 1] = frame.data[si + 1];
      dst.data[di + 2] = frame.data[si + 2];
      dst.data[di + 3] = frame.data[si + 3];
    }
  }
}

/** squash a frame toward the floor by factor k (0=untouched, 1=flat puddle) */
function collapseFrame(frame, k) {
  const { width: fw, height: fh } = frame;
  const out = new PNG({ width: fw, height: fh });
  // find the lowest opaque row (the feet) so the squash anchors to the ground
  let bottom = fh - 1;
  outer: for (let y = fh - 1; y >= 0; y--) {
    for (let x = 0; x < fw; x++) {
      if (frame.data[(y * fw + x) * 4 + 3] > 40) {
        bottom = y;
        break outer;
      }
    }
  }
  const squish = 1 - k * 0.8;
  const dim = 1 - k * 0.45;
  // anchor the squashed remains at the FRAME bottom (not the creature's own
  // original height) so the corpse visually rests on the ground
  const anchor = fh - 2;
  for (let y = 0; y <= anchor; y++) {
    for (let x = 0; x < fw; x++) {
      // sample from the unsquashed image
      const sy = Math.round(bottom - (anchor - y) / squish);
      if (sy < 0 || sy >= fh) continue;
      const si = (sy * fw + x) * 4;
      if (frame.data[si + 3] < 40) continue;
      const di = (y * fw + x) * 4;
      out.data[di] = Math.round(frame.data[si] * dim);
      out.data[di + 1] = Math.round(frame.data[si + 1] * dim);
      out.data[di + 2] = Math.round(frame.data[si + 2] * dim);
      out.data[di + 3] = frame.data[si + 3];
    }
  }
  return out;
}

const [mode, ...args] = process.argv.slice(2);

if (mode === 'inspect') {
  const [sheetPath, fwS, fhS, outPath] = args;
  const fw = Number(fwS), fh = Number(fhS);
  const src = loadPNG(sheetPath);
  const cols = Math.floor(src.width / fw);
  const rows = Math.floor(src.height / fh);
  const S = 4; // upscale
  const pad = 2;
  const out = new PNG({ width: cols * (fw * S + pad), height: rows * (fh * S + pad) });
  // checkerboard backdrop so transparency is visible
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4;
      const c = ((x >> 3) + (y >> 3)) % 2 ? 40 : 56;
      out.data[i] = c; out.data[i + 1] = c; out.data[i + 2] = c + 8; out.data[i + 3] = 255;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let y = 0; y < fh * S; y++) {
        for (let x = 0; x < fw * S; x++) {
          const si = ((r * fh + (y / S) | 0) * src.width + c * fw + ((x / S) | 0)) * 4;
          if (src.data[si + 3] < 40) continue;
          const di = ((r * (fh * S + pad) + y) * out.width + c * (fw * S + pad) + x) * 4;
          out.data[di] = src.data[si];
          out.data[di + 1] = src.data[si + 1];
          out.data[di + 2] = src.data[si + 2];
          out.data[di + 3] = 255;
        }
      }
    }
  }
  savePNG(outPath, out);
  console.log(`inspect sheet: ${cols} cols x ${rows} rows of ${fw}x${fh} -> ${outPath}`);
} else if (mode === 'pack') {
  const cfg = JSON.parse(readFileSync(args[0], 'utf8'));
  const src = loadPNG(cfg.src);
  const fw = cfg.frameW, fh = cfg.frameH;
  const parse = (s) => s.split(',').map(Number);

  const frames = {};
  for (const row of ROWS) {
    const spec = cfg[row];
    if (spec === 'auto' && row === 'death') {
      const base = getFrame(src, fw, fh, ...parse((cfg.idle ?? ['0,0'])[0]));
      frames.death = [0.2, 0.45, 0.7, 0.9].map((k) => collapseFrame(base, k));
    } else if (Array.isArray(spec) && spec.length) {
      frames[row] = spec.map((s) => getFrame(src, fw, fh, ...parse(s)));
    } else {
      frames[row] = [getFrame(src, fw, fh, ...parse((cfg.idle ?? ['0,0'])[0]))];
    }
  }

  const counts = Object.fromEntries(ROWS.map((r) => [r, frames[r].length]));
  const maxCols = Math.max(...Object.values(counts));
  const out = new PNG({ width: maxCols * fw, height: ROWS.length * fh });
  ROWS.forEach((row, ri) => {
    frames[row].forEach((f, ci) => blitFrame(out, f, ci, ri, fw, fh));
  });
  savePNG(cfg.out, out);
  console.log(`packed ${cfg.out} (${out.width}x${out.height})`);
  console.log('manifest counts:', JSON.stringify(counts));
} else {
  console.error('mode must be "inspect" or "pack"');
  process.exit(1);
}

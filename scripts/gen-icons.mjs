/**
 * Generates the PWA icons (public/icons/icon-192.png, icon-512.png):
 * the extruded voxel "V" wordmark glyph on the void background, with the
 * three keycard bars beneath. Content stays inside the maskable safe zone.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// -- minimal PNG encoder (same as gen-demo-sprite.mjs) -----------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -- icon art -----------------------------------------------------------------
const V = ['10001', '10001', '10001', '10001', '01010', '01010', '00100'];

function makeIcon(S) {
  const rgba = Buffer.alloc(S * S * 4);
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, r, g, b) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b);
  };

  // void background with faint scanlines (full bleed for maskable)
  for (let y = 0; y < S; y++) {
    const dark = y % Math.max(3, Math.round(S / 48)) === 0;
    for (let x = 0; x < S; x++) set(x, y, dark ? 3 : 5, dark ? 4 : 6, dark ? 8 : 10);
  }

  // extruded voxel "V", centered in the safe zone
  const block = Math.floor(S / 15);
  const ex = Math.max(2, Math.round(block / 3.5));
  const gw = 5 * block;
  const gh = 7 * block;
  const gx = Math.round((S - gw) / 2);
  const gy = Math.round((S - gh) / 2) - Math.round(S * 0.05);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (V[r][c] !== '1') continue;
      const f = 1.08 - r * 0.055;
      const face = [Math.min(255, Math.round(255 * f)), Math.round(208 * f), Math.round(40 * f)];
      rect(gx + c * block + ex, gy + r * block + ex, block, block, 74, 60, 12);
      rect(gx + c * block, gy + r * block, block, block, ...face);
    }
  }

  // keycard bars beneath: red / blue / yellow
  const barW = Math.round(block * 2.1);
  const barH = Math.max(3, Math.round(block * 0.7));
  const barY = gy + gh + Math.round(block * 1.2);
  const total = barW * 3 + block;
  const bx = Math.round((S - total) / 2);
  const cols = [[255, 52, 40], [56, 120, 255], [255, 208, 40]];
  cols.forEach((c, i) => {
    rect(bx + i * (barW + Math.round(block / 2)), barY, barW, barH, ...c);
  });

  return encodePNG(S, S, rgba);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', makeIcon(192));
writeFileSync('public/icons/icon-512.png', makeIcon(512));
console.log('wrote public/icons/icon-192.png and icon-512.png');

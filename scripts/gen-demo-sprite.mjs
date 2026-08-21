/**
 * Generates the demo enemy sprite sheet (public/sprites/demo-husk.png) so the
 * billboard-sprite system has something to show without external assets.
 * Sheet layout (48x48 frames): row 0 idle(2), row 1 walk(4), row 2 attack(3),
 * row 3 pain(1), row 4 death(5). Same layout any itch.io sheet should follow
 * (see public/sprites/README.md).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------------------------------------------------------------- PNG encode
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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- pixel art
const F = 48; // frame size
const PAL = {
  O: [30, 14, 10],    // outline
  B: [148, 62, 34],   // rust body
  D: [104, 40, 22],   // shaded body
  L: [196, 104, 58],  // belly
  E: [255, 204, 51],  // eye glow
  W: [235, 238, 242], // teeth / pain eyes
  C: [40, 28, 20],    // claws
  M: [22, 8, 6],      // maw
};

function makeFrame(pose) {
  const g = Array.from({ length: F }, () => Array(F).fill(null));
  const set = (x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < F && y >= 0 && y < F) g[y][x] = c;
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, c);
  };
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = 0; y < F; y++) {
      for (let x = 0; x < F; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c);
      }
    }
  };

  const col = pose.collapse ?? 0;
  const xs = pose.xshift ?? 0;
  const bob = pose.bob ?? 0;
  const cx = 24 + xs;
  const bodyCy = 23 + bob + col * 14;
  const rx = 11 + col * 5;
  const ry = Math.max(3, 11 * (1 - col * 0.72));

  // legs (gone once it starts collapsing)
  if (col < 0.2) {
    const p = pose.legPhase ?? 0;
    const liftL = [0, 3, 0, 1][p];
    const liftR = [1, 0, 3, 0][p];
    rect(cx - 9, 46 - (11 - liftL), 5, 11 - liftL, PAL.D);
    rect(cx + 4, 46 - (11 - liftR), 5, 11 - liftR, PAL.D);
    rect(cx - 9, 44 - liftL, 5, 2, PAL.C);
    rect(cx + 4, 44 - liftR, 5, 2, PAL.C);
  }

  // body
  ell(cx, bodyCy, rx, ry, PAL.B);
  // shading pass (lower-right)
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      if (g[y][x] === PAL.B && (x - cx > rx * 0.45 || y - bodyCy > ry * 0.45)) g[y][x] = PAL.D;
    }
  }
  // belly highlight
  if (col < 0.6) ell(cx - 2, bodyCy + 2, rx * 0.45, ry * 0.4, PAL.L);

  // horns
  if (col < 0.9) {
    set(cx - 7, bodyCy - ry - 1, PAL.C); set(cx - 8, bodyCy - ry - 2, PAL.C); set(cx - 8, bodyCy - ry - 3, PAL.C);
    set(cx + 7, bodyCy - ry - 1, PAL.C); set(cx + 8, bodyCy - ry - 2, PAL.C); set(cx + 8, bodyCy - ry - 3, PAL.C);
  }

  // arms: hang low or raise for the slash
  if (col < 0.2) {
    const raise = pose.arm ?? 0;
    const armY = Math.round(bodyCy - 1 - raise * 13);
    for (const side of [-1, 1]) {
      const ax = cx + side * (rx + 1);
      rect(ax - 1, armY, 3, 10, PAL.D);
      rect(ax - 2, armY + (raise > 0.5 ? -2 : 9), 5, 3, PAL.C); // claw
    }
  }

  // face
  if (col < 0.85) {
    const eyeC = pose.pain ? PAL.W : PAL.E;
    rect(cx - 6, bodyCy - 5, 3, 2, eyeC);
    rect(cx + 3, bodyCy - 5, 3, 2, eyeC);
    const maw = pose.maw ?? 0;
    if (maw > 0) {
      const mh = Math.round(2 + maw * 5);
      rect(cx - 6, bodyCy + 1, 12, mh, PAL.M);
      for (let x = cx - 6; x < cx + 6; x += 2) set(x, bodyCy + 1, PAL.W); // teeth
    } else {
      rect(cx - 5, bodyCy + 2, 10, 1, PAL.M);
    }
  } else {
    // dead: dim eyes in the puddle
    rect(cx - 5, bodyCy - 1, 2, 1, PAL.D);
    rect(cx + 3, bodyCy - 1, 2, 1, PAL.D);
  }

  // outline pass: any solid pixel touching transparency gets the outline color
  const out = Array.from({ length: F }, () => Array(F).fill(null));
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      if (!g[y][x]) continue;
      const edge =
        !g[y - 1]?.[x] || !g[y + 1]?.[x] || !g[y][x - 1] || !g[y][x + 1];
      out[y][x] = edge ? PAL.O : g[y][x];
    }
  }
  return out;
}

// ---------------------------------------------------------------- the sheet
const ROWS = [
  [{ bob: 0 }, { bob: 1 }],                                                          // idle
  [
    { legPhase: 0, bob: 0 }, { legPhase: 1, bob: 1 },
    { legPhase: 2, bob: 0 }, { legPhase: 3, bob: 1 },
  ],                                                                                  // walk
  [{ arm: 0.6, maw: 0.3 }, { arm: 1, maw: 0.7, xshift: 1 }, { arm: 0.1, maw: 1, xshift: 3 }], // attack
  [{ pain: true, xshift: -2, maw: 0.5 }],                                             // pain
  [
    { collapse: 0.15, maw: 1 }, { collapse: 0.35, maw: 0.8 }, { collapse: 0.55 },
    { collapse: 0.8 }, { collapse: 1 },
  ],                                                                                  // death
];

const cols = Math.max(...ROWS.map((r) => r.length));
const W = F * cols;
const H = F * ROWS.length;
const rgba = Buffer.alloc(W * H * 4);

ROWS.forEach((row, ri) => {
  row.forEach((pose, ci) => {
    const px = makeFrame(pose);
    for (let y = 0; y < F; y++) {
      for (let x = 0; x < F; x++) {
        const c = px[y][x];
        if (!c) continue;
        const idx = ((ri * F + y) * W + ci * F + x) * 4;
        rgba[idx] = c[0];
        rgba[idx + 1] = c[1];
        rgba[idx + 2] = c[2];
        rgba[idx + 3] = 255;
      }
    }
  });
});

mkdirSync('public/sprites', { recursive: true });
writeFileSync('public/sprites/demo-husk.png', encodePNG(W, H, rgba));
console.log(`wrote public/sprites/demo-husk.png (${W}x${H}, ${cols} cols x ${ROWS.length} rows)`);

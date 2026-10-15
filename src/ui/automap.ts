import { Block } from '../world/blocks';
import type { Game } from '../game';

/**
 * Doom-style automap overlay (Tab / M, MAP button on touch). The map fills in
 * as the player SEES cells — reveal is line-of-sight checked, so unexplored
 * rooms stay dark. Drawn from the plain voxel grid onto a pixelated canvas;
 * the game keeps running underneath.
 */

const SCALE = 4; // canvas px per world cell
const REVEAL_RADIUS = 10;
/** desktop minimap: cells shown either side of the player (canvas = 31 cells × 4px = 124px) */
const MINI_R = 15;

const CSS = `
#automap-wrap {
  position: absolute; inset: 0; display: none; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px;
  pointer-events: none; z-index: 5; background: rgba(5,6,10,.45);
}
#automap-wrap.open { display: flex; }
#automap-title {
  font: bold 13px 'Courier New', Courier, monospace; letter-spacing: .3em;
  text-indent: .3em; color: #8a94a8; text-shadow: 1px 1px 0 #000;
  text-transform: uppercase;
}
/* doubled-up selector: must out-rank index.html's "#app canvas" full-screen rule */
#hud #automap-wrap #automap-canvas {
  width: min(72vmin, 500px); height: auto; image-rendering: pixelated;
  background: rgba(3,4,8,.94); border: 1px solid #39404f;
  box-shadow: 0 0 0 1px #000, 0 12px 40px rgba(0,0,0,.6);
}
#automap-hint {
  font: 11px 'Courier New', Courier, monospace; letter-spacing: .2em;
  color: #566076; text-shadow: 1px 1px 0 #000;
}
#automap-hint .touch, #automap-close { display: none; }
/* touch: the whole overlay is the close target (it sits above the touch
   controls, which would otherwise swallow the tap as a look-drag), plus an
   explicit close button; the map shrinks so both fit a short landscape phone */
body.touch-mode #automap-wrap {
  pointer-events: auto; touch-action: none; gap: 6px; background: rgba(5,6,10,.72);
}
/* the top status bar lives where the title would go; the objective tracker
   already names the sector */
body.touch-mode #automap-title { display: none; }
body.touch-mode #hud #automap-wrap #automap-canvas { width: min(60vmin, 420px); }
body.touch-mode #automap-hint .desktop { display: none; }
body.touch-mode #automap-hint .touch { display: inline; }
body.touch-mode #automap-close {
  display: block; padding: 8px 22px; border: 2px solid #ffd028; border-radius: 8px;
  background: rgba(10,13,20,.85); color: #ffd028;
  font: bold 13px 'Courier New', Courier, monospace; letter-spacing: .2em;
}
`;

const LOCK_COLORS: Record<string, string> = { red: '#ff3428', blue: '#3878ff', yellow: '#ffd028' };

export class Automap {
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private title: HTMLElement;
  /** 0 = unknown, 1 = seen floor, 2 = seen wall */
  private explored = new Uint8Array(0);
  private sx = 0;
  private sz = 0;
  private markTick = 0;
  private drawTick = 0;
  private miniTick = 0;
  /** always-on corner map (desktop only — hidden by CSS in touch mode) */
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  visible = false;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.id = 'automap-wrap';
    this.wrap.innerHTML = `
      <div id="automap-title"></div>
      <canvas id="automap-canvas"></canvas>
      <button id="automap-close">&#10005; CLOSE MAP</button>
      <div id="automap-hint"><span class="desktop">TAB / M CLOSES THE MAP</span><span class="touch">TAP ANYWHERE TO CLOSE</span></div>
    `;
    parent.appendChild(this.wrap);
    // touch: any tap on the overlay (map, button, or the dimmed game) closes it.
    // Only reachable in touch mode — on desktop the overlay ignores the pointer.
    this.wrap.addEventListener('touchstart', (e) => {
      e.preventDefault(); // no synthetic click / look-drag from the closing tap
      this.setVisible(false);
    }, { passive: false });
    this.canvas = this.wrap.querySelector('#automap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.title = this.wrap.querySelector('#automap-title') as HTMLElement;
    this.mini = document.createElement('canvas');
    this.mini.id = 'minimap';
    this.mini.width = this.mini.height = (MINI_R * 2 + 1) * SCALE;
    parent.insertBefore(this.mini, this.wrap); // under the full automap overlay
    this.miniCtx = this.mini.getContext('2d')!;
  }

  /** new level: forget everything */
  reset(game: Game): void {
    this.sx = game.world.sx;
    this.sz = game.world.sz;
    this.explored = new Uint8Array(this.sx * this.sz);
    this.canvas.width = this.sx * SCALE;
    this.canvas.height = this.sz * SCALE;
    this.miniCtx.clearRect(0, 0, this.mini.width, this.mini.height);
    this.miniTick = 0;
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.wrap.classList.toggle('open', v);
  }

  toggle(game: Game): void {
    this.setVisible(!this.visible);
    if (this.visible) {
      this.title.textContent = `Sector ${game.levelIndex} · Automap`;
      this.draw(game);
      this.drawTick = 0.12;
    }
  }

  update(dt: number, game: Game): void {
    this.markTick -= dt;
    if (this.markTick <= 0) {
      this.markTick = 0.15;
      this.mark(game);
    }
    if (this.visible) {
      this.drawTick -= dt;
      if (this.drawTick <= 0) {
        this.drawTick = 0.12;
        this.draw(game);
      }
    } else if (!document.body.classList.contains('touch-mode')) {
      this.miniTick -= dt;
      if (this.miniTick <= 0) {
        this.miniTick = 0.1;
        this.drawMini(game);
      }
    }
  }

  /** a cell counts as walkable floor if it has air at body height */
  private isFloor(game: Game, x: number, z: number): boolean {
    return !game.world.isSolid(x, 1, z) || !game.world.isSolid(x, 2, z);
  }

  /** reveal LOS-visible floor cells around the player (+ their bounding walls) */
  private mark(game: Game): void {
    const p = game.player;
    const px = Math.floor(p.pos.x);
    const pz = Math.floor(p.pos.z);
    const eyeY = p.eyeY();
    for (let z = pz - REVEAL_RADIUS; z <= pz + REVEAL_RADIUS; z++) {
      for (let x = px - REVEAL_RADIUS; x <= px + REVEAL_RADIUS; x++) {
        if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) continue;
        const idx = x + z * this.sx;
        if (this.explored[idx] === 1) continue;
        const dd = (x - px) ** 2 + (z - pz) ** 2;
        if (dd > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        if (!this.isFloor(game, x, z)) continue;
        if (dd > 2 && !game.world.hasLOS(p.pos.x, eyeY, p.pos.z, x + 0.5, 1.6, z + 0.5)) continue;
        this.explored[idx] = 1;
        // the walls bounding a seen floor cell are seen too
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= this.sx || nz >= this.sz) continue;
          const nIdx = nx + nz * this.sx;
          if (this.explored[nIdx] === 0 && !this.isFloor(game, nx, nz)) this.explored[nIdx] = 2;
        }
      }
    }
  }

  /** full-screen automap: the whole sector, yellow player arrow */
  private draw(game: Game): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawRegion(game, this.ctx, 0, 0, this.sx, this.sz, '#ffd028');
  }

  /** desktop corner map: a north-up window centred on the player, green arrow */
  private drawMini(game: Game): void {
    const ctx = this.miniCtx;
    ctx.clearRect(0, 0, this.mini.width, this.mini.height);
    const x0 = Math.floor(game.player.pos.x) - MINI_R;
    const z0 = Math.floor(game.player.pos.z) - MINI_R;
    ctx.save();
    ctx.translate(-x0 * SCALE, -z0 * SCALE);
    this.drawRegion(game, ctx, x0, z0, x0 + MINI_R * 2 + 1, z0 + MINI_R * 2 + 1, '#4cc26a');
    ctx.restore();
  }

  /** seen cells, lift, doors, keycard and player arrow within [x0,x1) × [z0,z1), in world-cell coords */
  private drawRegion(
    game: Game, ctx: CanvasRenderingContext2D,
    x0: number, z0: number, x1: number, z1: number, arrowColor: string,
  ): void {
    const S = SCALE;
    const seen = (x: number, z: number): number =>
      x < 0 || z < 0 || x >= this.sx || z >= this.sz ? 0 : this.explored[x + z * this.sx];

    // seen cells
    for (let z = Math.max(0, z0); z < Math.min(this.sz, z1); z++) {
      for (let x = Math.max(0, x0); x < Math.min(this.sx, x1); x++) {
        const v = this.explored[x + z * this.sx];
        if (v === 0) continue;
        if (v === 2) {
          ctx.fillStyle = '#707a90';
        } else {
          // exit pads glow green on the map
          let pad = false;
          for (let y = 1; y <= 4 && !pad; y++) pad = game.world.get(x, y, z) === Block.ExitPad;
          ctx.fillStyle = pad ? '#4cc26a' : '#323e58';
        }
        ctx.fillRect(x * S, z * S, S, S);
      }
    }

    // elevator platform
    if (game.elevator) {
      const e = game.elevator.spec;
      if (seen(e.x, e.z)) {
        ctx.fillStyle = '#55e0ff';
        ctx.fillRect(e.x * S, e.z * S, 2 * S, 2 * S);
      }
    }

    // doors: lock color while locked, steel once usable
    for (const d of game.doors) {
      const cells: Array<[number, number]> = d.spec.dir === 'x'
        ? [[d.spec.x, d.spec.z], [d.spec.x, d.spec.z + 1]]
        : [[d.spec.x, d.spec.z], [d.spec.x + 1, d.spec.z]];
      if (!cells.some(([cx, cz]) => seen(cx, cz))) continue;
      ctx.fillStyle = d.locked ? LOCK_COLORS[d.locked] : '#9aa4ba';
      for (const [cx, cz] of cells) ctx.fillRect(cx * S, cz * S, S, S);
    }

    // the red keycard blinks until it's in your pocket
    const key = game.level.pickups.find((p) => p.kind === 'keyRed');
    if (key && !game.player.hasKey('red')) {
      const kx = Math.floor(key.x), kz = Math.floor(key.z);
      if (seen(kx, kz)) {
        const blink = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
        ctx.fillStyle = `rgba(255,52,40,${(0.4 + blink * 0.6).toFixed(2)})`;
        ctx.fillRect(kx * S - 1, kz * S - 1, S + 2, S + 2);
      }
    }

    // player arrow
    const p = game.player;
    ctx.save();
    ctx.translate(p.pos.x * S, p.pos.z * S);
    // forward in the (x, z) plane is (-sin yaw, -cos yaw)
    ctx.rotate(Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)));
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(S * 1.6, 0);
    ctx.lineTo(-S * 1.1, -S * 0.95);
    ctx.lineTo(-S * 0.4, 0);
    ctx.lineTo(-S * 1.1, S * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

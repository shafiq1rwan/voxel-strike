import * as THREE from 'three';
import { VoxelWorld, CHUNK } from './world';
import { Block, ATLAS_TILES, getAtlasTexture, tileFor } from './blocks';
import { DynLights, MAX_DYN_LIGHTS } from '../fx/dynlights';

/**
 * Greedy mesher: one merged mesh per 16-column chunk, only exposed faces,
 * adjacent faces merged when block tile + baked light match.
 */

const FACE_SHADE = [0.78, 0.78, 1.0, 0.58, 0.88, 0.88]; // +x -x +y -y +z -z

const VERT = /* glsl */ `
attribute vec2 aTile;
varying vec2 vUvB;
varying vec2 vTile;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vUvB = uv;
  vTile = aTile;
  vColor = color;
  vNormal = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTileScale;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uLightPos[${MAX_DYN_LIGHTS}];
uniform vec3 uLightColor[${MAX_DYN_LIGHTS}];
uniform float uLightRange[${MAX_DYN_LIGHTS}];
varying vec2 vUvB;
varying vec2 vTile;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec2 f = clamp(fract(vUvB), 0.03125, 0.96875);
  vec3 tex = texture2D(uMap, vTile + f * uTileScale).rgb;
  vec3 light = vColor;
  for (int i = 0; i < ${MAX_DYN_LIGHTS}; i++) {
    vec3 d = uLightPos[i] - vWorldPos;
    float dist = length(d);
    float att = clamp(1.0 - dist / uLightRange[i], 0.0, 1.0);
    att *= att;
    float ndl = max(dot(d / max(dist, 0.001), vNormal), 0.0);
    light += uLightColor[i] * att * (0.35 + 0.65 * ndl);
  }
  vec3 col = tex * light;
  float depth = length(vWorldPos - cameraPosition);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, depth));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class ChunkManager {
  readonly group = new THREE.Group();
  private meshes: (THREE.Mesh | null)[];
  private material: THREE.ShaderMaterial;

  constructor(
    private world: VoxelWorld,
    dynLights: DynLights,
    fogColor: THREE.Color,
    fogNear: number,
    fogFar: number
  ) {
    this.meshes = new Array(world.chunksX * world.chunksZ).fill(null);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      uniforms: {
        uMap: { value: getAtlasTexture() },
        uTileScale: { value: 1 / ATLAS_TILES },
        uFogColor: { value: fogColor },
        uFogNear: { value: fogNear },
        uFogFar: { value: fogFar },
        ...dynLights.uniforms,
      },
    });
  }

  buildAll(): void {
    for (let cz = 0; cz < this.world.chunksZ; cz++) {
      for (let cx = 0; cx < this.world.chunksX; cx++) {
        this.buildChunk(cx, cz);
      }
    }
    this.world.dirtyChunks.clear();
  }

  /** Free GPU resources when the level is torn down. */
  dispose(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (m) {
        this.group.remove(m);
        m.geometry.dispose();
        this.meshes[i] = null;
      }
    }
    this.material.dispose();
  }

  /** Rebuild any chunks marked dirty by runtime block changes. */
  update(): void {
    if (this.world.dirtyChunks.size === 0) return;
    for (const key of this.world.dirtyChunks) {
      const cx = key % this.world.chunksX;
      const cz = Math.floor(key / this.world.chunksX);
      this.buildChunk(cx, cz);
    }
    this.world.dirtyChunks.clear();
  }

  private buildChunk(cx: number, cz: number): void {
    const key = cx + cz * this.world.chunksX;
    const old = this.meshes[key];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.meshes[key] = null;
    }
    const geo = this.meshChunk(cx, cz);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = true;
    this.group.add(mesh);
    this.meshes[key] = mesh;
  }

  private meshChunk(cx: number, cz: number): THREE.BufferGeometry | null {
    const w = this.world;
    const base = [cx * CHUNK, 0, cz * CHUNK];
    const size = [
      Math.min(CHUNK, w.sx - base[0]),
      w.sy,
      Math.min(CHUNK, w.sz - base[2]),
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const tiles: number[] = [];
    const indices: number[] = [];

    const lightOut: [number, number, number] = [0, 0, 0];
    const cell: [number, number, number] = [0, 0, 0];
    const cellB: [number, number, number] = [0, 0, 0];

    // mask entry: 0 = none; block id + 5-bit rgb light + facing bit
    const maskKey = (block: Block, lr: number, lg: number, lb: number, positive: boolean): number =>
      block | (lr << 8) | (lg << 13) | (lb << 18) | (positive ? 1 << 24 : 0) | (1 << 25);

    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3;
      const v = (d + 2) % 3;
      const su = size[u];
      const sv = size[v];
      const mask = new Int32Array(su * sv);

      for (let i = -1; i < size[d]; i++) {
        // build mask
        let n = 0;
        for (let jv = 0; jv < sv; jv++) {
          for (let ju = 0; ju < su; ju++, n++) {
            cell[d] = base[d] + i;
            cell[u] = base[u] + ju;
            cell[v] = base[v] + jv;
            cellB[d] = cell[d] + 1;
            cellB[u] = cell[u];
            cellB[v] = cell[v];
            const a = w.get(cell[0], cell[1], cell[2]);
            const b = w.get(cellB[0], cellB[1], cellB[2]);
            const aSolid = a !== Block.Air;
            const bSolid = b !== Block.Air;
            mask[n] = 0;
            if (aSolid === bSolid) continue;
            if (aSolid) {
              // face facing +d, belongs to block a — must lie inside this chunk region
              if (i < 0) continue;
              w.getLight(cellB[0], cellB[1], cellB[2], lightOut);
              mask[n] = maskKey(a, lightOut[0] >> 3, lightOut[1] >> 3, lightOut[2] >> 3, true);
            } else {
              // face facing -d, belongs to block b
              if (i + 1 >= size[d]) continue;
              w.getLight(cell[0], cell[1], cell[2], lightOut);
              mask[n] = maskKey(b, lightOut[0] >> 3, lightOut[1] >> 3, lightOut[2] >> 3, false);
            }
          }
        }

        // greedy merge
        n = 0;
        for (let jv = 0; jv < sv; jv++) {
          for (let ju = 0; ju < su; ) {
            const m = mask[n];
            if (m === 0) {
              ju++; n++;
              continue;
            }
            // width
            let qw = 1;
            while (ju + qw < su && mask[n + qw] === m) qw++;
            // height
            let qh = 1;
            outer: while (jv + qh < sv) {
              for (let k = 0; k < qw; k++) {
                if (mask[n + k + qh * su] !== m) break outer;
              }
              qh++;
            }
            // emit quad
            this.emitQuad(
              d, u, v, base, i, ju, jv, qw, qh, m,
              positions, normals, colors, uvs, tiles, indices
            );
            // clear mask
            for (let k2 = 0; k2 < qh; k2++) {
              for (let k = 0; k < qw; k++) mask[n + k + k2 * su] = 0;
            }
            ju += qw; n += qw;
          }
        }
      }
    }

    if (indices.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('aTile', new THREE.Float32BufferAttribute(tiles, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  private emitQuad(
    d: number, u: number, v: number,
    base: number[], i: number, ju: number, jv: number, qw: number, qh: number, m: number,
    positions: number[], normals: number[], colors: number[], uvs: number[], tiles: number[], indices: number[]
  ): void {
    const block = (m & 0xff) as Block;
    const lr = ((m >> 8) & 0x1f) * 8.226 / 255;
    const lg = ((m >> 13) & 0x1f) * 8.226 / 255;
    const lb = ((m >> 18) & 0x1f) * 8.226 / 255;
    const positive = (m & (1 << 24)) !== 0;

    const dirIndex = d * 2 + (positive ? 0 : 1); // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
    const shadeF = FACE_SHADE[dirIndex];
    const cr = Math.min(1.6, lr * shadeF * 1.9);
    const cg = Math.min(1.6, lg * shadeF * 1.9);
    const cb = Math.min(1.6, lb * shadeF * 1.9);

    const tile = tileFor(block, dirIndex);
    const tcol = tile % ATLAS_TILES;
    const trow = Math.floor(tile / ATLAS_TILES);
    const tx = tcol / ATLAS_TILES;
    const ty = 1 - (trow + 1) / ATLAS_TILES;

    const p: number[] = [0, 0, 0];
    p[d] = base[d] + i + 1;
    p[u] = base[u] + ju;
    p[v] = base[v] + jv;
    const du = [0, 0, 0];
    du[u] = qw;
    const dv = [0, 0, 0];
    dv[v] = qh;

    const nx = d === 0 ? (positive ? 1 : -1) : 0;
    const ny = d === 1 ? (positive ? 1 : -1) : 0;
    const nz = d === 2 ? (positive ? 1 : -1) : 0;

    const baseIndex = positions.length / 3;
    const corners = [
      [p[0], p[1], p[2]],
      [p[0] + du[0], p[1] + du[1], p[2] + du[2]],
      [p[0] + du[0] + dv[0], p[1] + du[1] + dv[1], p[2] + du[2] + dv[2]],
      [p[0] + dv[0], p[1] + dv[1], p[2] + dv[2]],
    ];
    for (const c of corners) {
      positions.push(c[0], c[1], c[2]);
      normals.push(nx, ny, nz);
      colors.push(cr, cg, cb);
      // uv from world coords so texture stays aligned across merged quads
      if (d === 0) uvs.push(c[2], c[1]);
      else if (d === 1) uvs.push(c[0], c[2]);
      else uvs.push(c[0], c[1]);
      tiles.push(tx, ty);
    }
    if (positive) {
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
    } else {
      indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex, baseIndex + 3, baseIndex + 2);
    }
  }
}

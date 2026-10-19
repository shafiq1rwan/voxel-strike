import * as THREE from 'three';

type Surface = 'steel' | 'basalt' | 'floor' | 'heat' | 'hazard' | 'light';
const STEEL = 0x6a6374, DARK = 0x35333f, RUST = 0x8a4935, TEAL = 0x437b7c;
const vertex = `
varying vec3 p; varying vec3 n; varying vec3 tint;
void main(){
  vec4 local=vec4(position,1.);
  #ifdef USE_INSTANCING
    local=instanceMatrix*local;
    n=normalize(mat3(instanceMatrix)*normal);
    tint=instanceColor;
  #else
    n=normal; tint=vec3(1.);
  #endif
  vec4 world=modelMatrix*local; p=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
const fragment = `
uniform sampler2D tex; uniform float clock; uniform float emissive;
varying vec3 p; varying vec3 n; varying vec3 tint;
void main(){
  vec3 a=abs(n); vec2 uv=a.y>.6?p.xz:(a.x>.6?p.zy:p.xy);
  if(emissive>.5) uv.y+=clock*.045;
  vec3 pattern=texture2D(tex,fract(uv*.55)).rgb;
  float side=.70+.24*max(n.y,0.)+.10*max(n.z,0.);
  float hot=exp(-abs(p.x-29.5)*.19)*.20+exp(-abs(p.x-40.5)*.3)*.17;
  vec3 lighting=vec3(.88,.77,.93)*side+vec3(hot,hot*.31,0.);
  vec3 c=pattern*tint*mix(lighting,vec3(1.),emissive);
  float fog=smoothstep(20.,58.,length(p-cameraPosition));
  gl_FragColor=vec4(mix(c,vec3(.027,.025,.039),fog),1.);
}`;

/** World-space pixel textures and instancing keep large machinery detailed without extra draws. */
export class GeothermalScenery {
  readonly group = new THREE.Group();
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private batches = new Map<Surface, Array<{ matrix: THREE.Matrix4; color: THREE.Color }>>();
  private materials: THREE.ShaderMaterial[] = [];
  private textures: THREE.Texture[] = [];

  constructor() { this.group.name = 'geothermal-reference-scenery'; }

  private texture(surface: Surface): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const rand = (x: number, y: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + 74) * 43758.5453; return n - Math.floor(n);
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const noise = rand(x, y), patch = rand(Math.floor(x / 4), Math.floor(y / 3));
      let r = 215 + noise * 30, g = r, b = r;
      if (surface === 'steel') {
        if (patch < .12) { r = 132 + noise * 40; g = 65 + noise * 30; b = 43 + noise * 22; }
        if (x % 32 === 0 || y % 32 === 0) { r *= .45; g *= .45; b *= .45; }
        if ((x % 32 === 4 || x % 32 === 27) && (y % 32 === 4 || y % 32 === 27)) r = g = b = 72;
      } else if (surface === 'basalt') {
        r = 75 + patch * 75 + noise * 28; g = r * .87; b = r * 1.05;
        if (y % 16 === 0 || (x + Math.floor(y / 16) * 7) % 24 === 0) { r *= .5; g *= .5; b *= .5; }
      } else if (surface === 'floor') {
        r = 145 + noise * 65; g = r * .95; b = r * 1.05;
        if (x % 32 < 2 || y % 32 < 2) r = g = b = 45;
        if (patch < .12) { r = 145; g = 84; b = 65; }
      } else if (surface === 'heat') {
        const flame = rand(Math.floor(x / 3), Math.floor(y / 5));
        r = 255; g = flame > .72 ? 220 : flame > .34 ? 125 : 57; b = flame > .72 ? 48 : 12;
      } else if (surface === 'hazard') {
        const yellow = ((x + y) % 32) < 16; r = yellow ? 235 : 39; g = yellow ? 169 : 36; b = yellow ? 37 : 40;
        r *= .8 + noise * .2; g *= .8 + noise * .2;
      } else r = g = b = 255;
      ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`; ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace;
    this.textures.push(tex); return tex;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color = STEEL, surface: Surface = 'steel', rz = 0): void {
    if (!this.batches.has(surface)) this.batches.set(surface, []);
    this.batches.get(surface)!.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(w, h, d)),
      color: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) });
  }

  private rail(x1: number, z1: number, x2: number, z2: number, y: number): void {
    const length = Math.hypot(x2 - x1, z2 - z1), alongX = Math.abs(x2 - x1) > .1;
    for (let i = 0; i <= Math.ceil(length / 1.6); i++) {
      const t = i / Math.ceil(length / 1.6);
      this.box(x1 + (x2 - x1) * t, y + .6, z1 + (z2 - z1) * t, .11, 1.2, .11, RUST);
    }
    for (const dy of [.35, 1.15]) this.box((x1+x2)/2,y+dy,(z1+z2)/2,alongX?length:.1,.1,alongX?.1:length,RUST);
  }

  private vent(x: number, y: number, z: number, w: number, h: number): void {
    this.box(x,y,z,w,h,.18,DARK);
    this.box(x-w/2,y,z+.1,.13,h+.2,.2,STEEL);
    this.box(x+w/2,y,z+.1,.13,h+.2,.2,STEEL);
    for(let yy=y-h/2;yy<=y+h/2;yy+=.19) this.box(x,yy,z+.13,w,.065,.12,0x77717b);
  }

  private machine(x: number, z: number, w = 2.1): void {
    this.box(x,1.8,z,w,1.6,1.3,TEAL);
    this.box(x,2.75,z-.12,w*.9,.55,1,0x4f696b);
    this.vent(x-w*.2,1.9,z+.7,w*.38,.9);
    this.box(x+w*.23,2.5,z+.68,w*.3,.5,.1,DARK);
    for(let i=0;i<3;i++) this.box(x+w*.15+i*.15,2.5,z+.75,.1,.23,.04,0x41e7e4,'light');
    for(let i=0;i<3;i++) this.box(x+w*.25,1.65+i*.15,z+.73,.23,.06,.06,0x9da6a6);
  }

  build(): void {
    // Foreground bridge, open glowing channels, supports and hazard-painted edges.
    this.box(33.5,1.015,35,9,.04,26,0xb4a5b0,'floor');
    this.box(30,15.95,35,36,.1,26,0x5a4d5e);
    for(const x of [27.5,40.5]) {
      this.box(x,.12,35.5,3,.12,25,0xffffff,'heat');
      for(const edge of [x-1.6,x+1.6]) {
        this.box(edge,1.02,35.5,.48,.12,25,0xffffff,'hazard');
        this.box(edge+(edge<x?-.35:.35),1.03,35.5,.55,.12,25,DARK);
        for(let z=23.5;z<48;z+=.3) this.box(edge+(edge<x?-.35:.35),1.1,z,.55,.04,.09,0x87808b);
      }
      for(const z of [27.5,39.5]) {
        this.box(x,1.02,z,4,.15,3,0x8b7c83,'floor');
        this.rail(x-1.4,z-1.5,x+1.4,z-1.5,1.1);
      }
      for(const z of [25,32,37,42]) this.box(x,.45,z,.4,.9,.5,RUST);
    }
    // Tiered left heat-exchanger: vented plinth, deep luminous core, massive steel ribs.
    this.box(24,2.5,32,6.8,3,6.8,0x6e6270);
    this.box(24,4.1,32,7.5,.35,7.5,0x77717e);
    this.box(24,9.4,32,5.3,10,5.3,0xffffff,'heat');
    for(const x of [21,24,27]) for(const z of [28.9,35.1]) {
      this.box(x,9.5,z,.55,11,.55,0x787180);
      this.box(x-.3,9.5,z+.08,.12,11,.7,DARK);
    }
    for(const y of [4.7,8.9,12.8,14.7]) {
      for(const z of [28.8,35.2]) this.box(24,y,z,6.8,.5,.65,0x797180);
      for(const x of [20.8,27.2]) this.box(x,y,32,.65,.5,6.8,0x797180);
    }
    for(const x of [21.8,24,26.2]) this.vent(x,2.6,35.5,1.5,1.8);
    this.vent(24,5.15,35.45,5.3,1.05);
    this.rail(20.3,35.8,27.7,35.8,4.3);
    this.rail(27.7,28.2,27.7,35.8,4.3);
    this.box(24,4.25,35.8,8,.18,1,STEEL);
    for(const x of [20.2,27.8]) this.box(x,2.5,35.8,.3,3.5,.3,DARK);
    // Large segmented riveted columns with paired warm lights and warning bands.
    for(const [x,z] of [[17.5,35.5],[43.5,35.5],[14.5,26.5],[43.5,26.5]]) {
      this.box(x,8,z,1.7,14,1.7,0x77717f);
      for(const dx of [-.68,.68]) this.box(x+dx,8,z+.9,.13,14,.18,0x3c3744);
      for(const y of [2,6.6,10.9,14.5]) this.box(x,y,z,1.9,.15,1.9,DARK);
      for(const y of [2.6,7.3]) this.box(x,y,z,1.92,.7,1.92,0xffffff,'hazard');
      this.box(x,4.5,z,2.05,1.3,2.05,DARK);
      for(const dx of [-.55,.55]) this.box(x+dx,4.5,z+1.05,.5,.9,.06,0xffd86d,'light');
    }
    // Multilevel perimeter galleries, railings, joists and perforated-looking undersides.
    for(const [x,y,z,w,d] of [[14.5,5.9,33,5,20],[46.5,8.9,33,3,22],[30,8.9,23.3,35,2.6]]) {
      this.box(x,y,z,w,.25,d,STEEL);
      if(d>w) {
        this.rail(x-w/2,z-d/2,x-w/2,z+d/2,y+.15);
        this.rail(x+w/2,z-d/2,x+w/2,z+d/2,y+.15);
        for(let zz=z-d/2;zz<z+d/2;zz+=.6) this.box(x,y-.22,zz,w,.16,.12,DARK);
      } else {
        this.rail(x-w/2,z+d/2,x+w/2,z+d/2,y+.15);
        for(let xx=x-w/2;xx<x+w/2;xx+=.6) this.box(xx,y-.22,z,.12,.16,d,DARK);
      }
    }
    // Left stair, with narrow metal treads and continuous sloping handrails.
    for(let i=0;i<10;i++) {
      const z=40.5-i, y=1.5+i*.5;
      this.box(20,y,z,3.2,.14,1,0x817985);
      for(const x of [18.5,21.5]) {
        this.box(x,y+.65,z,.09,1.3,.09,RUST);
        this.box(x,y+1.3,z-.5,.09,.1,1.15,RUST);
      }
    }
    this.box(18.5,5.9,30.5,4,.2,3,STEEL);
    // Overhead trusses, diagonal steel braces and a hanging segmented coolant duct.
    for(const z of [25.5,33,42]) {
      for(const y of [12.6,14.1]) this.box(30,y,z,35,.25,.55,DARK);
      for(let x=14;x<47;x+=3) this.box(x,13.35,z,.16,1.7,.45,STEEL);
      for(let x=15.5;x<47;x+=3) this.box(x,13.35,z,3.3,.16,.3,STEEL,'steel',x%2<1?.45:-.45);
    }
    this.box(39,11,32,1.9,1.5,18,0x6e6a72);
    for(let z=23;z<42;z+=2) {
      this.box(39,11,z,2.1,1.7,.2,DARK);
      for(let x=38.3;x<39.8;x+=.22) this.box(x,10.2,z+.8,.1,.05,1.4,DARK);
    }
    // Basalt escarpment, lava seams and bolted wall buttresses behind the architecture.
    for(let x=12;x<48;x+=2) {
      const depth=.3+((x*13)%7)*.12;
      this.box(x,x===34?12:8,22.03-depth/2,1.9,x===34?8:15,depth,0x786479,'basalt');
      if(x<30||x>38) this.box(x,3.3,22.1,.24,4.5,.12,0xffffff,'heat');
    }
    for(const x of [12.1,47.9]) for(let z=23;z<44;z+=2) {
      this.box(x,8,z,.3,15,1.95,0x736076,'basalt');
      if(z%4===3) this.box(x+(x<20?.3:-.3),3,z,.2,3.8,.3,0xffffff,'heat');
    }
    // Deep door frame and industrial sign are the bridge's focal point.
    for(const x of [31.1,36.9]) this.box(x,4.5,22.18,1.4,7,.55,0x69606e);
    this.box(34,7.4,22.18,7.2,1.2,.55,0x69606e);
    for(const x of [32.4,35.6]) this.box(x,3,22.52,1.2,4.4,.35,DARK);
    // Keep the real two-wide doorway and its collision footprint unobstructed visually.
    for(const x of [31.7,36.3]) this.box(x,3,22.72,.45,4.6,.45,0x8b7b7f);
    this.box(34,5.4,22.72,5,.45,.45,0x8b7b7f);
    this.box(34,5.15,22.98,1.5,.12,.08,0xffd47e,'light');
    for(const x of [31.7,36.3]) this.box(x,2.6,22.98,.15,.8,.08,0xffce5a,'light');
    // Equipment and steam vents frame the bridge instead of filling the combat lane.
    for(const [x,z] of [[16,41],[26,37],[44,36],[44,29],[16,29]]) this.machine(x,z);
    // Square service-vent mouths sit behind the two waiting Vent Stalkers.
    for(const [x,z] of [[44.5,30],[6.5,29]]) {
      this.box(x,1.55,z,2.25,1.1,.24,DARK);
      for(const dx of [-1.12,1.12])this.box(x+dx,1.6,z+.16,.22,1.4,.35,STEEL);
      this.box(x,2.25,z+.16,2.45,.22,.35,STEEL);
      this.box(x,1.03,z+.16,2.45,.12,.45,STEEL);
      for(let i=0;i<3;i++)this.box(x+.4,1.45+i*.2,z+.2,.8,.07,.12,0x544d56);
    }
    for(const [x,z] of [[27,40.5],[42.5,42],[21,37.7]]) {
      this.box(x,1.7,z,1.5,1.4,1.4,0x716a77); this.vent(x,1.8,z+.75,1.05,.9);
    }
    for(const [x,z] of [[18,36],[44,38]]) this.rail(x-2,z,x+2,z,1.1);
    // Cyan work lights mounted below the galleries.
    for(const [x,y,z] of [[16,8,29],[16,8,40],[44,8,29],[44,8,40],[34,10,24]]) {
      this.box(x,y+.2,z,1.6,.3,.7,DARK);
      this.box(x,y,z,1.3,.08,.5,0x59f1e4,'light');
    }
    for(const [surface,items] of this.batches) {
      const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
        uniforms: { tex: { value:this.texture(surface) }, clock:{ value:0 }, emissive:{ value:surface==='heat'||surface==='light'?1:0 } } });
      this.materials.push(material);
      const mesh=new THREE.InstancedMesh(this.cube,material,items.length);
      items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});
      this.group.add(mesh);
    }
    this.batches.clear();
  }

  update(time: number): void { for(const material of this.materials) material.uniforms.clock.value=time; }
  dispose(): void {
    this.group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    this.cube.dispose(); this.materials.forEach(m=>m.dispose()); this.textures.forEach(t=>t.dispose());
  }
}

/* ============ Morphing particle field ============
 * One THREE.Points cloud that re-forms itself into a different shape for
 * every section (cloud → wave → floor → terrain → helix → wave → ring),
 * repels from the cursor, and shatters/reassembles on the "design" easter egg.
 */
import * as THREE from 'three';
import { Viewport, smoothstep, clamp, lerp } from './util.js';

export const CONFIG = {
  count: 2200,           // particle count (lower for weaker machines)
  followSpeed: 0.055,    // how quickly particles chase their target shape (0–1)
  repelRadius: 1.6,      // cursor repulsion radius, world units
  repelStrength: 0.9,    // cursor repulsion strength, world units
  burstDamping: 0.9,     // velocity damping after an easter-egg burst
  baseSize: 0.042,       // world-space point size
  opacity: 0.6,          // overall brightness, dark theme
  opacityLight: 0.45,    // overall brightness, light theme
  columnDim: 0.42,       // brightness multiplier behind the text column (.section)
  columnEdge: 0.8,       // soft edge of that dimming, world units
};

const VERT = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uSize;
  uniform vec2  uMouse;
  uniform float uRepelRadius;
  uniform float uRepelStrength;
  uniform float uTime;
  uniform vec2  uColumn;      // world x-range of the text column
  uniform float uColumnDim;
  uniform float uColumnEdge;
  attribute float aSize;
  attribute float aColorIdx;
  attribute float aSeed;
  varying float vColorIdx;
  varying float vDepth;
  varying float vSeed;
  varying float vDim;

  void main() {
    vec3 p = position;
    // Gentle idle wobble so nothing looks frozen
    p.x += sin(uTime * 0.6 + aSeed * 12.0) * 0.03;
    p.y += cos(uTime * 0.5 + aSeed * 9.0)  * 0.03;

    // Cursor repulsion on the projected XY plane
    vec2 d = p.xy - uMouse;
    float dist = length(d);
    float f = 1.0 - smoothstep(0.0, uRepelRadius, dist);
    p.xy += normalize(d + 1e-4) * f * f * uRepelStrength;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aSize * uPixelRatio * (uScale / -mv.z);
    vColorIdx = aColorIdx;
    vDepth = clamp((-mv.z - 6.0) / 9.0, 0.0, 1.0);
    vSeed = aSeed;
    // Quieter behind the text column so copy stays readable; brighter at the edges
    float inCol = smoothstep(uColumn.x - uColumnEdge, uColumn.x + uColumnEdge, p.x)
                * (1.0 - smoothstep(uColumn.y - uColumnEdge, uColumn.y + uColumnEdge, p.x));
    vDim = mix(1.0, uColumnDim, inCol);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3  uColors[3];
  uniform float uOpacity;
  varying float vColorIdx;
  varying float vDepth;
  varying float vSeed;
  varying float vDim;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.05, r);
    a *= a;
    vec3 col = vColorIdx < 0.5 ? uColors[0] : (vColorIdx < 1.5 ? uColors[1] : uColors[2]);
    float fade = mix(1.0, 0.35, vDepth);
    gl_FragColor = vec4(col, a * fade * vDim * uOpacity);
  }
`;

/* ---------- Shape generators (local coords centred on 0,0,0) ---------- */
function rand(seed) {
  // Deterministic PRNG so shapes are stable between resizes
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const shapes = {
  cloud(i, n, r, W, H) {
    return [(r() - 0.5) * W * 1.15, (r() - 0.5) * H * 1.15, (r() - 0.5) * 6];
  },
  wave(i, n, r, W, H) {
    const x = (r() - 0.5) * W * 1.1;
    const z = (r() - 0.5) * 6;
    const y = Math.sin(x * 0.9) * 0.6 + Math.cos(z * 1.3) * 0.4 + (r() - 0.5) * 0.3;
    return [x, y - H * 0.3, z];
  },
  lattice(i, n, r, W, H) {
    const side = Math.ceil(Math.cbrt(n));
    const gx = i % side, gy = Math.floor(i / side) % side, gz = Math.floor(i / (side * side));
    const s = Math.min(W, H) * 0.55;
    const c = (v) => (v / (side - 1) - 0.5) * s;
    return [c(gx), c(gy), c(gz) - 1];
  },
  floor(i, n, r, W, H) {
    // Perspective grid receding under the content
    const cols = Math.ceil(Math.sqrt(n * 2.4));
    const rows = Math.ceil(n / cols);
    const gx = i % cols, gz = Math.floor(i / cols);
    const x = (gx / (cols - 1) - 0.5) * W * 1.5;
    const z = (gz / Math.max(1, rows - 1) - 0.5) * 9;
    const y = -H * 0.38 + Math.sin(x * 0.7 + z * 0.5) * 0.1;
    return [x, y, z];
  },
  terrain(i, n, r, W, H) {
    const x = (r() - 0.5) * W * 1.2;
    const z = (r() - 0.5) * 8;
    const y = -H * 0.28 + Math.sin(x * 1.4) * Math.cos(z * 0.9) * 0.55 + Math.sin(z * 1.8 + x) * 0.25;
    return [x, y, z];
  },
  helix(i, n, r, W, H) {
    const t = (i / n) * Math.PI * 10;
    const strand = i % 2 === 0 ? 0 : Math.PI;
    const rad = Math.min(W, H) * 0.17;
    const y = ((i / n) - 0.5) * H * 1.05;
    const jitter = (r() - 0.5) * 0.25;
    return [Math.cos(t + strand) * rad + jitter, y, Math.sin(t + strand) * rad - 1 + jitter];
  },
  sphere(i, n, r, W, H, radius) {
    // Fibonacci sphere
    const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const rr = radius * (0.98 + r() * 0.04);
    return [Math.cos(theta) * Math.sin(phi) * rr, Math.cos(phi) * rr, Math.sin(theta) * Math.sin(phi) * rr];
  },
  ring(i, n, r, W, H, radius) {
    const t = (i / n) * Math.PI * 2 * 3;
    const rr = radius * (0.85 + r() * 0.3);
    return [Math.cos(t) * rr, Math.sin(t) * rr * 0.45, (r() - 0.5) * 2];
  },
};

/* Which shape each section takes.
 * anchor  – DOM selector the shape follows (optional)
 * shift   – [x, y] offset as a fraction of viewport width/height (optional)
 * opacity – per-section brightness multiplier (optional, default 1)
 */
const SECTION_SHAPES = [
  { id: 'home',           shape: 'cloud',   opacity: 0.9 },
  { id: 'about',          shape: 'wave' },
  { id: 'experience',     shape: 'wave' },
  { id: 'skills',         shape: 'floor' },
  { id: 'design',         shape: 'terrain' },
  { id: 'work',           shape: 'helix',   shift: [0.36, 0] },
  { id: 'infrastructure', shape: 'wave',    opacity: 0.35 },
  { id: 'contact',        shape: 'ring',    anchor: '.contact-inner' },
];

export class ParticleField {
  constructor(scene, camera, theme) {
    this.scene = scene;
    this.camera = camera;
    this.viewport = new Viewport(camera);
    this.count = CONFIG.count;
    this.mouse = new THREE.Vector2(999, 999);
    this.scrollVel = 0;

    const n = this.count;
    this.positions = new Float32Array(n * 3);
    this.velocity = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const colorIdx = new Float32Array(n);
    const seeds = new Float32Array(n);
    const r = rand(1337);
    for (let i = 0; i < n; i++) {
      sizes[i] = 0.6 + Math.pow(r(), 3) * 2.2;
      const c = r();
      colorIdx[i] = c < 0.6 ? 0 : c < 0.85 ? 1 : 2;
      seeds[i] = r();
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aColorIdx', new THREE.BufferAttribute(colorIdx, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uSize: { value: CONFIG.baseSize },
        uMouse: { value: this.mouse },
        uRepelRadius: { value: CONFIG.repelRadius },
        uRepelStrength: { value: CONFIG.repelStrength },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uColumn: { value: new THREE.Vector2(-1e4, 1e4) },
        uColumnDim: { value: CONFIG.columnDim },
        uColumnEdge: { value: CONFIG.columnEdge },
        uColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.setTheme(theme);
    this.buildTargets();
    // Start particles at the first shape so there's no initial fly-in from origin
    const first = this.keyframes[0];
    for (let i = 0; i < n * 3; i++) this.positions[i] = first.local[i];
    this.applyAnchors();
    for (let i = 0; i < n; i++) {
      this.positions[i * 3] += first.offset.x;
      this.positions[i * 3 + 1] += first.offset.y;
    }
  }

  setTheme(theme) {
    const u = this.material.uniforms.uColors.value;
    u[0].copy(theme.accent);
    u[1].copy(theme.accent2);
    u[2].copy(theme.accent3);
    this.material.blending = theme.isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.baseOpacity = theme.isLight ? CONFIG.opacityLight : CONFIG.opacity;
    this.material.uniforms.uOpacity.value = this.baseOpacity;
    this.material.needsUpdate = true;
  }

  setPixelRatio(pr, viewportHeightPx) {
    this.material.uniforms.uPixelRatio.value = pr;
    // Convert world-space size to px: height_px / world_height at z distance
    this.material.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) ;
  }

  /** Generate one target shape per section, in local coords, plus scroll keyframe. */
  buildTargets() {
    this.viewport.update();
    const W = this.viewport.width, H = this.viewport.height;
    const n = this.count;
    this.keyframes = [];
    const scrollY = window.scrollY;
    const vh = window.innerHeight;

    // Text column = a .section's content box (max-width 1280px, centred)
    const sec = document.querySelector('.section');
    if (sec) {
      const cs = getComputedStyle(sec);
      const sr = sec.getBoundingClientRect();
      const left = sr.left + parseFloat(cs.paddingLeft || '0');
      const right = sr.right - parseFloat(cs.paddingRight || '0');
      const vw = window.innerWidth || 1;
      this.material.uniforms.uColumn.value.set((left / vw - 0.5) * W, (right / vw - 0.5) * W);
    }

    SECTION_SHAPES.forEach((def, k) => {
      const el = document.getElementById(def.id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = rect.top + scrollY;
      const scrollAt = clamp(top + rect.height / 2 - vh / 2, 0, Infinity);
      const local = new Float32Array(n * 3);
      const r = rand(4242 + k);
      let radius = Math.min(W, H) * 0.3;
      const anchorEl = def.anchor ? document.querySelector(def.anchor) : null;
      if (anchorEl) {
        const ar = anchorEl.getBoundingClientRect();
        const wr = this.viewport.rectToWorld(ar);
        radius = def.shape === 'sphere' ? Math.min(wr.w, wr.h) * 0.42 : Math.max(wr.w, wr.h) * 0.62;
      }
      for (let i = 0; i < n; i++) {
        const p = shapes[def.shape](i, n, r, W, H, radius);
        local[i * 3] = p[0]; local[i * 3 + 1] = p[1]; local[i * 3 + 2] = p[2];
      }
      this.keyframes.push({ def, scrollAt, local, anchorEl, offset: new THREE.Vector2(0, 0), rot: 0 });
    });
    this.keyframes.sort((a, b) => a.scrollAt - b.scrollAt);
  }

  /** Anchored shapes follow their DOM element's on-screen position each frame. */
  applyAnchors() {
    for (const kf of this.keyframes) {
      if (kf.anchorEl) {
        const wr = this.viewport.rectToWorld(kf.anchorEl.getBoundingClientRect());
        kf.offset.set(wr.x, wr.y);
      } else if (kf.def.shift) {
        kf.offset.set(kf.def.shift[0] * this.viewport.width, kf.def.shift[1] * this.viewport.height);
      } else {
        kf.offset.set(0, 0);
      }
    }
  }

  setMouseWorld(x, y) { this.mouse.set(x, y); }

  burst(strength = 0.35) {
    const v = this.velocity;
    for (let i = 0; i < this.count; i++) {
      v[i * 3]     = (Math.random() - 0.5) * strength * 2;
      v[i * 3 + 1] = (Math.random() - 0.5) * strength * 2;
      v[i * 3 + 2] = (Math.random() - 0.5) * strength * 2;
    }
  }

  resize(pr, heightPx) {
    this.setPixelRatio(pr, heightPx);
    this.buildTargets();
  }

  update(time, dt) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    this.applyAnchors();

    // Which two keyframes are we between?
    const sy = window.scrollY;
    const kfs = this.keyframes;
    if (!kfs.length) return;
    let a = kfs[0], b = kfs[0], t = 0;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (sy >= kfs[i].scrollAt && sy <= kfs[i + 1].scrollAt) {
        a = kfs[i]; b = kfs[i + 1];
        t = smoothstep((sy - a.scrollAt) / Math.max(1, b.scrollAt - a.scrollAt));
        break;
      }
      if (sy > kfs[kfs.length - 1].scrollAt) { a = b = kfs[kfs.length - 1]; t = 0; }
    }

    // Per-section brightness (e.g. quieter behind the globe)
    u.uOpacity.value = (this.baseOpacity ?? 1) * lerp(a.def.opacity ?? 1, b.def.opacity ?? 1, t);

    // Slow rotation for volumetric shapes
    const rotA = a.def.shape === 'sphere' || a.def.shape === 'lattice' || a.def.shape === 'helix' ? time * 0.15 : 0;
    const rotB = b.def.shape === 'sphere' || b.def.shape === 'lattice' || b.def.shape === 'helix' ? time * 0.15 : 0;
    const ca = Math.cos(rotA), sa = Math.sin(rotA), cb = Math.cos(rotB), sb = Math.sin(rotB);

    const pos = this.positions, vel = this.velocity;
    const A = a.local, B = b.local;
    const f = 1 - Math.pow(1 - CONFIG.followSpeed, dt * 60);
    const damp = Math.pow(CONFIG.burstDamping, dt * 60);
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      // rotate around Y
      const ax = A[j] * ca + A[j + 2] * sa, az = -A[j] * sa + A[j + 2] * ca;
      const bx = B[j] * cb + B[j + 2] * sb, bz = -B[j] * sb + B[j + 2] * cb;
      const tx = lerp(ax + a.offset.x, bx + b.offset.x, t);
      const ty = lerp(A[j + 1] + a.offset.y, B[j + 1] + b.offset.y, t);
      const tz = lerp(az, bz, t);
      vel[j] *= damp; vel[j + 1] *= damp; vel[j + 2] *= damp;
      pos[j]     += (tx - pos[j]) * f + vel[j];
      pos[j + 1] += (ty - pos[j + 1]) * f + vel[j + 1];
      pos[j + 2] += (tz - pos[j + 2]) * f + vel[j + 2];
    }
    this.posAttr.needsUpdate = true;
  }
}

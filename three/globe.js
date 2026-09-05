/* ============ Infrastructure globe — dotted world map ============
 * Rendered in its OWN scene + camera into the #globeView box (scissor pass
 * after the main composite), so it:
 *   - is a perfect circle (no wide-angle distortion from the background cam),
 *   - is never touched by the cursor trail / particle repulsion,
 *   - always fits exactly inside the dashed ring, above the caption.
 *
 * Land = ~4–5k static dots sampled from Natural Earth (world-atlas
 * `land-110m` TopoJSON, fetched from jsDelivr — the same CDN three.js itself
 * comes from). The dots fly in and assemble into the map the first time the
 * section scrolls into view, then stay put. No cursor interaction inside.
 *
 * Hover a domain pill →
 *   1. the globe eases round to face the route (Dhaka ↔ region midpoint),
 *   2. the arc draws itself from Dhaka to the region, a pulse ring lands,
 *   3. the land around that region lights up,
 *   4. a floating label names the region; the caption shows the route,
 *   5. sibling domains hosted in the same region light up in the pill grid.
 */
import * as THREE from 'three';
import { rectInView, ease, clamp, smoothstep, getGlowTexture } from './util.js';

/* ---------- EDIT ME: where each site is served from ----------
 * These are best-guess regions; change lat/lng/region to the real hosting
 * location. `domain` must match the visible text of the .infra-link pill.
 * Domains sharing the same `region` string share one marker + arc.
 */
export const HOME = { name: 'Dhaka', lat: 23.81, lng: 90.41 };
export const REGIONS = [
  { domain: 'a3sports.com.my',   region: 'Kuala Lumpur', lat: 3.14,   lng: 101.69 },
  { domain: 'c4a-ig.com',        region: 'Kuala Lumpur', lat: 3.14,   lng: 101.69 },
  { domain: 'a3cricket.eu',      region: 'Frankfurt',    lat: 50.11,  lng: 8.68 },
  { domain: 'minjiasia.com',     region: 'Singapore',    lat: 1.35,   lng: 103.82 },
  { domain: 'aggressiveroi.com', region: 'Kuala Lumpur', lat: 3.14,   lng: 101.69 },
  { domain: 'raasbiotech.com',   region: 'Singapore',    lat: 1.35,   lng: 103.82 },
  { domain: 'theglobalsync.com', region: 'London',       lat: 51.5,   lng: -0.12 },
  { domain: 'publicaward.com.my',region: 'Kuala Lumpur', lat: 3.14,   lng: 101.69 },
  { domain: 'salesninja.asia',   region: 'Singapore',    lat: 1.35,   lng: 103.82 },
  { domain: 'netragrowth.com',   region: 'Ashburn',      lat: 39.04,  lng: -77.49 },
  { domain: 'globalpiks.com',    region: 'London',       lat: 51.5,   lng: -0.12 },
  { domain: 'brewhaus.coffee',   region: 'Sydney',       lat: -33.87, lng: 151.21 },
  { domain: 'hustlers-hive.com', region: 'Ashburn',      lat: 39.04,  lng: -77.49 },
];

export const GLOBE = {
  landUrl: 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json',
  dotSpacingDeg: 1.7,   // land dot grid spacing (smaller = denser map)
  dotSize: 0.018,       // dot diameter in globe units (globe radius = 1)
  fov: 26,              // narrow lens → no fisheye on the sphere
  fit: 0.78,            // globe diameter as a fraction of the stage box (leaves room for arcs)
  idleTilt: 0.32,       // radians; Dhaka sits a little above centre
  idleSway: 0.36,       // radians of slow left/right sway when idle
  idlePeriod: 26,       // seconds per sway cycle
  assembleSeconds: 2.0, // fly-in duration when the map first appears
  hotRadius: 0.24,      // how much land lights up around a hovered region
};

/* ---------- geometry helpers ---------- */
export function latLngToVec3(lat, lng, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}
/** Yaw (rotation.y) that brings longitude `lngDeg` to face the camera. */
const yawFor = (lngDeg) => -Math.PI / 2 - THREE.MathUtils.degToRad(lngDeg);
function vecToLatLng(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(clamp(n.y, -1, 1)), lng: Math.atan2(-n.z, n.x) }; // radians
}
const shortestAngle = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Great-circle arc between two points on the unit sphere, lifted off the surface. */
class ArcCurve extends THREE.Curve {
  constructor(a, b) {
    super();
    this.a = a.clone().normalize();
    this.b = b.clone().normalize();
    this.omega = Math.acos(clamp(this.a.dot(this.b), -1, 1));
    this.lift = 0.08 + 0.22 * (this.omega / Math.PI);
  }
  getPoint(t, target = new THREE.Vector3()) {
    const so = Math.sin(this.omega) || 1e-6;
    const wa = Math.sin((1 - t) * this.omega) / so;
    const wb = Math.sin(t * this.omega) / so;
    target.copy(this.a).multiplyScalar(wa).addScaledVector(this.b, wb);
    return target.normalize().multiplyScalar(1 + this.lift * Math.sin(Math.PI * t));
  }
}

/* ---------- land mask: TopoJSON → equirectangular mask → dot samples ---------- */
function decodeTopo(topo) {
  const tr = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    if (!tr) return arc.map(([x, y]) => [x, y]);
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]];
    });
  });
  const ring = (ids) => {
    const pts = [];
    for (const id of ids) {
      const a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
      if (pts.length) pts.pop();
      for (const p of a) pts.push(p);
    }
    return pts;
  };
  const polys = [];
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else if (g.type === 'Polygon') polys.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') g.arcs.forEach((p) => polys.push(p.map(ring)));
  };
  walk(topo.objects.land || Object.values(topo.objects)[0]);
  return polys;
}

function rasterizeLand(polys, W = 1440, H = 720) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  for (const poly of polys) {
    ctx.beginPath();
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const x = ((ring[i][0] + 180) / 360) * W;
        const y = ((90 - ring[i][1]) / 180) * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  return (lon, lat) => {
    const x = clamp(Math.floor(((lon + 180) / 360) * W), 0, W - 1);
    const y = clamp(Math.floor(((90 - lat) / 180) * H), 0, H - 1);
    return data[(y * W + x) * 4 + 3] > 127;
  };
}

/** Even angular grid over the sphere; keep the samples that land on land. */
function sampleLand(isLand, spacingDeg) {
  const out = [];
  const rows = Math.round(180 / spacingDeg);
  for (let i = 0; i < rows; i++) {
    const lat = -90 + (i + 0.5) * (180 / rows);
    const n = Math.max(1, Math.round((360 * Math.cos(THREE.MathUtils.degToRad(lat))) / spacingDeg));
    const off = (i % 2) * 0.5;
    for (let j = 0; j < n; j++) {
      const lon = -180 + ((j + off + 0.5) / n) * 360;
      if (isLand(lon, lat)) out.push(lat, lon);
    }
  }
  return out;
}

/* ---------- shaders ---------- */
const LAND_VERT = /* glsl */ `
  uniform float uPixelRatio, uScale, uSize, uReveal, uHotAmt, uHotRadius;
  uniform vec3  uHot, uHome;
  attribute vec3  aScatter;
  attribute float aRand;
  varying float vAlpha, vHot;
  void main() {
    // staggered fly-in from the scattered start position to the map position
    float t = clamp(uReveal * 1.45 - aRand * 0.45, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(aScatter, position, t);

    vec3 n = normalize(normalMatrix * position);
    float facing = smoothstep(-0.05, 0.32, n.z);
    float hot  = (1.0 - smoothstep(0.0, uHotRadius, distance(position, uHot))) * uHotAmt;
    float home = 1.0 - smoothstep(0.0, 0.10, distance(position, uHome));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (uScale / -mv.z) * (1.0 + hot * 0.8 + home * 0.5);
    vAlpha = facing * t * (0.72 + 0.28 * aRand);
    vHot = max(hot, home * 0.8);
  }
`;
const LAND_FRAG = /* glsl */ `
  uniform vec3 uColor, uColorHot;
  uniform float uOpacity;
  varying float vAlpha, vHot;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.3, r) * vAlpha * uOpacity;
    gl_FragColor = vec4(mix(uColor, uColorHot, vHot), a);
    #include <colorspace_fragment>
  }
`;
const SHELL_VERT = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHELL_FRAG = /* glsl */ `
  uniform vec3 uBg, uTint;
  uniform float uLight;
  varying vec3 vN;
  void main() {
    float f = 1.0 - clamp(vN.z, 0.0, 1.0);            // 0 centre → 1 rim
    vec3 centre = mix(uBg + uTint * 0.05, uBg * 0.985, uLight);
    vec3 rim    = mix(uBg * 0.70, uBg * 0.93, uLight);
    gl_FragColor = vec4(mix(centre, rim, smoothstep(0.2, 1.0, f)), 1.0);
    #include <colorspace_fragment>
  }
`;

const readBg = (isLight) =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (isLight ? '#faf9f7' : '#0b0b0c');

/* ============================================================ */
export class Globe {
  constructor(theme) {
    this.stage = document.getElementById('globeStage');
    this.view = document.getElementById('globeView') || this.stage;
    this.caption = document.getElementById('globeCaption') || this.stage?.querySelector('.globe-caption');
    this.grid = document.querySelector('#infrastructure .infra-grid');
    this.links = Array.from(document.querySelectorAll('#infrastructure .infra-link'));

    // Unique regions (several domains can share one)
    const byName = new Map();
    REGIONS.forEach((r) => {
      if (!byName.has(r.region)) byName.set(r.region, { name: r.region, lat: r.lat, lng: r.lng, domains: [] });
      byName.get(r.region).domains.push(r.domain);
    });
    this.regions = Array.from(byName.values());
    this.regions.forEach((r) => { r.vec = latLngToVec3(r.lat, r.lng); });
    this.homeVec = latLngToVec3(HOME.lat, HOME.lng);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(GLOBE.fov, 1, 0.1, 50);
    this.camera.position.set(0, 0, 5.5);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.active = null;        // index into this.regions
    this.activeDomain = null;
    this.drawT = 0;            // arc draw-in progress 0..1
    this.yaw = yawFor(HOME.lng);
    this.tilt = GLOBE.idleTilt;
    this.revealAt = null;
    this.rect = null;
    this.land = null;
    this._v = new THREE.Vector3();

    this.build(theme);
    this.buildLabels();
    this.bindDom();
    this.setCaption(null);
    this.loadLand();
  }

  /* ---------- static geometry ---------- */
  build(theme) {
    const g = this.group;
    const glow = getGlowTexture();

    // Soft halo behind the disc
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: theme.accent, transparent: true, opacity: 0.18, depthWrite: false }));
    this.halo.scale.setScalar(2.7);
    this.halo.renderOrder = -2;
    this.scene.add(this.halo);

    // Opaque shell: hides the far side, hides background particles, subtle vignette
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.992, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        uniforms: {
          uBg: { value: new THREE.Color(readBg(theme.isLight)) },
          uTint: { value: theme.accent.clone() },
          uLight: { value: theme.isLight ? 1 : 0 },
        },
      })
    );
    this.shell.renderOrder = -1;
    g.add(this.shell);

    // Land dots (geometry filled once the TopoJSON arrives)
    this.landMat = new THREE.ShaderMaterial({
      vertexShader: LAND_VERT,
      fragmentShader: LAND_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uSize: { value: GLOBE.dotSize },
        uReveal: { value: 0 },
        uHot: { value: new THREE.Vector3(0, 0, 0) },
        uHotAmt: { value: 0 },
        uHotRadius: { value: GLOBE.hotRadius },
        uHome: { value: this.homeVec.clone() },
        uColor: { value: theme.accent.clone() },
        uColorHot: { value: theme.accent3.clone().lerp(new THREE.Color(0xffffff), 0.35) },
        uOpacity: { value: theme.isLight ? 0.9 : 0.95 },
      },
    });

    // Home (Dhaka)
    this.home = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), new THREE.MeshBasicMaterial({ color: theme.accent3 }));
    this.home.position.copy(this.homeVec).multiplyScalar(1.004);
    g.add(this.home);
    this.homeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: theme.accent3, transparent: true, opacity: 0.85, depthWrite: false }));
    this.homeGlow.scale.setScalar(0.14);
    this.homeGlow.position.copy(this.homeVec).multiplyScalar(1.01);
    g.add(this.homeGlow);
    this.homeRing = this.makeRing(0.03, 0.036, theme.accent3, this.homeVec);
    g.add(this.homeRing);

    // Regions: marker dot + pulse ring + thin idle arc + thick hover arc + packet
    this.regions.forEach((reg) => {
      reg.dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.9 }));
      reg.dot.position.copy(reg.vec).multiplyScalar(1.003);
      g.add(reg.dot);

      reg.ring = this.makeRing(0.022, 0.028, theme.accent3, reg.vec);
      reg.ring.material.opacity = 0;
      g.add(reg.ring);

      reg.curve = new ArcCurve(this.homeVec, reg.vec);
      reg.thin = new THREE.Mesh(
        new THREE.TubeGeometry(reg.curve, 48, 0.0035, 5, false),
        new THREE.MeshBasicMaterial({ color: theme.accent2, transparent: true, opacity: 0.16, depthWrite: false })
      );
      g.add(reg.thin);
      reg.thick = new THREE.Mesh(
        new THREE.TubeGeometry(reg.curve, 64, 0.009, 6, false),
        new THREE.MeshBasicMaterial({ color: theme.accent3, transparent: true, opacity: 0, depthWrite: false })
      );
      reg.thick.geometry.setDrawRange(0, 0);
      g.add(reg.thick);

      reg.packet = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: theme.accent3, transparent: true, opacity: 0.7, depthWrite: false }));
      reg.packet.scale.setScalar(0.05);
      reg.phase = Math.random();
      reg.speed = 0.14 + Math.random() * 0.06;
      g.add(reg.packet);
    });
  }

  makeRing(inner, outer, color, at) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(at).multiplyScalar(1.004);
    ring.lookAt(at.clone().multiplyScalar(2)); // tangent to the sphere
    return ring;
  }

  buildLabels() {
    const mk = (cls) => {
      const el = document.createElement('div');
      el.className = `globe-label ${cls}`;
      this.view?.appendChild(el);
      return el;
    };
    this.labelHome = mk('is-home');
    this.labelHome.innerHTML = `<b>${HOME.name}</b><span>origin</span>`;
    this.labelDest = mk('is-dest');
  }

  /* ---------- land data ---------- */
  async loadLand() {
    try {
      const res = await fetch(GLOBE.landUrl, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const topo = await res.json();
      const isLand = rasterizeLand(decodeTopo(topo));
      this.setLandPoints(sampleLand(isLand, GLOBE.dotSpacingDeg));
    } catch (err) {
      console.warn('[globe] land data unavailable, using sparse sphere:', err);
      // Fallback: faint even dots so the sphere still reads as a globe
      const pts = [];
      const rows = Math.round(180 / (GLOBE.dotSpacingDeg * 2.2));
      for (let i = 0; i < rows; i++) {
        const lat = -90 + (i + 0.5) * (180 / rows);
        const n = Math.max(1, Math.round((360 * Math.cos(THREE.MathUtils.degToRad(lat))) / (GLOBE.dotSpacingDeg * 2.2)));
        for (let j = 0; j < n; j++) pts.push(lat, -180 + ((j + 0.5) / n) * 360);
      }
      this.landMat.uniforms.uOpacity.value *= 0.45;
      this.setLandPoints(pts);
    }
  }

  setLandPoints(latLngs) {
    const n = latLngs.length / 2;
    const pos = new Float32Array(n * 3);
    const scatter = new Float32Array(n * 3);
    const rand = new Float32Array(n);
    const dir = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const v = latLngToVec3(latLngs[i * 2], latLngs[i * 2 + 1]);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      dir.randomDirection().multiplyScalar(2.4 + Math.random() * 1.8);
      scatter[i * 3] = dir.x; scatter[i * 3 + 1] = dir.y; scatter[i * 3 + 2] = dir.z;
      rand[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    if (this.land) { this.group.remove(this.land); this.land.geometry.dispose(); }
    this.land = new THREE.Points(geo, this.landMat);
    this.land.frustumCulled = false;
    this.land.renderOrder = 1;
    this.group.add(this.land);
  }

  /* ---------- theme ---------- */
  setTheme(theme) {
    const hot = theme.accent3.clone().lerp(new THREE.Color(0xffffff), 0.35);
    this.landMat.uniforms.uColor.value.copy(theme.accent);
    this.landMat.uniforms.uColorHot.value.copy(hot);
    this.landMat.uniforms.uOpacity.value = theme.isLight ? 0.9 : 0.95;
    this.shell.material.uniforms.uBg.value.set(readBg(theme.isLight));
    this.shell.material.uniforms.uTint.value.copy(theme.accent);
    this.shell.material.uniforms.uLight.value = theme.isLight ? 1 : 0;
    this.halo.material.color.copy(theme.accent);
    this.halo.material.opacity = theme.isLight ? 0.10 : 0.18;
    this.home.material.color.copy(theme.accent3);
    this.homeGlow.material.color.copy(theme.accent3);
    this.homeRing.material.color.copy(theme.accent3);
    this.regions.forEach((r) => {
      r.dot.material.color.copy(theme.accent);
      r.ring.material.color.copy(theme.accent3);
      r.thin.material.color.copy(theme.accent2);
      r.thick.material.color.copy(theme.accent3);
      r.packet.material.color.copy(theme.accent3);
    });
  }

  /* ---------- DOM wiring ---------- */
  bindDom() {
    this.links.forEach((link) => {
      const text = link.textContent.trim().toLowerCase();
      const idx = this.regions.findIndex((r) => r.domains.some((d) => text.includes(d.toLowerCase())));
      link.dataset.region = idx;
      const on = () => this.setActive(idx, text);
      const off = () => { if (this.activeDomain === text) this.setActive(null); };
      link.addEventListener('mouseenter', on);
      link.addEventListener('mouseleave', off);
      link.addEventListener('focus', on);
      link.addEventListener('blur', off);
    });
  }

  setActive(idx, domain = null) {
    const next = idx != null && idx >= 0 ? idx : null;
    if (next !== this.active) this.drawT = 0;
    this.active = next;
    this.activeDomain = next == null ? null : domain;
    this.grid?.classList.toggle('is-focusing', next != null);
    this.links.forEach((l) => {
      const same = next != null && Number(l.dataset.region) === next;
      const isHovered = domain != null && l.textContent.trim().toLowerCase() === domain;
      l.classList.toggle('is-lit', same && isHovered);
      l.classList.toggle('is-kin', same && !isHovered);
    });
    this.setCaption(next == null ? null : this.regions[next], domain);
    if (next != null) {
      const reg = this.regions[next];
      const n = reg.domains.length;
      this.labelDest.innerHTML = `<b>${reg.name}</b><span>${n} live ${n === 1 ? 'site' : 'sites'}</span>`;
    }
  }

  setCaption(region, domain) {
    if (!this.caption) return;
    if (!region) {
      this.caption.textContent = `${HOME.name} → ${this.regions.length} regions · ${REGIONS.length} live domains · hover a domain`;
      this.caption.classList.remove('is-live');
    } else {
      this.caption.textContent = `${HOME.name} → ${region.name} · ${domain}`;
      this.caption.classList.add('is-live');
    }
  }

  /** Is this client-space point inside the globe box? (used to mute cursor FX) */
  containsClient(x, y) {
    const r = this.rect;
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ---------- per-frame ---------- */
  update(time, dt) {
    if (!this.view) return false;
    const rect = this.view.getBoundingClientRect();
    if (!rectInView(rect, 120) || rect.width < 8) { this.rect = null; return false; }
    this.rect = rect;

    // First reveal once the land is here and the stage is properly on screen
    if (this.land && this.revealAt == null && rectInView(rect, -40)) this.revealAt = time;
    const reveal = this.revealAt == null ? 0 : smoothstep((time - this.revealAt) / GLOBE.assembleSeconds);
    this.landMat.uniforms.uReveal.value = reveal;

    // Orientation: idle sway around Dhaka, or face the hovered route
    const reg = this.active != null ? this.regions[this.active] : null;
    let yawT, tiltT, lambda;
    if (reg) {
      const mid = vecToLatLng(this.homeVec.clone().add(reg.vec));
      yawT = -Math.PI / 2 - mid.lng;
      tiltT = clamp(mid.lat, -1.05, 1.05);
      lambda = 3.2;
    } else {
      yawT = yawFor(HOME.lng) + Math.sin((time * Math.PI * 2) / GLOBE.idlePeriod) * GLOBE.idleSway;
      tiltT = GLOBE.idleTilt + Math.sin(time * 0.23) * 0.05;
      lambda = 1.6;
    }
    const k = 1 - Math.exp(-lambda * dt);
    this.yaw += shortestAngle(this.yaw, yawT) * k;
    this.tilt += (tiltT - this.tilt) * k;
    this.group.rotation.set(this.tilt, this.yaw, 0);

    // Arc draw-in / retreat
    this.drawT = clamp(this.drawT + (reg ? dt / 0.75 : -dt / 0.3), 0, 1);
    const draw = smoothstep(this.drawT);

    // Hot land around the region
    const lu = this.landMat.uniforms;
    if (reg) lu.uHot.value.copy(reg.vec);
    lu.uHotAmt.value = ease(lu.uHotAmt.value, reg ? draw : 0, 8, dt);

    // Home pulse
    const hp = 0.5 + 0.5 * Math.sin(time * 2.0);
    this.homeRing.scale.setScalar(1 + hp * 0.6);
    this.homeRing.material.opacity = 0.42 - hp * 0.22;
    this.homeGlow.scale.setScalar(0.13 + hp * 0.03);

    // Regions
    const segs = 64;
    this.regions.forEach((r, i) => {
      const on = reg === r;
      const dim = reg && !on;
      r.thin.material.opacity = ease(r.thin.material.opacity, on ? 0 : dim ? 0.05 : 0.16, 8, dt);
      r.thick.geometry.setDrawRange(0, on ? Math.floor(draw * segs) * 36 : 0);
      r.thick.material.opacity = on ? Math.min(1, this.drawT * 4) * 0.95 : 0;
      r.dot.material.opacity = ease(r.dot.material.opacity, dim ? 0.35 : 0.9, 8, dt);
      r.dot.scale.setScalar(ease(r.dot.scale.x, on ? 1.6 : 1, 8, dt));

      // landing pulse
      if (on && this.drawT > 0.85) {
        const f = (time * 1.1 + i * 0.37) % 1;
        r.ring.scale.setScalar(1 + f * 2.4);
        r.ring.material.opacity = (1 - f) * 0.9;
      } else {
        r.ring.material.opacity = ease(r.ring.material.opacity, 0, 10, dt);
      }

      // travelling packet
      r.phase = (r.phase + dt * r.speed * (on ? 3 : 1)) % 1;
      r.packet.position.copy(r.curve.getPoint(r.phase, this._v));
      const env = Math.pow(Math.sin(Math.PI * r.phase), 0.6);
      r.packet.material.opacity = env * (on ? 1 : dim ? 0.12 : 0.55);
      r.packet.scale.setScalar(on ? 0.075 : 0.05);
    });

    this._reg = reg;
    this._draw = draw;
    return true;
  }

  placeLabels(rect, reg, draw) {
    const place = (el, localVec, show) => {
      if (!el) return;
      const wp = this._v.copy(localVec).applyMatrix4(this.group.matrixWorld);
      const facing = wp.z / (wp.length() || 1);
      if (!show || facing < 0.12) { el.classList.remove('is-on'); return; }
      wp.project(this.camera);
      const px = (wp.x * 0.5 + 0.5) * rect.width;
      const py = (-wp.y * 0.5 + 0.5) * rect.height;
      const left = px > rect.width * 0.5;
      el.classList.toggle('is-left', left);
      el.style.left = `${px + (left ? -12 : 12)}px`;
      el.style.top = `${py}px`;
      el.classList.add('is-on');
    };
    this.group.updateMatrixWorld();
    place(this.labelHome, this.homeVec, this.landMat.uniforms.uReveal.value > 0.9);
    place(this.labelDest, reg ? reg.vec : this.homeVec, !!reg && draw > 0.6);
  }

  /** Render into the stage box. Call after the main scene has been presented. */
  render(renderer, time, dt) {
    if (!this.update(time, dt)) return;
    const rect = this.rect;
    const W = window.innerWidth, H = window.innerHeight;
    const x = rect.left, y = H - rect.bottom, w = rect.width, h = rect.height;
    if (w < 8 || h < 8) return;

    const aspect = w / h;
    if (Math.abs(this.camera.aspect - aspect) > 1e-3) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const halfV = THREE.MathUtils.degToRad(GLOBE.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const d = 1 / Math.sin(GLOBE.fit * Math.min(halfV, halfH));
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.landMat.uniforms.uScale.value = h / (2 * Math.tan(halfV));
    this.landMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    this.placeLabels(rect, this._reg, this._draw);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.autoClear = prevAutoClear;
  }
}

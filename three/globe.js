/* ============ Infrastructure globe ============
 * Wireframe globe anchored to #globeStage with a marker per production domain
 * and arcs from Dhaka. Hovering a domain pill lights its marker & arc;
 * hovering a marker lights the pill.
 */
import * as THREE from 'three';
import { Viewport, rectInView, rectCentredness, ease, getGlowTexture } from './util.js';

/* ---------- EDIT ME: where each site is served from ----------
 * These are best-guess regions; change lat/lng to the real hosting region.
 * `domain` must match the visible text of the .infra-link pill.
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

function latLngToVec3(lat, lng, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

export class Globe {
  constructor(scene, camera, theme) {
    this.scene = scene;
    this.camera = camera;
    this.viewport = new Viewport(camera);
    this.stage = document.getElementById('globeStage');
    this.links = Array.from(document.querySelectorAll('#infrastructure .infra-link'));
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.radius = 1;
    this.hovered = null;   // index of hovered region (from DOM or raycast)
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(999, 999);
    this.build(theme);
    this.bindDom();
  }

  build(theme) {
    const g = this.group;
    while (g.children.length) g.remove(g.children[0]);
    const r = this.radius;

    // Wireframe sphere
    this.wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(r, 24, 16)),
      new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: theme.isLight ? 0.14 : 0.08 })
    );
    this.wire.material.userData.base = theme.isLight ? 0.14 : 0.08;
    g.add(this.wire);

    // Faint inner shell to occlude back-side lines
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.985, 32, 24),
      new THREE.MeshBasicMaterial({ color: theme.isLight ? 0xfaf9f7 : 0x0b0b0c, transparent: true, opacity: 0.85 })
    );
    g.add(this.shell);

    // Dhaka (home)
    const homePos = latLngToVec3(HOME.lat, HOME.lng, r);
    this.home = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.02, 12, 12),
      new THREE.MeshBasicMaterial({ color: theme.accent3 })
    );
    this.home.position.copy(homePos);
    g.add(this.home);
    this.homeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: theme.accent3, transparent: true, opacity: 0.9, depthWrite: false }));
    this.homeGlow.scale.setScalar(r * 0.12);
    this.homeGlow.position.copy(homePos);
    g.add(this.homeGlow);

    // Markers + arcs
    this.markers = [];
    this.arcs = [];
    const markerGeo = new THREE.SphereGeometry(r * 0.022, 10, 10);
    REGIONS.forEach((reg, i) => {
      const p = latLngToVec3(reg.lat, reg.lng, r);
      const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: theme.accent }));
      m.position.copy(p);
      m.userData.index = i;
      g.add(m);
      this.markers.push(m);

      // Arc from home to marker, bulging outward
      const mid = homePos.clone().add(p).multiplyScalar(0.5);
      const dist = homePos.distanceTo(p);
      mid.normalize().multiplyScalar(r * (1 + dist * 0.35));
      const curve = new THREE.QuadraticBezierCurve3(homePos, mid, p);
      const pts = curve.getPoints(48);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: theme.accent2, transparent: true, opacity: 0.25 })
      );
      line.userData.baseOpacity = 0.25;
      g.add(line);
      this.arcs.push(line);

      // Travelling packet along the arc
      const packet = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: theme.accent3, transparent: true, opacity: 0.8, depthWrite: false }));
      packet.scale.setScalar(r * 0.05);
      packet.userData.curve = curve;
      packet.userData.phase = Math.random();
      packet.userData.speed = 0.08 + Math.random() * 0.06;
      g.add(packet);
      line.userData.packet = packet;
    });

    this.group.rotation.z = THREE.MathUtils.degToRad(-12);
  }

  setTheme(theme) {
    this.wire.material.color.copy(theme.accent);
    this.wire.material.userData.base = theme.isLight ? 0.14 : 0.08;
    this.shell.material.color.set(theme.isLight ? 0xfaf9f7 : 0x0b0b0c);
    this.home.material.color.copy(theme.accent3);
    this.homeGlow.material.color.copy(theme.accent3);
    this.markers.forEach(m => m.material.color.copy(theme.accent));
    this.arcs.forEach(l => { l.material.color.copy(theme.accent2); l.userData.packet.material.color.copy(theme.accent3); });
  }

  bindDom() {
    this.links.forEach((link) => {
      const label = link.textContent.trim().toLowerCase();
      const idx = REGIONS.findIndex(r => label.includes(r.domain.toLowerCase()));
      link.dataset.regionIndex = idx;
      link.addEventListener('mouseenter', () => { if (idx >= 0) this.hovered = idx; });
      link.addEventListener('mouseleave', () => { if (this.hovered === idx) this.hovered = null; });
      link.addEventListener('focus', () => { if (idx >= 0) this.hovered = idx; });
      link.addEventListener('blur', () => { if (this.hovered === idx) this.hovered = null; });
    });
  }

  setPointer(ndcX, ndcY) { this.pointer.set(ndcX, ndcY); }

  update(time, dt) {
    if (!this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    const inView = rectInView(rect, 200);
    this.group.visible = inView;
    if (!inView) return;

    this.viewport.update();
    const wr = this.viewport.rectToWorld(rect);
    const targetR = Math.min(wr.w, wr.h) * 0.42;
    if (Math.abs(targetR - this.radius) > 0.01) {
      // Resize by scaling the group rather than rebuilding
      this.group.scale.setScalar(targetR / this.radius);
    }
    this.group.position.set(wr.x, wr.y, 0.5);
    this.group.rotation.y += dt * 0.12;

    // Reveal with centredness
    const vis = rectCentredness(rect, 0.9);
    this.wire.material.opacity = ease(this.wire.material.opacity, (this.wire.material.userData.base ?? 0.08) * (0.4 + vis * 0.6), 6, dt);

    // Pulse home
    const pulse = 0.12 + Math.sin(time * 2.4) * 0.02;
    this.homeGlow.scale.setScalar(this.radius * pulse);

    // Raycast markers when pointer over the stage
    let rayHit = null;
    if (this.pointer.x < 900) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.markers, false);
      if (hits.length) rayHit = hits[0].object.userData.index;
    }
    const active = rayHit ?? this.hovered;

    // Apply highlight state
    this.markers.forEach((m, i) => {
      const on = active === i;
      const s = ease(m.scale.x, on ? 2.4 : 1, 10, dt);
      m.scale.setScalar(s);
    });
    this.arcs.forEach((l, i) => {
      const on = active === i;
      const dim = active != null && !on;
      l.material.opacity = ease(l.material.opacity, on ? 0.95 : dim ? 0.08 : 0.25, 8, dt);
      const pk = l.userData.packet;
      pk.userData.phase = (pk.userData.phase + dt * pk.userData.speed * (on ? 3 : 1)) % 1;
      pk.position.copy(pk.userData.curve.getPoint(pk.userData.phase));
      pk.material.opacity = ease(pk.material.opacity, dim ? 0.15 : 0.8, 8, dt);
    });

    // Reflect raycast hover on the pills
    this.links.forEach(link => {
      const idx = Number(link.dataset.regionIndex);
      link.classList.toggle('is-lit', rayHit != null && idx === rayHit);
    });
  }
}

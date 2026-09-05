/* ============ Hero object + contact orbits ============ */
import * as THREE from 'three';
import { Viewport, rectInView, rectCentredness, ease, getGlowTexture } from './util.js';

/** Wireframe icosahedron floating behind the hero title. Reacts to the
 *  cursor and "pulses" every time the scramble text swaps. */
export class HeroObject {
  constructor(scene, camera, theme) {
    this.camera = camera;
    this.viewport = new Viewport(camera);
    this.hero = document.querySelector('.hero') || document.getElementById('home');
    this.group = new THREE.Group();
    scene.add(this.group);

    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.35 })
    );
    this.inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.92, 1),
      new THREE.MeshStandardMaterial({ color: theme.accent2, transparent: true, opacity: 0.06, roughness: 0.4, metalness: 0.6, flatShading: true })
    );
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: theme.accent3, transparent: true, opacity: 0.5, wireframe: true })
    );
    this.group.add(this.wire, this.inner, this.core);

    this.pulse = 0;
    this.targetRot = new THREE.Vector2();
    this.baseScale = 1;
    document.addEventListener('scramble:swap', () => { this.pulse = 1; });
  }

  setTheme(theme) {
    this.wire.material.color.copy(theme.accent);
    this.inner.material.color.copy(theme.accent2);
    this.core.material.color.copy(theme.accent3);
  }

  setMouse(nx, ny) { this.targetRot.set(ny * 0.6, nx * 0.9); }

  update(time, dt) {
    if (!this.hero) return;
    const rect = this.hero.getBoundingClientRect();
    const inView = rectInView(rect, 0);
    this.group.visible = inView;
    if (!inView) return;

    this.viewport.update();
    const wr = this.viewport.rectToWorld(rect);
    this.baseScale = Math.min(wr.w, wr.h) * 0.22;
    this.group.position.set(wr.x, wr.y + this.baseScale * 0.15, -2);

    this.pulse = ease(this.pulse, 0, 4, dt);
    const s = this.baseScale * (1 + this.pulse * 0.18);
    this.group.scale.setScalar(s);

    this.group.rotation.x = ease(this.group.rotation.x, this.targetRot.x + time * 0.08, 3, dt);
    this.group.rotation.y = ease(this.group.rotation.y, this.targetRot.y + time * 0.12, 3, dt);
    this.core.rotation.y -= dt * 0.8;
    this.core.rotation.z += dt * 0.5;

    const vis = rectCentredness(rect, 0.75);
    this.wire.material.opacity = 0.28 * vis + this.pulse * 0.4;
    this.inner.material.opacity = 0.06 * vis;
    this.core.material.opacity = 0.5 * vis;
  }
}

/** Three tilted rings with orbiting glow points around the contact block. */
export class ContactOrbits {
  constructor(scene, camera, theme) {
    this.camera = camera;
    this.viewport = new Viewport(camera);
    this.anchor = document.querySelector('.contact-inner') || document.getElementById('contact');
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.rings = [];
    this.dots = [];
    const tilts = [[0.9, 0.2, 0], [0.4, -0.6, 0.5], [-0.7, 0.4, -0.3]];
    const colors = [theme.accent, theme.accent2, theme.accent3];
    tilts.forEach((t, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1 + i * 0.22, 0.004, 8, 120),
        new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.35 })
      );
      ring.rotation.set(t[0], t[1], t[2]);
      this.group.add(ring);
      this.rings.push(ring);

      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: colors[i], transparent: true, opacity: 0.9, depthWrite: false }));
      dot.scale.setScalar(0.16);
      dot.userData.radius = 1 + i * 0.22;
      dot.userData.speed = 0.5 + i * 0.17;
      dot.userData.phase = i * 2.1;
      ring.add(dot);
      this.dots.push(dot);
    });
  }

  setTheme(theme) {
    const colors = [theme.accent, theme.accent2, theme.accent3];
    this.rings.forEach((r, i) => { r.material.color.copy(colors[i]); this.dots[i].material.color.copy(colors[i]); });
  }

  update(time, dt) {
    if (!this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    const inView = rectInView(rect, 100);
    this.group.visible = inView;
    if (!inView) return;

    this.viewport.update();
    const wr = this.viewport.rectToWorld(rect);
    const s = Math.max(wr.w, wr.h) * 0.42;
    this.group.position.set(wr.x, wr.y, -1);
    this.group.scale.setScalar(s);
    this.group.rotation.y += dt * 0.1;

    const vis = rectCentredness(rect, 0.8);
    this.rings.forEach((r, i) => {
      r.rotation.z += dt * (0.05 + i * 0.03);
      r.material.opacity = 0.35 * vis;
      const d = this.dots[i];
      const a = time * d.userData.speed + d.userData.phase;
      d.position.set(Math.cos(a) * d.userData.radius, Math.sin(a) * d.userData.radius, 0);
      d.material.opacity = 0.9 * vis;
    });
  }
}

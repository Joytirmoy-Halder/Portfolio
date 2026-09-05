/* ============ Shared helpers for the motion layer ============ */
import * as THREE from 'three';

export const root = document.documentElement;

/** Read the live CSS theme tokens so WebGL colours always match the DOM theme. */
export function readTheme() {
  const s = getComputedStyle(root);
  const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return {
    isLight: root.getAttribute('data-theme') === 'light',
    accent: new THREE.Color(get('--accent', '#e0a42b')),
    accent2: new THREE.Color(get('--accent-2', '#c9822a')),
    accent3: new THREE.Color(get('--accent-3', '#f0c368')),
    fg: new THREE.Color(get('--fg', '#f4f3f1')),
  };
}

/** Fire `cb(theme)` whenever the theme toggle flips `data-theme`. */
export function onThemeChange(cb) {
  const obs = new MutationObserver(() => cb(readTheme()));
  obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

/**
 * Maps between CSS pixels and world units on the z = 0 plane.
 * The camera looks straight down -Z, so this is a simple linear mapping.
 */
export class Viewport {
  constructor(camera) {
    this.camera = camera;
    this.update();
  }
  update() {
    const cam = this.camera;
    this.height = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.position.z;
    this.width = this.height * cam.aspect;
  }
  /** DOMRect -> { x, y, w, h } in world units (centre + size). */
  rectToWorld(rect) {
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const cx = (rect.left + rect.width / 2) / vw;
    const cy = (rect.top + rect.height / 2) / vh;
    return {
      x: (cx - 0.5) * this.width,
      y: (0.5 - cy) * this.height,
      w: (rect.width / vw) * this.width,
      h: (rect.height / vh) * this.height,
    };
  }
  clientToWorld(x, y) {
    return {
      x: (x / window.innerWidth - 0.5) * this.width,
      y: (0.5 - y / window.innerHeight) * this.height,
    };
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Frame-rate independent easing: returns the new value moving `cur` toward `target`. */
export const ease = (cur, target, lambda, dt) => THREE.MathUtils.damp(cur, target, lambda, dt);

/** Does a DOMRect intersect the viewport (with optional margin in px)? */
export function rectInView(rect, margin = 0) {
  return rect.bottom > -margin && rect.top < window.innerHeight + margin;
}

/** How centred a rect is in the viewport: 1 at centre, fading to 0 one viewport away. */
export function rectCentredness(rect, falloff = 1) {
  const vh = window.innerHeight || 1;
  const cy = rect.top + rect.height / 2;
  return clamp(1 - Math.abs(cy - vh / 2) / (vh * falloff), 0, 1);
}

let glowTexture = null;
/** Soft radial gradient texture shared by all glow sprites. */
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

/* ============ Motion layer bootstrap ============
 * Imported lazily from index.html once the page is ready. Creates a single
 * WebGL renderer behind the page and wires all effects together.
 * Dispatches `scene:ready` (success) so the preloader can finish, or
 * `scene:failed` so script.js falls back to the original 2D canvas.
 */
import * as THREE from 'three';
import { readTheme, onThemeChange, Viewport, ease, clamp } from './util.js';
import { ParticleField } from './particles.js';
import { Globe } from './globe.js';
import { HeroObject, ContactOrbits } from './objects.js';
import { PostFX } from './post.js';

export const SETTINGS = {
  maxPixelRatio: 1.5,      // cap DPR for perf on retina screens
  cameraZ: 10.72,          // gives ~10 world units of visible height at fov 50
  fov: 50,
  enablePostFX: true,      // fluid trail + chromatic aberration + grain
  enableGlobe: true,
  enableHeroObject: true,
  enableContactOrbits: true,
};

function boot() {
  const canvas = document.getElementById('three-canvas');
  if (!canvas) throw new Error('#three-canvas missing');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, SETTINGS.maxPixelRatio);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SETTINGS.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, SETTINGS.cameraZ);
  camera.lookAt(0, 0, 0);

  // Soft lighting for the few standard materials
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 4, 6);
  scene.add(key);

  let theme = readTheme();
  const viewport = new Viewport(camera);

  const particles = new ParticleField(scene, camera, theme);
  particles.setPixelRatio(dpr, window.innerHeight);
  // The globe has its own scene/camera and is drawn as a second pass into the
  // #globeView box (see globe.js) so the cursor FX never touch it.
  const globe = SETTINGS.enableGlobe ? new Globe(theme) : null;
  const hero = SETTINGS.enableHeroObject ? new HeroObject(scene, camera, theme) : null;
  const orbits = SETTINGS.enableContactOrbits ? new ContactOrbits(scene, camera, theme) : null;
  const post = SETTINGS.enablePostFX ? new PostFX(renderer, theme) : null;

  onThemeChange((t) => {
    theme = t;
    particles.setTheme(t);
    globe?.setTheme(t);
    hero?.setTheme(t);
    orbits?.setTheme(t);
    post?.setTheme(t);
  });

  /* ---------- input ---------- */
  const mouse = { x: -9999, y: -9999, nx: 0, ny: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });
  document.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

  document.addEventListener('portfolio:easteregg', () => particles.burst(0.4));

  /* ---------- resize ---------- */
  let resizeTimer = 0;
  const onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    viewport.update();
    particles.resize(dpr, h);
    post?.resize();
  };
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 120);
  });
  // Layout can shift after fonts/images load; rebuild targets once more
  window.addEventListener('load', () => setTimeout(() => particles.buildTargets(), 400));

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let lastScroll = window.scrollY;
  let scrollVel = 0;
  let running = true;
  let rafId = 0;

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // scroll velocity -> chromatic aberration
    const sy = window.scrollY;
    const inst = clamp(Math.abs(sy - lastScroll) / (window.innerHeight * 0.35), 0, 1);
    lastScroll = sy;
    scrollVel = ease(scrollVel, inst, inst > scrollVel ? 20 : 4, dt);

    // cursor in world & uv space (muted while the pointer is over the globe box)
    const overGlobe = globe ? globe.containsClient(mouse.x, mouse.y) : false;
    if (mouse.x > -9000 && !overGlobe) {
      const w = viewport.clientToWorld(mouse.x, mouse.y);
      particles.setMouseWorld(w.x, w.y);
      hero?.setMouse(mouse.nx, mouse.ny);
      post?.setMouseUv(mouse.x / window.innerWidth, 1 - mouse.y / window.innerHeight);
    } else {
      particles.setMouseWorld(9999, 9999);
      post?.setMouseUv(-10, -10);
    }

    particles.update(time, dt);
    hero?.update(time, dt);
    orbits?.update(time, dt);

    if (post) {
      post.setScrollVelocity(scrollVel);
      post.render(scene, camera, time, dt);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }

    // Second pass: the globe, clipped to its own box, drawn over the composite
    globe?.render(renderer, time, dt);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(rafId); }
    else if (!running) { running = true; clock.getDelta(); frame(); }
  });

  // Render one frame synchronously so the first paint after the preloader is populated
  frame();

  // Lose-context safety: fall back to 2D canvas
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(rafId);
    document.body.classList.remove('has-webgl');
    document.dispatchEvent(new CustomEvent('scene:failed', { detail: 'context lost' }));
  });

  return { renderer, scene, camera, particles, globe, hero, orbits, post };
}

try {
  const api = boot();
  window.__three = api; // handy for debugging in DevTools
  document.body.classList.add('has-webgl');
  document.dispatchEvent(new CustomEvent('scene:ready'));
} catch (err) {
  console.warn('[motion] WebGL layer failed, using 2D fallback:', err);
  document.dispatchEvent(new CustomEvent('scene:failed', { detail: String(err) }));
}

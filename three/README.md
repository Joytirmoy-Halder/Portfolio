# `three/` — WebGL motion layer

Adds a three.js layer behind the portfolio. No build step; three.js is pinned
and loaded from jsDelivr via an import map in `index.html`, so it runs as-is on
GitHub Pages.

## What's in here

| File | Purpose |
| --- | --- |
| `scene.js` | Bootstrap: renderer, camera, input, resize, render loop. Dispatches `scene:ready` / `scene:failed`. |
| `particles.js` | ~2 800-point morphing particle field. Re-forms per section (cloud → wave → lattice → terrain → helix → globe → ring), repels from the cursor, shatters on the `design` easter egg. |
| `globe.js` | Wireframe globe anchored to `#globeStage` with a marker + arc per production domain. Hover a pill ⇄ marker lights up. **Edit `REGIONS` here.** |
| `objects.js` | Hero wireframe icosahedron (pulses on each text-scramble swap) and the contact-section orbit rings. |
| `post.js` | Fluid cursor trail (half-res ping-pong sim), scroll-velocity chromatic aberration, grain, final composite. |
| `util.js` | Theme colour reading (`--accent*` CSS vars), DOM-rect → world-space mapping, easing helpers. |
| `motion.css` | Additive styles: `#three-canvas`, `.infra-layout`, `.globe-stage`, `.infra-link.is-lit`. |

## How it degrades

The inline script in `<head>` picks a mode **before** `script.js` runs:

- `webgl` → desktop (≥ 768 px), WebGL2 available, no `prefers-reduced-motion`.
- `canvas` → everything else. The original 2D particle background runs, the globe stage is hidden, nothing from `three/` is downloaded.

If the CDN is blocked/slow (7 s), import maps are unsupported, or the GL context is lost, `scene:failed` fires and `script.js` starts the 2D canvas. The preloader parks at 88 % until either event arrives (4 s hard failsafe as before).

Force a mode for testing: `?motion=webgl` or `?motion=canvas`.

## Tuning knobs

- `scene.js` → `SETTINGS`: DPR cap, toggles for post-FX / globe / hero object / orbits.
- `particles.js` → `CONFIG`: particle count, follow speed, cursor repulsion, burst damping.
- `particles.js` → `SECTION_SHAPES`: which shape each section id gets.
- `globe.js` → `HOME` / `REGIONS`: **lat/lng are placeholders** — set them to the real hosting regions. `domain` must match the pill text.
- `post.js` → `uDecay` (trail length), `uGrain`, aberration strength (`0.012`).
- `index.html` head script → `innerWidth < 768` mobile cutoff.

## Custom events

| Event | Fired by | Consumed by |
| --- | --- | --- |
| `scene:ready` | `scene.js` | preloader, `script.js` (stops 2D canvas if it had started) |
| `scene:failed` | `scene.js` / loader in `index.html` | preloader, `script.js` (starts 2D canvas) |
| `scramble:swap` | `script.js` | hero object pulse |
| `portfolio:easteregg` | `script.js` | particle burst |

## Upgrading three.js

Change the version in **both** import-map entries in `index.html`. The code uses only stable core APIs (`Points`, `ShaderMaterial`, `WebGLRenderTarget`, `Raycaster`, built-in geometries) plus the `colorspace_fragment` shader chunk (r152+).

## Rolling back

- Before merge: just close the PR; `main` is untouched.
- After merge: `git revert <merge-commit>` **or** restore the frozen snapshot:

  ```bash
  git fetch origin
  git checkout main
  git reset --hard origin/backup/v1-before-threejs
  git push --force-with-lease origin main
  ```

- Kill switch without a revert: remove the `<link … three/motion.css>`, the import map, the `#three-canvas` element and the final `<script type="module">` from `index.html`; `script.js` will run in `canvas` mode automatically.

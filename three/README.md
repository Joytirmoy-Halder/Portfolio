# `three/` — WebGL motion layer

Adds a three.js layer behind the portfolio. No build step; three.js is pinned
and loaded from jsDelivr via an import map in `index.html`, so it runs as-is on
GitHub Pages.

## What's in here

| File | Purpose |
| --- | --- |
| `scene.js` | Bootstrap: renderer, camera, input, resize, render loop. Dispatches `scene:ready` / `scene:failed`. |
| `particles.js` | ~2 200-point morphing particle field. Re-forms per section (cloud → wave → floor → terrain → helix → wave → ring), repels from the cursor, shatters on the `design` easter egg. Dimmed behind the text column (`CONFIG.columnDim`) and per section (`SECTION_SHAPES[].opacity`). |
| `globe.js` | Dotted-world-map globe drawn in its own scene/camera, clipped to `#globeView` (second render pass, so the cursor FX never touch it). Land dots come from `world-atlas@2/land-110m.json` (jsDelivr) and assemble on first view. Hover a pill → globe turns to the route, arc draws in, region lights up, labels + caption update, same-region pills half-light. **Edit `REGIONS` here.** |
| `objects.js` | Hero wireframe icosahedron (pulses on each text-scramble swap) and the contact-section orbit rings. |
| `post.js` | Fluid cursor trail (half-res ping-pong sim), scroll-velocity chromatic aberration, grain, final composite. |
| `util.js` | Theme colour reading (`--accent*` CSS vars), DOM-rect → world-space mapping, easing helpers. |
| `motion.css` | Additive styles: `#three-canvas`, `.infra-layout`, `.globe-stage` / `.globe-view` / `.globe-caption` / `.globe-label`, `.infra-link.is-lit` / `.is-kin`, `.infra-grid.is-focusing`. |

## How it degrades

The inline script in `<head>` picks a mode **before** `script.js` runs:

- `webgl` → desktop (≥ 768 px), WebGL2 available, no `prefers-reduced-motion`.
- `canvas` → everything else. The original 2D particle background runs, the globe stage is hidden, nothing from `three/` is downloaded.

If the CDN is blocked/slow (7 s), import maps are unsupported, or the GL context is lost, `scene:failed` fires and `script.js` starts the 2D canvas. The preloader parks at 88 % until either event arrives (4 s hard failsafe as before).

Force a mode for testing: `?motion=webgl` or `?motion=canvas`.

## Tuning knobs

- `scene.js` → `SETTINGS`: DPR cap, toggles for post-FX / globe / hero object / orbits.
- `particles.js` → `CONFIG`: particle count, size, `opacity` / `opacityLight`, `columnDim` (brightness behind the text column), cursor repulsion, burst damping.
- `particles.js` → `SECTION_SHAPES`: which shape each section id gets, plus optional `shift` (x/y as viewport fraction) and `opacity`.
- `globe.js` → `HOME` / `REGIONS`: **lat/lng are placeholders** — set them to the real hosting regions. `domain` must match the pill text; domains with the same `region` share a marker/arc.
- `globe.js` → `GLOBE`: `dotSpacingDeg` (map density), `dotSize`, `fit` (globe size inside the ring), `idleSway` (set `0` for a perfectly still globe), `idleTilt`, `assembleSeconds` (fly-in duration), `hotRadius` (how much land lights up on hover).
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

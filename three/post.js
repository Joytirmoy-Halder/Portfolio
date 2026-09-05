/* ============ Post-processing: fluid cursor trail + composite ============
 * - FluidTrail: half-res ping-pong simulation of a glowing ink trail behind
 *   the cursor (advected, decaying, splatted by mouse velocity).
 * - Composite: draws the 3D scene to screen with scroll-velocity chromatic
 *   aberration, subtle grain, and the fluid layer blended on top.
 */
import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FLUID_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tPrev;
  uniform vec2  uRes;
  uniform vec2  uMouse;      // 0..1 uv
  uniform vec2  uMouseVel;   // uv / frame
  uniform vec3  uColor;
  uniform float uDecay;
  uniform float uTime;
  uniform float uAspect;
  varying vec2 vUv;

  // cheap pseudo-curl noise for organic drift
  vec2 curl(vec2 p, float t) {
    float a = sin(p.y * 6.0 + t * 0.7) + cos(p.x * 5.0 - t * 0.5);
    float b = cos(p.x * 7.0 + t * 0.6) - sin(p.y * 4.0 + t * 0.4);
    return vec2(a, b) * 0.0012;
  }

  void main() {
    vec2 uv = vUv;
    // advect: sample from where this pixel came from
    vec2 flow = curl(uv, uTime) + vec2(0.0, 0.0008);
    vec4 prev = texture2D(tPrev, uv - flow);
    prev *= uDecay;

    // splat at cursor, scaled by velocity
    vec2 d = uv - uMouse;
    d.x *= uAspect;
    float speed = clamp(length(uMouseVel) * 60.0, 0.0, 1.0);
    float radius = 0.012 + speed * 0.018;
    float s = exp(-dot(d, d) / (radius * radius)) * (0.03 + speed * 0.22);

    vec4 c = prev;
    c.rgb += uColor * s;
    c.a   += s;
    gl_FragColor = clamp(c, 0.0, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tFluid;
  uniform float uAberration;   // 0..1 scaled by scroll velocity
  uniform float uGrain;
  uniform float uTime;
  uniform float uFluidMix;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 dir = uv - 0.5;
    float amt = uAberration * 0.012 * length(dir);
    vec4 r = texture2D(tScene, uv + dir * amt);
    vec4 g = texture2D(tScene, uv);
    vec4 b = texture2D(tScene, uv - dir * amt);
    vec4 scene = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));

    vec4 fluid = texture2D(tFluid, uv) * uFluidMix;
    // fluid is premultiplied: composite over the scene
    vec3 rgb = scene.rgb * (1.0 - fluid.a) + fluid.rgb;
    float a = scene.a + fluid.a * (1.0 - scene.a);

    float n = (hash(uv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
    rgb += n * a;

    gl_FragColor = vec4(rgb, a);
    #include <colorspace_fragment>
  }
`;

function makeRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class PostFX {
  constructor(renderer, theme) {
    this.renderer = renderer;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);

    this.fluidMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: FLUID_FRAG,
      depthTest: false, depthWrite: false,
      uniforms: {
        tPrev: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(-10, -10) },
        uMouseVel: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color() },
        uDecay: { value: 0.90 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
      },
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      // Opaque pass: shader output goes straight to the canvas (no GL blending)
      transparent: false,
      depthTest: false, depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tFluid: { value: null },
        uAberration: { value: 0 },
        uGrain: { value: 0.035 },
        uTime: { value: 0 },
        uFluidMix: { value: 1 },
      },
    });
    this.quad = new THREE.Mesh(geo, this.fluidMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.mouse = new THREE.Vector2(-10, -10);
    this.prevMouse = new THREE.Vector2(-10, -10);
    this.mouseVel = new THREE.Vector2();
    this.aberration = 0;
    this.setTheme(theme);
    this.resize();
  }

  setTheme(theme) {
    // In light theme the trail is a deep gold (additive white-ish would vanish on a light bg)
    const c = theme.isLight ? theme.accent2.clone().multiplyScalar(0.9) : theme.accent3.clone();
    this.fluidMat.uniforms.uColor.value.copy(c);
    this.compMat.uniforms.uFluidMix.value = theme.isLight ? 0.55 : 0.9;
    this.compMat.uniforms.uGrain.value = theme.isLight ? 0.02 : 0.035;
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = makeRT(w, h);
    const fw = Math.max(1, Math.floor(w / 2)), fh = Math.max(1, Math.floor(h / 2));
    if (this.fluidA) { this.fluidA.dispose(); this.fluidB.dispose(); }
    this.fluidA = makeRT(fw, fh);
    this.fluidB = makeRT(fw, fh);
    this.fluidMat.uniforms.uRes.value.set(fw, fh);
    this.fluidMat.uniforms.uAspect.value = fw / fh;
  }

  /** mouse in 0..1 uv space (y up) */
  setMouseUv(u, v) { this.mouse.set(u, v); }
  setScrollVelocity(v) { this.aberration = v; }

  /** Render `scene` with `camera` into the composite and present to screen. */
  render(scene, camera, time, dt) {
    const r = this.renderer;

    // 1. Scene -> RT
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    // 2. Fluid step (ping-pong)
    this.mouseVel.copy(this.mouse).sub(this.prevMouse);
    if (this.prevMouse.x < -5) this.mouseVel.set(0, 0);
    this.prevMouse.copy(this.mouse);
    const fu = this.fluidMat.uniforms;
    fu.tPrev.value = this.fluidA.texture;
    fu.uMouse.value.copy(this.mouse);
    fu.uMouseVel.value.copy(this.mouseVel);
    fu.uTime.value = time;
    fu.uDecay.value = Math.pow(0.90, dt * 60);
    this.quad.material = this.fluidMat;
    r.setRenderTarget(this.fluidB);
    r.render(this.quadScene, this.quadCam);
    [this.fluidA, this.fluidB] = [this.fluidB, this.fluidA];

    // 3. Composite -> screen
    const cu = this.compMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tFluid.value = this.fluidA.texture;
    cu.uAberration.value = this.aberration;
    cu.uTime.value = time;
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.sceneRT?.dispose(); this.fluidA?.dispose(); this.fluidB?.dispose();
  }
}

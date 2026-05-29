/* ============================================================
   CORE ENGINE
   Scene, renderer, camera, the Minecraft model, the UV pipeline,
   the (editable) master skin canvas, the animation system, post-
   processing, environments, the render loop and a tiny event bus.
   Everything tightly coupled to the 3D view lives here; the editor,
   arcade and UI modules import from this file.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };

/* ---------- tiny event bus ---------- */
const listeners = {};
export function on(evt, cb) { (listeners[evt] ||= []).push(cb); }
export function emit(evt, data) { (listeners[evt] || []).forEach(cb => cb(data)); }

/* ---------- shared state ---------- */
export const state = {
  isClassic: false,
  showHat: true,
  showJacket: true,
  currentName: 'steve.png',
  currentNick: null,     // set when the skin came from a username
  petMode: false,
  paused: false,
  speed: 1,
};

/* ============================================================
   RENDERER / SCENE / CAMERA
   ============================================================ */
const stage = document.getElementById('stage');
export const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
let pixelRatioCap = 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06070b);
scene.fog = new THREE.FogExp2(0x06070b, 0.0009);

export const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2000);
export const CAM_START = new THREE.Vector3(0, 24, 74);
export const TARGET = new THREE.Vector3(0, 16, 0);
camera.position.copy(CAM_START);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 24;
controls.maxDistance = 320;
controls.maxPolarAngle = Math.PI * 0.92;
controls.autoRotateSpeed = 2.2;

export function resetView() {
  camera.position.copy(CAM_START);
  controls.target.copy(TARGET);
  controls.update();
}

/* ============================================================
   LIGHTS  (brand rim lights are constant; environments add more)
   ============================================================ */
const ambient = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(28, 48, 36);
scene.add(sun);
const rimCyan = new THREE.PointLight(0x00f5ff, 120, 320);
rimCyan.position.set(-46, 30, 26);
scene.add(rimCyan);
const rimLime = new THREE.PointLight(0x39ff14, 60, 280);
rimLime.position.set(40, 12, -34);
scene.add(rimLime);

let envLights = [];   // extra lights added by the current environment

/* ============================================================
   GROUND + GRID + STARFIELD
   ============================================================ */
export const grid = new THREE.GridHelper(400, 100, 0x00f5ff, 0x0b545c);
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 1, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
ground.visible = false;
scene.add(ground);

// soft blob shadow that tracks the model height
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 34),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.05;
scene.add(blob);

// starfield (shown by the Night environment)
const stars = (() => {
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 600 + Math.random() * 400;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random());
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.8 + 20;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xbfd8ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.9 });
  const p = new THREE.Points(g, m); p.visible = false; return p;
})();
scene.add(stars);

/* ============================================================
   POST-PROCESSING (bloom)
   ============================================================ */
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.6, 0.85);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
let bloomEnabled = false;

export function setBloom(on, strength) {
  bloomEnabled = on;
  if (strength != null) bloomPass.strength = strength;
}
export function setBloomStrength(v) { bloomPass.strength = v; }

/* ============================================================
   MASTER SKIN CANVAS  (single editable source of the texture)
   ============================================================ */
export const skinCanvas = document.createElement('canvas');
skinCanvas.width = 64; skinCanvas.height = 64;
export const skinCtx = skinCanvas.getContext('2d', { willReadFrequently: true });
skinCtx.imageSmoothingEnabled = false;

let currentTex = null;
export function getTexture() { return currentTex; }
export function refreshTexture() { if (currentTex) currentTex.needsUpdate = true; }

const matBase = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
const matOverlay = new THREE.MeshStandardMaterial({
  roughness: 1, metalness: 0,
  transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: true,
});

function makeTexture() {
  if (currentTex) currentTex.dispose();
  currentTex = new THREE.CanvasTexture(skinCanvas);
  currentTex.magFilter = THREE.NearestFilter;
  currentTex.minFilter = THREE.NearestFilter;
  currentTex.generateMipmaps = false;
  currentTex.colorSpace = THREE.SRGBColorSpace;
  currentTex.needsUpdate = true;
  matBase.map = currentTex; matBase.needsUpdate = true;
  matOverlay.map = currentTex; matOverlay.needsUpdate = true;
}

/* ============================================================
   UV MAPPING  (exact Minecraft skin layout)
   Box faces order: +X, -X, +Y, -Y, +Z, -Z
   Each face writes 4 UV verts: g0 TL, g1 TR, g2 BL, g3 BR.
   ============================================================ */
const INSET = 0.02;
function setFace(uv, f, x, y, w, h, logW, logH, flipU) {
  let uL = (x + INSET) / logW;
  let uR = (x + w - INSET) / logW;
  const vT = 1 - (y + INSET) / logH;
  const vB = 1 - (y + h - INSET) / logH;
  if (flipU) { const t = uL; uL = uR; uR = t; }
  const b = f * 8;
  uv[b] = uL; uv[b + 1] = vT;
  uv[b + 2] = uR; uv[b + 3] = vT;
  uv[b + 4] = uL; uv[b + 5] = vB;
  uv[b + 6] = uR; uv[b + 7] = vB;
}
function setPartUV(geo, off, dims, logW, logH, mirror) {
  const [ox, oy] = off, [W, H, D] = dims;
  const RIGHT = [ox, oy + D, D, H];
  const FRONT = [ox + D, oy + D, W, H];
  const LEFT = [ox + D + W, oy + D, D, H];
  const BACK = [ox + 2 * D + W, oy + D, W, H];
  const TOP = [ox + D, oy, W, D];
  const BOTTOM = [ox + D + W, oy, W, D];
  const uv = geo.attributes.uv.array;
  if (!mirror) {
    setFace(uv, 0, ...LEFT, logW, logH, false);
    setFace(uv, 1, ...RIGHT, logW, logH, false);
    setFace(uv, 2, ...TOP, logW, logH, false);
    setFace(uv, 3, ...BOTTOM, logW, logH, false);
    setFace(uv, 4, ...FRONT, logW, logH, false);
    setFace(uv, 5, ...BACK, logW, logH, false);
  } else {
    setFace(uv, 0, ...RIGHT, logW, logH, true);
    setFace(uv, 1, ...LEFT, logW, logH, true);
    setFace(uv, 2, ...TOP, logW, logH, true);
    setFace(uv, 3, ...BOTTOM, logW, logH, true);
    setFace(uv, 4, ...FRONT, logW, logH, true);
    setFace(uv, 5, ...BACK, logW, logH, true);
  }
  geo.attributes.uv.needsUpdate = true;
}

/* ============================================================
   BUILD MODEL  (1 unit = 1 Minecraft pixel, feet on y = 0)
   ============================================================ */
const INF_BODY = 0.25, INF_HAT = 0.5;
function makePart(dims, pivotPos, meshPos, inflate) {
  const [W, H, D] = dims;
  const pivot = new THREE.Group();
  pivot.position.set(...pivotPos);
  const geo = new THREE.BoxGeometry(W, H, D);
  const mesh = new THREE.Mesh(geo, matBase);
  mesh.position.set(...meshPos);
  pivot.add(mesh);
  const ovGeo = new THREE.BoxGeometry(W + 2 * inflate, H + 2 * inflate, D + 2 * inflate);
  const ovMesh = new THREE.Mesh(ovGeo, matOverlay);
  ovMesh.position.set(...meshPos);
  pivot.add(ovMesh);
  return { pivot, mesh, geo, ovMesh, ovGeo, dims };
}

export const root = new THREE.Group();
scene.add(root);
export const upperBody = new THREE.Group();
upperBody.position.set(0, 12, 0);
root.add(upperBody);

const head = makePart([8, 8, 8], [0, 12, 0], [0, 4, 0], INF_HAT);
const body = makePart([8, 12, 4], [0, 0, 0], [0, 6, 0], INF_BODY);
const rArm = makePart([4, 12, 4], [-6, 12, 0], [0, -6, 0], INF_BODY);
const lArm = makePart([4, 12, 4], [6, 12, 0], [0, -6, 0], INF_BODY);
upperBody.add(body.pivot, head.pivot, rArm.pivot, lArm.pivot);
const rLeg = makePart([4, 12, 4], [-2, 12, 0], [0, -6, 0], INF_BODY);
const lLeg = makePart([4, 12, 4], [2, 12, 0], [0, -6, 0], INF_BODY);
root.add(rLeg.pivot, lLeg.pivot);

export const parts = { head, body, rArm, lArm, rLeg, lLeg };

/* ============================================================
   APPLY SKIN
   ============================================================ */
function buildUVs() {
  const logW = 64, logH = state.isClassic ? 32 : 64;
  setPartUV(head.geo, [0, 0], [8, 8, 8], logW, logH, false);
  setPartUV(body.geo, [16, 16], [8, 12, 4], logW, logH, false);
  setPartUV(rArm.geo, [40, 16], [4, 12, 4], logW, logH, false);
  setPartUV(rLeg.geo, [0, 16], [4, 12, 4], logW, logH, false);
  if (state.isClassic) {
    setPartUV(lArm.geo, [40, 16], [4, 12, 4], logW, logH, true);
    setPartUV(lLeg.geo, [0, 16], [4, 12, 4], logW, logH, true);
  } else {
    setPartUV(lArm.geo, [32, 48], [4, 12, 4], logW, logH, false);
    setPartUV(lLeg.geo, [16, 48], [4, 12, 4], logW, logH, false);
  }
  setPartUV(head.ovGeo, [32, 0], [8, 8, 8], logW, logH, false);
  if (!state.isClassic) {
    setPartUV(body.ovGeo, [16, 32], [8, 12, 4], logW, logH, false);
    setPartUV(rArm.ovGeo, [40, 32], [4, 12, 4], logW, logH, false);
    setPartUV(lArm.ovGeo, [48, 48], [4, 12, 4], logW, logH, false);
    setPartUV(rLeg.ovGeo, [0, 32], [4, 12, 4], logW, logH, false);
    setPartUV(lLeg.ovGeo, [0, 48], [4, 12, 4], logW, logH, false);
  }
  applyLayerVisibility();
}
export { buildUVs };

export function applyLayerVisibility() {
  head.ovMesh.visible = state.showHat;
  [body, rArm, lArm, rLeg, lLeg].forEach(p => { p.ovMesh.visible = state.showJacket && !state.isClassic; });
}
export function setLayer(hat, jacket) {
  if (hat != null) state.showHat = hat;
  if (jacket != null) state.showJacket = jacket;
  applyLayerVisibility();
}

export function applySkin(image, name, nick = null) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  state.isClassic = (h / w) <= 0.6;
  skinCanvas.width = w; skinCanvas.height = h;
  skinCtx.imageSmoothingEnabled = false;
  skinCtx.clearRect(0, 0, w, h);
  skinCtx.drawImage(image, 0, 0);
  makeTexture();
  buildUVs();
  state.currentName = name;
  state.currentNick = nick;
  const fn = document.getElementById('filename');
  if (fn) {
    fn.firstChild.textContent = name + ' ';
    document.getElementById('fmt').textContent =
      `(${state.isClassic ? 'classic · 64×32' : 'modern · 64×64'})`;
  }
  emit('skin', { name, nick, isClassic: state.isClassic });
}

/* ---- classic 64×32 -> modern 64×64 (bakes the mirrored limbs) ---- */
export function convertClassicToModern() {
  if (!state.isClassic) return false;
  const out = document.createElement('canvas');
  out.width = 64; out.height = 64;
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.clearRect(0, 0, 64, 64);
  o.drawImage(skinCanvas, 0, 0);           // keep the original top half intact

  // copy one face rect from the source, horizontally flipped, into dest
  const cp = (sx, sy, w, h, dx, dy) => {
    o.save();
    o.translate(dx + w, dy);
    o.scale(-1, 1);
    o.drawImage(skinCanvas, sx, sy, w, h, 0, 0, w, h);
    o.restore();
  };
  // arm: right block (40,16) -> left block (32,48)
  cp(44, 20, 4, 12, 36, 52); // FRONT  -> FRONT
  cp(52, 20, 4, 12, 44, 52); // BACK   -> BACK
  cp(40, 20, 4, 12, 40, 52); // RIGHT  -> +X strip
  cp(48, 20, 4, 12, 32, 52); // LEFT   -> -X strip
  cp(44, 16, 4, 4, 36, 48);  // TOP
  cp(48, 16, 4, 4, 40, 48);  // BOTTOM
  // leg: right block (0,16) -> left block (16,48)
  cp(4, 20, 4, 12, 20, 52);
  cp(12, 20, 4, 12, 28, 52);
  cp(0, 20, 4, 12, 24, 52);
  cp(8, 20, 4, 12, 16, 52);
  cp(4, 16, 4, 4, 20, 48);
  cp(8, 16, 4, 4, 24, 48);

  applySkin(out, state.currentName.replace(/\.png$/i, '') + '-64.png', state.currentNick);
  return true;
}

/* ---- procedural default skin (64×64 Steve-style) ---- */
export function makeDefaultSkin() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const SKIN = '#c8895b', SKIN_D = '#b67c50', HAIR = '#46301c';
  const SHIRT = '#1fb7b7', SHIRT_D = '#178f8f', PANTS = '#39499b', SHOE = '#27315f';
  const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  P(0, 0, 32, 16, SKIN);
  P(8, 0, 8, 8, HAIR); P(24, 8, 8, 8, HAIR); P(0, 8, 8, 3, HAIR);
  P(16, 8, 8, 3, HAIR); P(8, 8, 8, 2, HAIR);
  P(9, 10, 2, 1, HAIR); P(13, 10, 2, 1, HAIR);
  P(9, 11, 2, 1, '#ffffff'); P(13, 11, 2, 1, '#ffffff');
  P(10, 11, 1, 1, '#4b32b0'); P(13, 11, 1, 1, '#4b32b0');
  P(11, 13, 2, 1, SKIN_D); P(10, 14, 4, 1, '#7c4a36');
  P(16, 16, 24, 16, SHIRT); P(20, 28, 8, 4, SHIRT_D); P(20, 16, 8, 4, SHIRT_D);
  P(40, 16, 16, 16, SKIN); P(40, 16, 16, 8, SHIRT); P(40, 16, 16, 4, SHIRT_D);
  P(0, 16, 16, 16, PANTS); P(0, 28, 16, 4, SHOE);
  P(32, 48, 16, 16, SKIN); P(32, 48, 16, 8, SHIRT); P(32, 48, 16, 4, SHIRT_D);
  P(16, 48, 16, 16, PANTS); P(16, 60, 16, 4, SHOE);
  return c;
}

/* ============================================================
   ENVIRONMENTS
   ============================================================ */
export const ENVIRONMENTS = {
  void:   { label: 'VOID',   useTime: false, sky: 0x06070b, grid: 0x00f5ff, gridSub: 0x0b545c, fog: 0.0009, ground: null,    rims: 1.0, lights: [] },
  plains: { label: 'PLAINS', useTime: true,                 grid: 0x6fcf57, gridSub: 0x2f5f2a, fog: 0.0014, ground: 0x35531f, rims: 0.5, lights: [] },
  nether: { label: 'NETHER', useTime: false, sky: 0x270a08, grid: 0xff5a2a, gridSub: 0x5e1a0a, fog: 0.0055, ground: 0x3a0a06, rims: 0.3, lights: [{ c: 0xff5a2a, i: 2.2, d: 260, p: [0, 8, 34] }, { c: 0xffaa33, i: 1.2, d: 200, p: [-30, 6, -20] }] },
  night:  { label: 'NIGHT',  useTime: false, sky: 0x05060f, grid: 0x2a5fff, gridSub: 0x0a1f4a, fog: 0.0011, ground: 0x0a0e1a, rims: 0.8, lights: [], stars: true },
  studio: { label: 'STUDIO', useTime: false, sky: 0x202028, grid: 0x3a3a46, gridSub: 0x26262e, fog: 0.0,    ground: 0x16161c, rims: 0.4, lights: [{ c: 0xffffff, i: 0.9, d: 260, p: [-44, 34, 44] }, { c: 0xffffff, i: 0.5, d: 240, p: [44, 20, -30] }] },
};
let currentEnv = 'void';
let fogScale = 1;        // user fog multiplier
let timeOfDay = 0.5;     // 0..1, used only when env.useTime
let autoTime = false;

function skyFromTime(t) {
  // 0 night -> .25 dawn -> .5 noon -> .75 dusk -> 1 night
  const stops = [
    [0.00, 0x05060f], [0.22, 0x2a1830], [0.30, 0xe8743b],
    [0.50, 0x6fb7ff], [0.70, 0xe8743b], [0.78, 0x2a1830], [1.00, 0x05060f],
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), f);
}

function applyEnvironment() {
  const e = ENVIRONMENTS[currentEnv];
  envLights.forEach(l => scene.remove(l));
  envLights = [];
  (e.lights || []).forEach(d => {
    const l = new THREE.PointLight(d.c, d.i, d.d);
    l.position.set(...d.p); scene.add(l); envLights.push(l);
  });
  grid.material.color.setHex(e.grid);
  grid.material.opacity = currentEnv === 'studio' ? 0.3 : 0.55;
  if (grid.material.color) grid.material.needsUpdate = true;
  // grid uses two colors baked into geometry; recolor by rebuilding is heavy,
  // so we just tint the whole material color (good enough for the look).
  ground.visible = e.ground != null;
  if (e.ground != null) groundMat.color.setHex(e.ground);
  stars.visible = !!e.stars;
  rimCyan.intensity = 120 * e.rims;
  rimLime.intensity = 60 * e.rims;
  applyTime();
}

function applyTime() {
  const e = ENVIRONMENTS[currentEnv];
  let skyCol;
  if (e.useTime) {
    skyCol = skyFromTime(timeOfDay);
    const ang = (timeOfDay - 0.25) * Math.PI * 2;   // sun arc
    sun.position.set(Math.cos(ang) * 60, Math.max(6, Math.sin(ang) * 70), 36);
    const day = Math.max(0, Math.sin(ang));
    sun.intensity = 0.4 + day * 1.5;
    sun.color.copy(new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff7a3c), 1 - day));
    ambient.intensity = 0.7 + day * 0.7;
  } else {
    skyCol = new THREE.Color(e.sky);
    sun.position.set(28, 48, 36);
    sun.intensity = currentEnv === 'studio' ? 1.1 : 1.4;
    sun.color.setHex(0xffffff);
    ambient.intensity = currentEnv === 'nether' ? 0.9 : 1.15;
  }
  scene.background = skyCol;
  scene.fog.color.copy(skyCol);
  scene.fog.density = e.fog * fogScale;
}

export function setEnvironment(key) {
  if (!ENVIRONMENTS[key]) return;
  currentEnv = key;
  applyEnvironment();
  emit('env', key);
}
export function getEnvironment() { return currentEnv; }
export function setFogScale(v) { fogScale = v; applyTime(); }
export function setTimeOfDay(v) { timeOfDay = v; applyTime(); }
export function getTimeOfDay() { return timeOfDay; }
export function setAutoTime(b) { autoTime = b; }
export function envUsesTime() { return ENVIRONMENTS[currentEnv].useTime; }
applyEnvironment();

/* ============================================================
   ANIMATION SYSTEM
   ============================================================ */
export const NEUTRAL = {
  headX: 0, headY: 0, rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0,
  rLegX: 0, lLegX: 0, bodyX: 0, bodyScaleY: 1, rootY: 0, rootRotY: 0,
};
export const cur = { ...NEUTRAL };
const sin = Math.sin, abs = Math.abs;

export const ANIMS = {
  idle: t => ({ ...NEUTRAL,
    bodyScaleY: 1 + sin(t * 1.6) * 0.02, rArmZ: -0.06 + sin(t * 1.6) * 0.02,
    lArmZ: 0.06 - sin(t * 1.6) * 0.02, headY: sin(t * 0.7) * 0.08, rootY: sin(t * 1.6) * 0.18 }),
  walk: t => { const s = 4.2, a = 0.7; return { ...NEUTRAL,
    rLegX: sin(t * s) * a, lLegX: -sin(t * s) * a, rArmX: -sin(t * s) * a, lArmX: sin(t * s) * a,
    rArmZ: -0.05, lArmZ: 0.05, rootY: abs(sin(t * s)) * 0.5 }; },
  run: t => { const s = 8.4, a = 1.05; return { ...NEUTRAL,
    bodyX: 0.34, headX: -0.18, rLegX: sin(t * s) * a, lLegX: -sin(t * s) * a,
    rArmX: -sin(t * s) * a, lArmX: sin(t * s) * a, rootY: abs(sin(t * s)) * 0.9 }; },
  wave: t => ({ ...NEUTRAL,
    rArmZ: -2.35 + sin(t * 11) * 0.18, rArmX: 0.08, lArmZ: 0.05, headX: -0.05,
    headY: sin(t * 2) * 0.06, bodyScaleY: 1 + sin(t * 2) * 0.01 }),
  jump: t => { const b = abs(sin(t * 3.2)); return { ...NEUTRAL,
    rootY: b * 7.5, rArmZ: -0.55 - b * 0.9, lArmZ: 0.55 + b * 0.9,
    rLegX: -b * 0.55, lLegX: -b * 0.55, bodyX: -0.04 }; },
  dance: t => { const s = 6; return { ...NEUTRAL,
    rootRotY: sin(t * 3) * 0.38, rootY: abs(sin(t * 6)) * 1.4,
    rArmZ: -1.9 - abs(sin(t * s)) * 0.55, lArmZ: 1.9 + abs(sin(t * s + 1)) * 0.55,
    rArmX: sin(t * s) * 0.3, lArmX: -sin(t * s) * 0.3, headY: sin(t * 3) * 0.4,
    rLegX: sin(t * s) * 0.22, lLegX: -sin(t * s) * 0.22, bodyX: sin(t * 3) * 0.06 }; },
  sneak: t => { const s = 3, a = 0.28; return { ...NEUTRAL,
    bodyX: 0.42, headX: -0.22, rootY: -3, rLegX: sin(t * s) * a, lLegX: -sin(t * s) * a,
    rArmX: -sin(t * s) * a * 0.5 + 0.12, lArmX: sin(t * s) * a * 0.5 + 0.12,
    rArmZ: -0.08, lArmZ: 0.08 }; },
  // ---- new poses ----
  attack: t => { const s = 9; const sw = abs(sin(t * s)); return { ...NEUTRAL,
    bodyX: 0.06, rootRotY: sin(t * s) * 0.12,
    rArmX: -2.4 + sw * 2.7, rArmZ: -0.1, lArmZ: 0.12, lArmX: 0.1,
    rLegX: 0.12, lLegX: -0.12 }; },
  cheer: t => ({ ...NEUTRAL,
    rArmZ: -2.9, lArmZ: 2.9, rArmX: sin(t * 6) * 0.15, lArmX: sin(t * 6 + Math.PI) * 0.15,
    rootY: abs(sin(t * 6)) * 1.6, headX: -0.12, headY: sin(t * 3) * 0.15 }),
  sit: t => ({ ...NEUTRAL,
    rootY: -6, rLegX: -1.45, lLegX: -1.45, bodyX: 0.05,
    rArmX: -0.5, lArmX: -0.5, rArmZ: -0.18, lArmZ: 0.18, headY: sin(t * 0.8) * 0.12 }),
  swim: t => { const s = 7; return { ...NEUTRAL,
    bodyX: 1.45, rootY: 2, headX: -0.9,
    rArmX: sin(t * s) * 2.6 - 0.2, lArmX: sin(t * s + Math.PI) * 2.6 - 0.2,
    rArmZ: -0.2, lArmZ: 0.2, rLegX: sin(t * s) * 0.4, lLegX: -sin(t * s) * 0.4 }; },
  spin: t => ({ ...NEUTRAL,
    rootRotY: t * 3.2, rArmZ: -1.2, lArmZ: 1.2, rootY: abs(sin(t * 6)) * 0.6,
    headY: sin(t * 2) * 0.2 }),
};

let activeAnim = 'idle';
let animClock = 0;
export function setAnim(name) {
  if (!ANIMS[name]) return;
  activeAnim = name;
  emit('anim', name);
}
export function getAnim() { return activeAnim; }
export function setSpeed(v) { state.speed = v; }
export function setPaused(b) { state.paused = b; }

/* short one-shot gesture (used by pet mode) that reverts afterwards */
let gestureUntil = 0, gesturePrev = null;
export function playGesture(name, ms = 1500) {
  gesturePrev = activeAnim;
  setAnim(name);
  gestureUntil = performance.now() + ms;
}

function applyPose() {
  head.pivot.rotation.set(cur.headX, cur.headY, 0);
  rArm.pivot.rotation.set(cur.rArmX, 0, cur.rArmZ);
  lArm.pivot.rotation.set(cur.lArmX, 0, cur.lArmZ);
  rLeg.pivot.rotation.x = cur.rLegX;
  lLeg.pivot.rotation.x = cur.lLegX;
  upperBody.rotation.x = cur.bodyX;
  upperBody.scale.y = cur.bodyScaleY;
  root.position.y = cur.rootY;
  root.rotation.y = cur.rootRotY;
}

/* ============================================================
   POINTER (model picking + pet look-at)
   ============================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointerLook = new THREE.Vector2(0, 0);
let downX = 0, downY = 0, downT = 0;
const pickMeshes = [head.mesh, body.mesh, rArm.mesh, lArm.mesh, rLeg.mesh, lLeg.mesh,
  head.ovMesh, body.ovMesh, rArm.ovMesh, lArm.ovMesh, rLeg.ovMesh, lLeg.ovMesh];

renderer.domElement.addEventListener('pointerdown', e => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});
renderer.domElement.addEventListener('pointermove', e => {
  const r = renderer.domElement.getBoundingClientRect();
  pointerLook.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerLook.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
});
renderer.domElement.addEventListener('pointerup', e => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 5 || performance.now() - downT > 400) return;   // it was a drag
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickMeshes, false)[0];
  if (hit) emit('modelclick', { uv: hit.uv, point: hit.point });
  else if (state.petMode) { /* clicked empty space, ignore */ }
});

/* ============================================================
   RENDER LOOP  (+ adaptive quality + pause when hidden)
   ============================================================ */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, qualityTimer = 0;
const fpsEl = document.getElementById('fps');
let visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) clock.getDelta(); });

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function tick() {
  requestAnimationFrame(tick);
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gestureUntil && performance.now() > gestureUntil) { gestureUntil = 0; if (gesturePrev) setAnim(gesturePrev); }

  if (!state.paused) animClock += dt * state.speed;
  if (autoTime && envUsesTime()) {
    timeOfDay = (timeOfDay + dt * 0.02) % 1;
    applyTime();
    emit('timetick', timeOfDay);
  }

  const target = ANIMS[activeAnim](animClock);
  const k = Math.min(1, dt * 9);
  for (const key in cur) cur[key] += (target[key] - cur[key]) * k;

  // pet mode: head follows the cursor while idling
  if (state.petMode && (activeAnim === 'idle' || gestureUntil)) {
    const ty = THREE.MathUtils.clamp(pointerLook.x * 0.8, -1.1, 1.1);
    const tx = THREE.MathUtils.clamp(-pointerLook.y * 0.4, -0.4, 0.55);
    cur.headY += (ty - cur.headY) * Math.min(1, dt * 6);
    cur.headX += (tx - cur.headX) * Math.min(1, dt * 6);
  }
  applyPose();

  // blob shadow tracks vertical position
  const lift = root.position.y;
  blob.scale.setScalar(1 / (1 + Math.max(0, lift) * 0.06));
  blob.material.opacity = 0.9 / (1 + Math.max(0, lift) * 0.08);

  controls.update();
  if (bloomEnabled) composer.render(); else renderer.render(scene, camera);

  // fps + adaptive quality
  fpsAcc += dt; fpsFrames++; qualityTimer += dt;
  if (fpsAcc >= 0.5) {
    const fps = fpsFrames / fpsAcc;
    if (fpsEl) fpsEl.textContent = 'FPS ' + Math.round(fps);
    if (qualityTimer > 2.5) {
      qualityTimer = 0;
      if (fps < 40 && pixelRatioCap > 1) { pixelRatioCap = Math.max(1, pixelRatioCap - 0.5); renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap)); composer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap)); }
      else if (fps > 58 && pixelRatioCap < 2) { pixelRatioCap = Math.min(2, pixelRatioCap + 0.5); renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap)); composer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioCap)); }
    }
    fpsAcc = 0; fpsFrames = 0;
  }
}

export function start() { resize(); tick(); }

/* render a single frame on demand (used by screenshot/export) */
export function renderNow() { if (bloomEnabled) composer.render(); else renderer.render(scene, camera); }

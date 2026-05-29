import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   SCENE / RENDERER / CAMERA
   ============================================================ */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.Fog(0x0a0a0f, 90, 220);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000);
const CAM_START = new THREE.Vector3(0, 24, 74);
const TARGET = new THREE.Vector3(0, 16, 0);
camera.position.copy(CAM_START);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 28;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * 0.92;
controls.autoRotateSpeed = 2.2;

/* ============================================================
   LIGHTS
   ============================================================ */
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(28, 48, 36);
scene.add(dir);
const rimCyan = new THREE.PointLight(0x00f5ff, 120, 260);
rimCyan.position.set(-46, 30, 26);
scene.add(rimCyan);
const rimLime = new THREE.PointLight(0x39ff14, 60, 240);
rimLime.position.set(40, 12, -34);
scene.add(rimLime);

/* ============================================================
   FLOOR GRID
   ============================================================ */
const grid = new THREE.GridHelper(200, 50, 0x00f5ff, 0x0b545c);
grid.material.transparent = true;
grid.material.opacity = 0.55;
grid.position.y = 0;
scene.add(grid);

/* ============================================================
   MATERIALS (shared) — UVs differ per geometry
   ============================================================ */
let currentTex = null;
const matBase = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
const matOverlay = new THREE.MeshStandardMaterial({
  roughness: 1, metalness: 0,
  transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: true,
});

function setupTexture(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ============================================================
   UV MAPPING  (exact Minecraft skin layout)
   Box faces order in BufferGeometry: +X, -X, +Y, -Y, +Z, -Z
   Each face's 4 UV verts are written as:
     g0 top-left, g1 top-right, g2 bottom-left, g3 bottom-right
   Coordinates are normalised against the LOGICAL atlas (64 wide,
   32 or 64 tall) so HD skins map proportionally.
   ============================================================ */
const INSET = 0.02; // sub-pixel inset to avoid texel bleeding

function setFace(uv, f, x, y, w, h, logW, logH, flipU) {
  let uL = (x + INSET) / logW;
  let uR = (x + w - INSET) / logW;
  const vT = 1 - (y + INSET) / logH;
  const vB = 1 - (y + h - INSET) / logH;
  if (flipU) { const t = uL; uL = uR; uR = t; }
  const b = f * 8;
  uv[b]   = uL; uv[b+1] = vT;   // g0 top-left
  uv[b+2] = uR; uv[b+3] = vT;   // g1 top-right
  uv[b+4] = uL; uv[b+5] = vB;   // g2 bottom-left
  uv[b+6] = uR; uv[b+7] = vB;   // g3 bottom-right
}

// off = [ox,oy] atlas offset of the part's unwrap; dims = [W,H,D]
function setPartUV(geo, off, dims, logW, logH, mirror) {
  const [ox, oy] = off;
  const [W, H, D] = dims;
  const RIGHT  = [ox,             oy + D, D, H];
  const FRONT  = [ox + D,         oy + D, W, H];
  const LEFT   = [ox + D + W,     oy + D, D, H];
  const BACK   = [ox + 2*D + W,   oy + D, W, H];
  const TOP    = [ox + D,         oy,     W, D];
  const BOTTOM = [ox + D + W,     oy,     W, D];
  const uv = geo.attributes.uv.array;

  if (!mirror) {
    setFace(uv, 0, ...LEFT,   logW, logH, false); // +X = character's LEFT
    setFace(uv, 1, ...RIGHT,  logW, logH, false); // -X = character's RIGHT
    setFace(uv, 2, ...TOP,    logW, logH, false);
    setFace(uv, 3, ...BOTTOM, logW, logH, false);
    setFace(uv, 4, ...FRONT,  logW, logH, false);
    setFace(uv, 5, ...BACK,   logW, logH, false);
  } else {
    // horizontal mirror (classic left limb = reflected right limb)
    setFace(uv, 0, ...RIGHT,  logW, logH, true);
    setFace(uv, 1, ...LEFT,   logW, logH, true);
    setFace(uv, 2, ...TOP,    logW, logH, true);
    setFace(uv, 3, ...BOTTOM, logW, logH, true);
    setFace(uv, 4, ...FRONT,  logW, logH, true);
    setFace(uv, 5, ...BACK,   logW, logH, true);
  }
  geo.attributes.uv.needsUpdate = true;
}

/* ============================================================
   BUILD MODEL
   1 unit = 1 Minecraft pixel. Feet rest on y = 0.
   ============================================================ */
const INF_BODY = 0.25;   // 2nd-layer inflation
const INF_HAT  = 0.5;

function makePart(dims, pivotPos, meshPos, inflate) {
  const [W, H, D] = dims;
  const pivot = new THREE.Group();
  pivot.position.set(...pivotPos);

  const geo = new THREE.BoxGeometry(W, H, D);
  const mesh = new THREE.Mesh(geo, matBase);
  mesh.position.set(...meshPos);
  pivot.add(mesh);

  const ovGeo = new THREE.BoxGeometry(W + 2*inflate, H + 2*inflate, D + 2*inflate);
  const ovMesh = new THREE.Mesh(ovGeo, matOverlay);
  ovMesh.position.set(...meshPos);
  pivot.add(ovMesh);

  return { pivot, mesh, geo, ovMesh, ovGeo, dims };
}

const root = new THREE.Group();
scene.add(root);

const upperBody = new THREE.Group();      // pivots at the waist (world y = 12)
upperBody.position.set(0, 12, 0);
root.add(upperBody);

// pivots for upper-body parts are expressed relative to the waist group
const head = makePart([8, 8, 8],  [0, 12, 0], [0, 4, 0],  INF_HAT);
const body = makePart([8, 12, 4], [0, 0, 0],  [0, 6, 0],  INF_BODY);
const rArm = makePart([4, 12, 4], [-6, 12, 0],[0, -6, 0], INF_BODY);
const lArm = makePart([4, 12, 4], [6, 12, 0], [0, -6, 0], INF_BODY);
upperBody.add(body.pivot, head.pivot, rArm.pivot, lArm.pivot);

// legs hang from the root so the waist tilt doesn't drag them
const rLeg = makePart([4, 12, 4], [-2, 12, 0], [0, -6, 0], INF_BODY);
const lLeg = makePart([4, 12, 4], [2, 12, 0],  [0, -6, 0], INF_BODY);
root.add(rLeg.pivot, lLeg.pivot);

/* ============================================================
   APPLY SKIN  (texture + per-format UVs + layer visibility)
   ============================================================ */
let isClassic = false;
let showHat = true;
let showJacket = true;

function buildUVs() {
  const logW = 64;
  const logH = isClassic ? 32 : 64;

  // --- base layer ---
  setPartUV(head.geo, [0, 0],   [8, 8, 8],  logW, logH, false);
  setPartUV(body.geo, [16, 16], [8, 12, 4], logW, logH, false);
  setPartUV(rArm.geo, [40, 16], [4, 12, 4], logW, logH, false);
  setPartUV(rLeg.geo, [0, 16],  [4, 12, 4], logW, logH, false);

  if (isClassic) {
    setPartUV(lArm.geo, [40, 16], [4, 12, 4], logW, logH, true);  // mirror right arm
    setPartUV(lLeg.geo, [0, 16],  [4, 12, 4], logW, logH, true);  // mirror right leg
  } else {
    setPartUV(lArm.geo, [32, 48], [4, 12, 4], logW, logH, false);
    setPartUV(lLeg.geo, [16, 48], [4, 12, 4], logW, logH, false);
  }

  // --- overlay (2nd) layer ---
  setPartUV(head.ovGeo, [32, 0], [8, 8, 8], logW, logH, false); // hat — exists in both formats
  if (!isClassic) {
    setPartUV(body.ovGeo, [16, 32], [8, 12, 4], logW, logH, false);
    setPartUV(rArm.ovGeo, [40, 32], [4, 12, 4], logW, logH, false);
    setPartUV(lArm.ovGeo, [48, 48], [4, 12, 4], logW, logH, false);
    setPartUV(rLeg.ovGeo, [0, 32],  [4, 12, 4], logW, logH, false);
    setPartUV(lLeg.ovGeo, [0, 48],  [4, 12, 4], logW, logH, false);
  }
  applyLayerVisibility();
}

function applyLayerVisibility() {
  head.ovMesh.visible = showHat;
  const bodyOverlays = [body, rArm, lArm, rLeg, lLeg];
  bodyOverlays.forEach(p => { p.ovMesh.visible = showJacket && !isClassic; });
}

function applySkin(image, name) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  isClassic = (h / w) <= 0.6; // 64x32 ratio = 0.5

  if (currentTex) currentTex.dispose();
  currentTex = (image instanceof HTMLCanvasElement)
    ? new THREE.CanvasTexture(image)
    : new THREE.Texture(image);
  setupTexture(currentTex);

  matBase.map = currentTex;     matBase.needsUpdate = true;
  matOverlay.map = currentTex;  matOverlay.needsUpdate = true;

  buildUVs();

  document.getElementById('filename').firstChild.textContent = name + ' ';
  document.getElementById('fmt').textContent =
    `(${isClassic ? 'classic · 64×32' : 'modern · 64×64'})`;
}

/* ============================================================
   DEFAULT SKIN  (procedurally drawn 64x64 Steve-style)
   ============================================================ */
function makeDefaultSkin() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;

  const SKIN = '#c8895b', SKIN_D = '#b67c50';
  const HAIR = '#46301c';
  const SHIRT = '#1fb7b7', SHIRT_D = '#178f8f';
  const PANTS = '#39499b', SHOE = '#27315f';
  const P = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };

  // ---- HEAD (cross at 0,0 -> 32,16) ----
  P(0, 0, 32, 16, SKIN);
  P(8, 0, 8, 8, HAIR);          // top of head
  P(24, 8, 8, 8, HAIR);         // back of head
  P(0, 8, 8, 3, HAIR);          // right side hair
  P(16, 8, 8, 3, HAIR);         // left side hair
  P(8, 8, 8, 2, HAIR);          // front hairline
  // face (front rect 8,8 -> 16,16)
  P(9, 10, 2, 1, HAIR); P(13, 10, 2, 1, HAIR);   // brows
  P(9, 11, 2, 1, '#ffffff'); P(13, 11, 2, 1, '#ffffff'); // eye whites
  P(10, 11, 1, 1, '#4b32b0'); P(13, 11, 1, 1, '#4b32b0'); // pupils
  P(11, 13, 2, 1, SKIN_D);      // nose
  P(10, 14, 4, 1, '#7c4a36');   // mouth

  // ---- BODY (16,16 -> 40,32) ----
  P(16, 16, 24, 16, SHIRT);
  P(20, 28, 8, 4, SHIRT_D);     // hem shading on front
  P(20, 16, 8, 4, SHIRT_D);     // collar (top faces)

  // ---- RIGHT ARM (40,16 -> 56,32) : short sleeve ----
  P(40, 16, 16, 16, SKIN);
  P(40, 16, 16, 8, SHIRT);      // sleeve over shoulder + upper arm
  P(40, 16, 16, 4, SHIRT_D);

  // ---- RIGHT LEG (0,16 -> 16,32) ----
  P(0, 16, 16, 16, PANTS);
  P(0, 28, 16, 4, SHOE);        // foot

  // ---- LEFT ARM (32,48) ----
  P(32, 48, 16, 16, SKIN);
  P(32, 48, 16, 8, SHIRT);
  P(32, 48, 16, 4, SHIRT_D);

  // ---- LEFT LEG (16,48) ----
  P(16, 48, 16, 16, PANTS);
  P(16, 60, 16, 4, SHOE);

  return c;
}

applySkin(makeDefaultSkin(), 'steve.png');

/* ============================================================
   ANIMATION SYSTEM  (smoothly blended poses)
   ============================================================ */
const NEUTRAL = {
  headX:0, headY:0, rArmX:0, rArmZ:0, lArmX:0, lArmZ:0,
  rLegX:0, lLegX:0, bodyX:0, bodyScaleY:1, rootY:0, rootRotY:0,
};
const cur = { ...NEUTRAL };

const sin = Math.sin, abs = Math.abs;

const ANIMS = {
  idle: t => ({
    ...NEUTRAL,
    bodyScaleY: 1 + sin(t * 1.6) * 0.02,
    rArmZ: -0.06 + sin(t * 1.6) * 0.02,
    lArmZ:  0.06 - sin(t * 1.6) * 0.02,
    headY: sin(t * 0.7) * 0.08,
    rootY: sin(t * 1.6) * 0.18,
  }),
  walk: t => { const s = 4.2, a = 0.7; return {
    ...NEUTRAL,
    rLegX:  sin(t * s) * a,  lLegX: -sin(t * s) * a,
    rArmX: -sin(t * s) * a,  lArmX:  sin(t * s) * a,
    rArmZ: -0.05, lArmZ: 0.05,
    rootY: abs(sin(t * s)) * 0.5,
  }; },
  run: t => { const s = 8.4, a = 1.05; return {
    ...NEUTRAL,
    bodyX: 0.34, headX: -0.18,
    rLegX:  sin(t * s) * a,  lLegX: -sin(t * s) * a,
    rArmX: -sin(t * s) * a,  lArmX:  sin(t * s) * a,
    rootY: abs(sin(t * s)) * 0.9,
  }; },
  wave: t => ({
    ...NEUTRAL,
    rArmZ: -2.35 + sin(t * 11) * 0.18,
    rArmX: 0.08,
    lArmZ: 0.05,
    headX: -0.05,
    headY: sin(t * 2) * 0.06,
    bodyScaleY: 1 + sin(t * 2) * 0.01,
  }),
  jump: t => { const b = abs(sin(t * 3.2)); return {
    ...NEUTRAL,
    rootY: b * 7.5,
    rArmZ: -0.55 - b * 0.9,
    lArmZ:  0.55 + b * 0.9,
    rLegX: -b * 0.55, lLegX: -b * 0.55,
    bodyX: -0.04,
  }; },
  dance: t => { const s = 6; return {
    ...NEUTRAL,
    rootRotY: sin(t * 3) * 0.38,
    rootY: abs(sin(t * 6)) * 1.4,
    rArmZ: -1.9 - abs(sin(t * s)) * 0.55,
    lArmZ:  1.9 + abs(sin(t * s + 1)) * 0.55,
    rArmX: sin(t * s) * 0.3, lArmX: -sin(t * s) * 0.3,
    headY: sin(t * 3) * 0.4,
    rLegX: sin(t * s) * 0.22, lLegX: -sin(t * s) * 0.22,
    bodyX: sin(t * 3) * 0.06,
  }; },
  sneak: t => { const s = 3, a = 0.28; return {
    ...NEUTRAL,
    bodyX: 0.42, headX: -0.22, rootY: -3,
    rLegX:  sin(t * s) * a,  lLegX: -sin(t * s) * a,
    rArmX: -sin(t * s) * a * 0.5 + 0.12,
    lArmX:  sin(t * s) * a * 0.5 + 0.12,
    rArmZ: -0.08, lArmZ: 0.08,
  }; },
};

let activeAnim = 'idle';
let animClock = 0;

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
   RENDER LOOP
   ============================================================ */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0;
const fpsEl = document.getElementById('fps');

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  animClock += dt;

  const target = ANIMS[activeAnim](animClock);
  const k = Math.min(1, dt * 9);   // frame-rate independent smoothing
  for (const key in cur) cur[key] += (target[key] - cur[key]) * k;
  applyPose();

  controls.update();
  renderer.render(scene, camera);

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    fpsEl.textContent = 'FPS ' + Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
  }
}
animate();

/* ============================================================
   RESIZE
   ============================================================ */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ============================================================
   UI WIRING
   ============================================================ */
// animation buttons
document.querySelectorAll('.anim').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.anim').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeAnim = btn.dataset.anim;
  });
});

// layer toggles
const hatBtn = document.getElementById('hatBtn');
const jacketBtn = document.getElementById('jacketBtn');
hatBtn.addEventListener('click', () => {
  showHat = !showHat;
  hatBtn.classList.toggle('active', showHat);
  applyLayerVisibility();
});
jacketBtn.addEventListener('click', () => {
  showJacket = !showJacket;
  jacketBtn.classList.toggle('active', showJacket);
  applyLayerVisibility();
});

// camera buttons
const rotateBtn = document.getElementById('rotateBtn');
rotateBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  rotateBtn.classList.toggle('active', controls.autoRotate);
});
document.getElementById('resetBtn').addEventListener('click', () => {
  camera.position.copy(CAM_START);
  controls.target.copy(TARGET);
  controls.update();
});

// file upload
const fileInput = document.getElementById('file');
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
});

function loadFile(file) {
  if (!file.type.startsWith('image/')) { flashError('PNG image required'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => applySkin(img, file.name);
    img.onerror = () => flashError('Could not read image');
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function flashError(msg) {
  const fn = document.getElementById('filename');
  fn.firstChild.textContent = '⚠ ' + msg + ' ';
  document.getElementById('fmt').textContent = '';
}

// drag & drop on the whole stage
['dragenter', 'dragover'].forEach(evt =>
  stage.addEventListener(evt, e => { e.preventDefault(); stage.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(evt =>
  stage.addEventListener(evt, e => { e.preventDefault(); stage.classList.remove('dragging'); }));
stage.addEventListener('drop', e => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});
// stop the browser from opening the file if dropped outside the stage
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

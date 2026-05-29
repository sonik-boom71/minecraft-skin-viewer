/* ============================================================
   SKIN EDITOR
   Paints directly on the master skin canvas (core.skinCanvas):
   a 2D atlas view with zone outlines + pixel grid, plus optional
   "paint on the 3D model" via raycast UVs. Brush / eraser / fill /
   eyedropper, palette, undo-redo. Every stroke updates the live
   texture, so the model repaints in real time.
   ============================================================ */
import { skinCanvas, skinCtx, refreshTexture, state, on, emit } from './core.js';

let view, vctx;            // visible editor canvas
let scale = 4;             // texels per displayed pixel
let tool = 'brush';
let brush = 1;
let color = { r: 255, g: 0, b: 128, a: 255 };
let showGrid = true;
let paint3d = false;
let painting = false;
const undoStack = [], redoStack = [];
const UNDO_CAP = 40;

const PALETTE = [
  '#000000', '#3b3b3b', '#6f6f6f', '#b0b0b0', '#ffffff',
  '#7c4a2d', '#c8895b', '#f0c8a0', '#46301c', '#a0521e',
  '#b41f1f', '#ff5a2a', '#ffd23f', '#39ff14', '#1fb7b7',
  '#00f5ff', '#2a5fff', '#39499b', '#8a2be2', '#ff2fb0',
];

/* logical-pixel zones for the outline overlay (modern layout) */
function zones(logW, logH, classic) {
  const z = [
    ['head', 0, 0, 32, 16], ['body', 16, 16, 24, 16],
    ['r.arm', 40, 16, 16, 16], ['r.leg', 0, 16, 16, 16],
    ['hat', 32, 0, 32, 16],
  ];
  if (!classic) {
    z.push(['l.arm', 32, 48, 16, 16], ['l.leg', 16, 48, 16, 16],
      ['jacket', 16, 32, 24, 16], ['r.slv', 40, 32, 16, 16],
      ['l.slv', 48, 48, 16, 16], ['r.pnt', 0, 32, 16, 16], ['l.pnt', 0, 48, 16, 16]);
  }
  return z;
}

/* ---------- rendering the editor view ---------- */
function fit() {
  const cw = skinCanvas.width, ch = skinCanvas.height;
  scale = Math.max(2, Math.floor(280 / cw));
  view.width = cw * scale;
  view.height = ch * scale;
}
function redraw() {
  const cw = skinCanvas.width, ch = skinCanvas.height;
  vctx.imageSmoothingEnabled = false;
  // transparency checkerboard
  const cs = scale * 2;
  for (let y = 0; y < view.height; y += cs) {
    for (let x = 0; x < view.width; x += cs) {
      vctx.fillStyle = ((x / cs + y / cs) & 1) ? '#1a1d24' : '#12141a';
      vctx.fillRect(x, y, cs, cs);
    }
  }
  vctx.drawImage(skinCanvas, 0, 0, cw, ch, 0, 0, view.width, view.height);

  if (showGrid && scale >= 4) {
    vctx.strokeStyle = 'rgba(255,255,255,0.06)';
    vctx.lineWidth = 1;
    vctx.beginPath();
    for (let x = 0; x <= cw; x++) { vctx.moveTo(x * scale + .5, 0); vctx.lineTo(x * scale + .5, view.height); }
    for (let y = 0; y <= ch; y++) { vctx.moveTo(0, y * scale + .5); vctx.lineTo(view.width, y * scale + .5); }
    vctx.stroke();
  }
  // zone outlines (scaled from logical 64-wide layout to canvas pixels)
  const logW = 64, logH = state.isClassic ? 32 : 64;
  const sx = cw / logW, sy = ch / logH;
  vctx.strokeStyle = 'rgba(0,245,255,0.5)';
  vctx.lineWidth = 1;
  zones(logW, logH, state.isClassic).forEach(([, x, y, w, h]) => {
    vctx.strokeRect(x * sx * scale + .5, y * sy * scale + .5, w * sx * scale - 1, h * sy * scale - 1);
  });
}

/* ---------- painting ---------- */
function pushUndo() {
  try { undoStack.push(skinCtx.getImageData(0, 0, skinCanvas.width, skinCanvas.height)); }
  catch (e) { return; }
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack.length = 0;
}
function rgba() { return `rgba(${color.r},${color.g},${color.b},${color.a / 255})`; }

function paintTexel(tx, ty) {
  tx = Math.floor(tx); ty = Math.floor(ty);
  const r = brush - 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= skinCanvas.width || y >= skinCanvas.height) continue;
    if (tool === 'eraser') skinCtx.clearRect(x, y, 1, 1);
    else { skinCtx.clearRect(x, y, 1, 1); skinCtx.fillStyle = rgba(); skinCtx.fillRect(x, y, 1, 1); }
  }
  refreshTexture();
}
function pickTexel(tx, ty) {
  const d = skinCtx.getImageData(Math.floor(tx), Math.floor(ty), 1, 1).data;
  color = { r: d[0], g: d[1], b: d[2], a: d[3] || 255 };
  syncColorUI();
}
function floodFill(tx, ty) {
  tx = Math.floor(tx); ty = Math.floor(ty);
  const W = skinCanvas.width, H = skinCanvas.height;
  const img = skinCtx.getImageData(0, 0, W, H);
  const d = img.data;
  const idx = (x, y) => (y * W + x) * 4;
  const s = idx(tx, ty);
  const tgt = [d[s], d[s + 1], d[s + 2], d[s + 3]];
  const rep = [color.r, color.g, color.b, color.a];
  if (tgt[0] === rep[0] && tgt[1] === rep[1] && tgt[2] === rep[2] && tgt[3] === rep[3]) return;
  const match = i => d[i] === tgt[0] && d[i + 1] === tgt[1] && d[i + 2] === tgt[2] && d[i + 3] === tgt[3];
  const stack = [[tx, ty]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = idx(x, y);
    if (!match(i)) continue;
    d[i] = rep[0]; d[i + 1] = rep[1]; d[i + 2] = rep[2]; d[i + 3] = rep[3];
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  skinCtx.putImageData(img, 0, 0);
  refreshTexture();
}

function eventTexel(e) {
  const r = view.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * skinCanvas.width;
  const y = (e.clientY - r.top) / r.height * skinCanvas.height;
  return [x, y];
}

function onDown(e) {
  e.preventDefault();
  const [x, y] = eventTexel(e);
  if (tool === 'pick') { pickTexel(x, y); return; }
  pushUndo();
  if (tool === 'fill') { floodFill(x, y); redraw(); emit('paint'); return; }
  painting = true;
  paintTexel(x, y); redraw();
  view.setPointerCapture(e.pointerId);
}
function onMove(e) { if (!painting) return; const [x, y] = eventTexel(e); paintTexel(x, y); redraw(); }
function onUp() { if (painting) { painting = false; emit('paint'); } }

/* ---------- undo / redo ---------- */
function undo() {
  if (!undoStack.length) return;
  redoStack.push(skinCtx.getImageData(0, 0, skinCanvas.width, skinCanvas.height));
  skinCtx.putImageData(undoStack.pop(), 0, 0);
  refreshTexture(); redraw();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(skinCtx.getImageData(0, 0, skinCanvas.width, skinCanvas.height));
  skinCtx.putImageData(redoStack.pop(), 0, 0);
  refreshTexture(); redraw();
}

/* ---------- color UI ---------- */
let colorInput, recentEl;
const recents = [];
function syncColorUI() {
  if (colorInput) colorInput.value = '#' + [color.r, color.g, color.b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function setColorHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  color = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
  if (!recents.includes(hex)) { recents.unshift(hex); recents.length = Math.min(recents.length, 8); renderRecents(); }
  syncColorUI();
}
function renderRecents() {
  if (!recentEl) return;
  recentEl.innerHTML = '';
  recents.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = hex;
    b.addEventListener('click', () => setColorHex(hex));
    recentEl.appendChild(b);
  });
}

/* ============================================================ */
export function initEditor() {
  view = document.getElementById('editorCanvas');
  if (!view) return;
  vctx = view.getContext('2d');
  colorInput = document.getElementById('eColor');
  recentEl = document.getElementById('eRecent');

  // palette
  const pal = document.getElementById('palette');
  PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = hex; b.title = hex;
    b.addEventListener('click', () => setColorHex(hex));
    pal.appendChild(b);
  });
  colorInput.addEventListener('input', () => setColorHex(colorInput.value));
  setColorHex('#00f5ff');

  // tools
  document.querySelectorAll('.etool').forEach(btn => btn.addEventListener('click', () => {
    tool = btn.dataset.tool;
    document.querySelectorAll('.etool').forEach(b => b.classList.toggle('active', b === btn));
  }));
  document.querySelectorAll('.ebsize').forEach(btn => btn.addEventListener('click', () => {
    brush = +btn.dataset.size;
    document.querySelectorAll('.ebsize').forEach(b => b.classList.toggle('active', b === btn));
  }));

  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  document.getElementById('eUndo').addEventListener('click', undo);
  document.getElementById('eRedo').addEventListener('click', redo);
  document.getElementById('eClear').addEventListener('click', () => {
    pushUndo(); skinCtx.clearRect(0, 0, skinCanvas.width, skinCanvas.height); refreshTexture(); redraw(); emit('paint');
  });
  const gr = document.getElementById('eGrid');
  gr.classList.toggle('active', showGrid);
  gr.addEventListener('click', () => { showGrid = !showGrid; gr.classList.toggle('active', showGrid); redraw(); });
  const p3 = document.getElementById('ePaint3d');
  p3.addEventListener('click', () => { paint3d = !paint3d; p3.classList.toggle('active', paint3d); });
  document.getElementById('eDownload').addEventListener('click', downloadSkin);

  // 3D click painting
  on('modelclick', ({ uv }) => {
    if (!paint3d || !uv) return;
    const tx = uv.x * skinCanvas.width;
    const ty = (1 - uv.y) * skinCanvas.height;
    if (tool === 'pick') pickTexel(tx, ty);
    else { pushUndo(); if (tool === 'fill') floodFill(tx, ty); else paintTexel(tx, ty); redraw(); emit('paint'); }
  });

  on('skin', () => { fit(); redraw(); undoStack.length = 0; redoStack.length = 0; });
  fit(); redraw();
}

export function exportSkinDataURL() { return skinCanvas.toDataURL('image/png'); }
export function downloadSkin() {
  const a = document.createElement('a');
  a.download = (state.currentName || 'skin').replace(/\.png$/i, '') + '.png';
  a.href = skinCanvas.toDataURL('image/png');
  a.click();
  emit('downloaded');
}

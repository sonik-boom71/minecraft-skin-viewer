/* ============================================================
   UI
   Tabs, toasts/modals, all the control wiring (animations, layers,
   camera, environment, fog, bloom, time, speed/pause), the custom
   keyframe animator, themes, hotkeys, fullscreen / hide-sidebar,
   the mobile drawer handle and first-run onboarding.
   ============================================================ */
import {
  THREE, controls, resetView, applySkin, setAnim, setLayer, state,
  setEnvironment, ENVIRONMENTS, setFogScale, setBloom, setBloomStrength,
  setTimeOfDay, setAutoTime, envUsesTime, setSpeed, setPaused,
  ANIMS, NEUTRAL, on, emit,
} from './core.js';

/* ---------- toasts ---------- */
let toastWrap;
export function toast(msg, ms = 2200) {
  if (!toastWrap) toastWrap = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  toastWrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

/* ---------- modal ---------- */
let modal, modalBody;
export function openModal(node) {
  modalBody.innerHTML = '';
  if (typeof node === 'string') modalBody.innerHTML = node; else modalBody.appendChild(node);
  modal.classList.add('open');
}
export function closeModal() { modal.classList.remove('open'); }

/* ---------- custom keyframe animator ---------- */
const SLIDER_KEYS = ['headX', 'headY', 'rArmX', 'rArmZ', 'lArmX', 'lArmZ', 'rLegX', 'lLegX', 'bodyX'];
let keyframes = [];
const SEG = 0.6;
ANIMS.custom = t => {
  if (!keyframes.length) return { ...NEUTRAL };
  if (keyframes.length === 1) return { ...NEUTRAL, ...keyframes[0] };
  const total = keyframes.length * SEG;
  const tt = (t % total) / SEG;
  const i = Math.floor(tt) % keyframes.length;
  const j = (i + 1) % keyframes.length;
  const f = tt - Math.floor(tt);
  const a = keyframes[i], b = keyframes[j];
  const out = { ...NEUTRAL };
  for (const k of SLIDER_KEYS) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * f;
  return out;
};

function buildCustomSliders() {
  const wrap = document.getElementById('kfSliders');
  if (!wrap) return;
  SLIDER_KEYS.forEach(key => {
    const row = document.createElement('label');
    row.className = 'kf-row';
    row.innerHTML = `<span>${key}</span>`;
    const r = document.createElement('input');
    r.type = 'range'; r.min = '-3'; r.max = '3'; r.step = '0.05'; r.value = '0';
    r.dataset.key = key;
    row.appendChild(r);
    wrap.appendChild(row);
  });
}
function captureKeyframe() {
  const pose = {};
  document.querySelectorAll('#kfSliders input').forEach(r => pose[r.dataset.key] = +r.value);
  keyframes.push(pose);
  document.getElementById('kfCount').textContent = keyframes.length + ' keyframes';
  setAnim('custom');
}

/* ---------- themes ---------- */
const THEMES = {
  neon: { '--cyan': '#00f5ff', '--lime': '#39ff14', '--bg': '#0a0a0f', '--txt': '#cfefff' },
  synth: { '--cyan': '#ff2fb0', '--lime': '#9b5cff', '--bg': '#12001a', '--txt': '#ffd9f3' },
  matrix: { '--cyan': '#39ff14', '--lime': '#aaff66', '--bg': '#020a02', '--txt': '#c8ffc8' },
  ember: { '--cyan': '#ff8a3c', '--lime': '#ffd23f', '--bg': '#140a06', '--txt': '#ffe6cf' },
};
function applyTheme(key) {
  const t = THEMES[key] || THEMES.neon;
  for (const k in t) document.documentElement.style.setProperty(k, t[k]);
  localStorage.setItem('sv_theme', key);
}

/* ---------- file load ---------- */
function clearGallerySelection() { document.querySelectorAll('.skin-tile').forEach(t => t.classList.remove('active')); }
function loadFile(file) {
  if (!file.type.startsWith('image/')) { toast('⚠ PNG image required'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { clearGallerySelection(); applySkin(img, file.name); };
    img.onerror = () => toast('⚠ Could not read image');
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============================================================ */
export function initUI() {
  toastWrap = document.getElementById('toasts');
  modal = document.getElementById('modal');
  modalBody = document.getElementById('modalBody');
  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  /* tabs */
  document.querySelectorAll('#tabs button').forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
  }));

  /* animation buttons */
  document.querySelectorAll('.anim').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.anim').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setAnim(btn.dataset.anim);
  }));

  /* layers */
  const hatBtn = document.getElementById('hatBtn'), jacketBtn = document.getElementById('jacketBtn');
  hatBtn.addEventListener('click', () => { state.showHat = !state.showHat; hatBtn.classList.toggle('active', state.showHat); setLayer(state.showHat, null); });
  jacketBtn.addEventListener('click', () => { state.showJacket = !state.showJacket; jacketBtn.classList.toggle('active', state.showJacket); setLayer(null, state.showJacket); });

  /* camera */
  const rotateBtn = document.getElementById('rotateBtn');
  rotateBtn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; rotateBtn.classList.toggle('active', controls.autoRotate); });
  document.getElementById('resetBtn').addEventListener('click', resetView);

  /* upload + drag&drop */
  const fileInput = document.getElementById('file'), dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files?.[0]) loadFile(e.target.files[0]); });
  const stage = document.getElementById('stage');
  ['dragenter', 'dragover'].forEach(evt => stage.addEventListener(evt, e => { e.preventDefault(); stage.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(evt => stage.addEventListener(evt, e => { e.preventDefault(); stage.classList.remove('dragging'); }));
  stage.addEventListener('drop', e => { const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  /* environments */
  const envWrap = document.getElementById('envTiles');
  Object.entries(ENVIRONMENTS).forEach(([key, e], i) => {
    const b = document.createElement('button');
    b.className = 'env-tile' + (key === 'void' ? ' active' : '');
    b.dataset.env = key; b.textContent = e.label;
    b.addEventListener('click', () => {
      setEnvironment(key);
      document.querySelectorAll('.env-tile').forEach(t => t.classList.toggle('active', t === b));
      updateTimeEnabled();
    });
    envWrap.appendChild(b);
  });

  /* fog */
  document.getElementById('fogSlider').addEventListener('input', e => setFogScale(+e.target.value));

  /* bloom */
  const bloomBtn = document.getElementById('bloomBtn'), bloomStr = document.getElementById('bloomStr');
  let bloomOn = false;
  bloomBtn.addEventListener('click', () => { bloomOn = !bloomOn; bloomBtn.classList.toggle('active', bloomOn); setBloom(bloomOn, +bloomStr.value); });
  bloomStr.addEventListener('input', e => setBloomStrength(+e.target.value));

  /* time of day */
  const timeSlider = document.getElementById('timeSlider'), autoTimeBtn = document.getElementById('autoTimeBtn');
  timeSlider.addEventListener('input', e => setTimeOfDay(+e.target.value));
  on('timetick', v => { timeSlider.value = v; });
  let autoOn = false;
  autoTimeBtn.addEventListener('click', () => { autoOn = !autoOn; autoTimeBtn.classList.toggle('active', autoOn); setAutoTime(autoOn); });
  function updateTimeEnabled() {
    const ok = envUsesTime();
    timeSlider.disabled = !ok; autoTimeBtn.disabled = !ok;
    document.getElementById('timeNote').textContent = ok ? '' : 'only in PLAINS';
  }
  updateTimeEnabled();

  /* speed + pause */
  const speedSlider = document.getElementById('speedSlider'), pauseBtn = document.getElementById('pauseBtn');
  const speedVal = document.getElementById('speedVal');
  speedSlider.addEventListener('input', e => { setSpeed(+e.target.value); speedVal.textContent = (+e.target.value).toFixed(1) + '×'; });
  pauseBtn.addEventListener('click', () => { state.paused = !state.paused; pauseBtn.classList.toggle('active', state.paused); pauseBtn.querySelector('.lbl').textContent = state.paused ? 'RESUME' : 'PAUSE'; });

  /* custom keyframes */
  buildCustomSliders();
  document.getElementById('kfCapture').addEventListener('click', captureKeyframe);
  document.getElementById('kfPlay').addEventListener('click', () => setAnim('custom'));
  document.getElementById('kfClear').addEventListener('click', () => { keyframes = []; document.getElementById('kfCount').textContent = '0 keyframes'; });

  /* themes */
  document.querySelectorAll('.theme-swatch').forEach(s => s.addEventListener('click', () => {
    applyTheme(s.dataset.theme);
    document.querySelectorAll('.theme-swatch').forEach(o => o.classList.toggle('active', o === s));
  }));
  const savedTheme = localStorage.getItem('sv_theme') || 'neon';
  applyTheme(savedTheme);
  document.querySelector(`.theme-swatch[data-theme="${savedTheme}"]`)?.classList.add('active');

  /* fullscreen + hide sidebar */
  document.getElementById('fullBtn').addEventListener('click', toggleFullscreen);
  document.getElementById('hideBtn').addEventListener('click', () => {
    document.getElementById('app').classList.toggle('nosidebar');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  });
  document.getElementById('showBtn').addEventListener('click', () => {
    document.getElementById('app').classList.remove('nosidebar');
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  });

  /* help overlay */
  document.getElementById('helpBtn').addEventListener('click', showHelp);

  /* mobile drawer handle */
  const handle = document.getElementById('drawerHandle');
  let expanded = false;
  handle?.addEventListener('click', () => {
    expanded = !expanded;
    document.getElementById('app').classList.toggle('drawer-open', expanded);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  });

  /* hotkeys */
  window.addEventListener('keydown', onKey);

  /* onboarding */
  if (!localStorage.getItem('sv_onboard')) {
    setTimeout(() => toast('Drag a PNG to load · drag to rotate · press ? for keys', 5000), 800);
    localStorage.setItem('sv_onboard', '1');
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.getElementById('app').requestFullscreen?.();
  else document.exitFullscreen?.();
}

function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  const anims = [...document.querySelectorAll('.anim')];
  if (e.key >= '1' && e.key <= '9') { const i = +e.key - 1; if (anims[i]) anims[i].click(); return; }
  if (e.key === '0') { anims[9]?.click(); return; }
  switch (e.key.toLowerCase()) {
    case 'r': document.getElementById('rotateBtn').click(); break;
    case ' ': e.preventDefault(); document.getElementById('pauseBtn').click(); break;
    case 'f': toggleFullscreen(); break;
    case 'h': document.getElementById('hatBtn').click(); break;
    case 'j': document.getElementById('jacketBtn').click(); break;
    case 'p': document.getElementById('petBtn')?.click(); break;
    case 's': document.getElementById('shotBtn')?.click(); break;
    case '?': showHelp(); break;
    case 'escape': if (modal.classList.contains('open')) closeModal(); else resetView(); break;
  }
}

function showHelp() {
  openModal(`<h2 class="modal-h">HOTKEYS</h2>
    <table class="keys">
      <tr><td>1–9 / 0</td><td>animations</td></tr>
      <tr><td>R</td><td>auto-rotate</td></tr>
      <tr><td>Space</td><td>pause / resume</td></tr>
      <tr><td>F</td><td>fullscreen</td></tr>
      <tr><td>H / J</td><td>toggle hat / jacket</td></tr>
      <tr><td>P</td><td>pet mode</td></tr>
      <tr><td>S</td><td>snapshot</td></tr>
      <tr><td>Esc</td><td>close / reset view</td></tr>
    </table>
    <p class="hint">Mouse: drag rotate · scroll zoom · right-drag pan</p>`);
}

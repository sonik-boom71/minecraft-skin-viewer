/* ============================================================
   MEDIA
   Screenshot "cards" (framed render + label) and animation export
   to WebM (native MediaRecorder) or animated GIF (gif.js loaded on
   demand from a CDN, with the worker pulled in as a blob URL so it
   isn't blocked by the cross-origin worker rule).
   ============================================================ */
import { renderer, renderNow, state, emit } from './core.js';
import { toast, openModal } from './ui.js';

/* ---------- screenshot ---------- */
function frameCard() {
  renderNow();
  const src = renderer.domElement;
  const w = src.width, h = src.height, pad = Math.round(w * 0.03), foot = Math.round(w * 0.06);
  const card = document.createElement('canvas');
  card.width = w + pad * 2; card.height = h + pad * 2 + foot;
  const g = card.getContext('2d');
  g.fillStyle = '#06070b'; g.fillRect(0, 0, card.width, card.height);
  g.drawImage(src, pad, pad, w, h);
  // neon border
  g.strokeStyle = '#00f5ff'; g.lineWidth = Math.max(2, w * 0.004);
  g.shadowColor = '#00f5ff'; g.shadowBlur = 18;
  g.strokeRect(pad / 2, pad / 2, card.width - pad, card.height - pad / 2 - foot / 2);
  g.shadowBlur = 0;
  // labels
  const fs = Math.round(w * 0.035);
  g.fillStyle = '#39ff14'; g.font = `${fs}px monospace`; g.textBaseline = 'middle';
  g.fillText((state.currentName || 'skin').replace(/\.png$/i, ''), pad + 6, h + pad + foot * 0.5);
  g.fillStyle = '#6f8a95'; g.font = `${Math.round(fs * 0.8)}px monospace`;
  const tag = 'SKIN VIEWER · 3D';
  g.fillText(tag, card.width - pad - g.measureText(tag).width - 6, h + pad + foot * 0.5);
  return card;
}

export function screenshot() {
  const card = frameCard();
  const url = card.toDataURL('image/png');
  const box = document.createElement('div');
  box.innerHTML = `<h2 class="modal-h">SNAPSHOT</h2>
    <img class="shot" src="${url}" alt="snapshot">
    <div class="modal-actions"></div>`;
  const dl = document.createElement('button');
  dl.className = 'full'; dl.innerHTML = '<span class="ico">⬇</span>DOWNLOAD PNG';
  dl.addEventListener('click', () => { const a = document.createElement('a'); a.download = 'skinviewer-shot.png'; a.href = url; a.click(); });
  box.querySelector('.modal-actions').appendChild(dl);
  openModal(box);
  emit('achieve', 'photographer');
}

/* ---------- frame grabbing ---------- */
function grabScaled(maxW) {
  renderNow();
  const src = renderer.domElement;
  const sc = Math.min(1, maxW / src.width);
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/* ---------- WebM (native) ---------- */
function exportWebM(seconds, setStatus) {
  if (!('MediaRecorder' in window) || !renderer.domElement.captureStream) { toast('WebM not supported here'); return; }
  const stream = renderer.domElement.captureStream(30);
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a'); a.download = 'skinviewer.webm'; a.href = URL.createObjectURL(blob); a.click();
    setStatus(''); toast('WebM saved'); emit('achieve', 'director');
  };
  rec.start();
  let left = seconds;
  setStatus(`recording ${left}s…`);
  const iv = setInterval(() => { left--; if (left > 0) setStatus(`recording ${left}s…`); }, 1000);
  setTimeout(() => { clearInterval(iv); rec.stop(); }, seconds * 1000);
}

/* ---------- GIF (gif.js on demand) ---------- */
let gifWorkerURL = null;
function loadGifLib() {
  return new Promise((res, rej) => {
    if (window.GIF) return res();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function getGifWorker() {
  if (gifWorkerURL) return gifWorkerURL;
  const res = await fetch('https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js');
  const text = await res.text();
  gifWorkerURL = URL.createObjectURL(new Blob([text], { type: 'application/javascript' }));
  return gifWorkerURL;
}
async function exportGIF(seconds, setStatus) {
  setStatus('loading encoder…');
  try { await loadGifLib(); } catch { toast('Could not load GIF encoder — try WebM'); setStatus(''); return; }
  let worker; try { worker = await getGifWorker(); } catch { toast('GIF worker blocked — try WebM'); setStatus(''); return; }
  const fps = 16, frames = Math.round(seconds * fps), delay = 1000 / fps;
  const sample = grabScaled(420);
  const gif = new window.GIF({ workers: 2, quality: 8, width: sample.width, height: sample.height, workerScript: worker, transparent: null });
  gif.on('progress', p => setStatus('encoding ' + Math.round(p * 100) + '%'));
  gif.on('finished', blob => {
    const a = document.createElement('a'); a.download = 'skinviewer.gif'; a.href = URL.createObjectURL(blob); a.click();
    setStatus(''); toast('GIF saved'); emit('achieve', 'director');
  });
  let i = 0;
  setStatus('capturing…');
  const cap = () => {
    gif.addFrame(grabScaled(420), { copy: true, delay });
    if (++i < frames) { setStatus(`capturing ${i}/${frames}`); setTimeout(cap, delay); }
    else { setStatus('encoding…'); gif.render(); }
  };
  cap();
}

/* ============================================================ */
export function initMedia() {
  const shotBtn = document.getElementById('shotBtn');
  if (shotBtn) shotBtn.addEventListener('click', screenshot);

  const status = document.getElementById('exportStatus');
  const setStatus = t => { if (status) status.textContent = t; };
  const dur = () => +(document.getElementById('exportDur')?.value || 3);
  document.getElementById('gifBtn')?.addEventListener('click', () => exportGIF(dur(), setStatus));
  document.getElementById('webmBtn')?.addEventListener('click', () => exportWebM(dur(), setStatus));
}

/* ============================================================
   SKINS
   Loading skins from usernames, the examples gallery (with curated
   collections), search-by-nick, random skin, recently-viewed
   history, favorites, the classic->modern converter button and
   share-link (?skin=&env=&anim=) handling. All player textures come
   from minotar.net (CORS-enabled) with mc-heads.net as a fallback.
   ============================================================ */
import {
  applySkin, convertClassicToModern, setEnvironment, setAnim,
  skinCanvas, state, on, emit,
} from './core.js';
import { toast } from './ui.js';

export const skinURL = u => `https://minotar.net/skin/${u}`;
export const skinURLAlt = u => `https://mc-heads.net/skin/${u}`;
export const faceURL = u => `https://minotar.net/helm/${u}/48`;

/* curated collections of real usernames */
export const COLLECTIONS = {
  Famous: ['MHF_Steve', 'MHF_Alex', 'Notch', 'jeb_', 'Technoblade', 'Dream', 'CaptainSparklez', 'Skeppy', 'TommyInnit'],
  Stars: ['Ph1LzA', 'WilburSoot', 'GeorgeNotFound', 'Sapnap', 'Tubbo_', 'Ranboolive', 'BadBoyHalo', 'Quackity', 'KSI'],
  Builders: ['Grian', 'MumboJumbo', 'iskall85', 'Etho', 'docm77', 'GoodTimesWithScar', 'ZombieCleo', 'xisumavoid', 'Keralis'],
  Classic: ['Notch', 'jeb_', 'Dinnerbone', 'Herobrine', 'MHF_Steve', 'C418', 'Markus', 'Honeydew', 'Xephos'],
};
export const RANDOM_NAMES = [...new Set(Object.values(COLLECTIONS).flat())];

export function loadSkinFromURL(url, name, altUrl, nick = null) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => applySkin(img, name, nick);
  img.onerror = () => {
    if (altUrl) loadSkinFromURL(altUrl, name, null, nick);
    else { toast('⚠ Could not load ' + name); emit('loadfail', name); }
  };
  img.src = url;
}
export function loadByNick(nick) {
  const clean = nick.trim().replace(/[^A-Za-z0-9_]/g, '');
  if (!clean) return;
  loadSkinFromURL(skinURL(clean), clean, skinURLAlt(clean), clean);
}

function loadFromDataURL(dataURL, name, nick = null) {
  const img = new Image();
  img.onload = () => applySkin(img, name, nick);
  img.src = dataURL;
}

/* ---------- gallery + collections ---------- */
let galleryEl, activeCollection = 'Famous';
function renderGallery() {
  galleryEl.innerHTML = '';
  COLLECTIONS[activeCollection].forEach(user => {
    const tile = document.createElement('button');
    tile.className = 'skin-tile'; tile.title = user;
    const img = document.createElement('img');
    img.alt = user; img.loading = 'lazy'; img.src = faceURL(user);
    img.onerror = () => { img.src = `https://mc-heads.net/avatar/${user}/48`; };
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = user.replace(/^MHF_/, '');
    tile.append(img, nm);
    tile.addEventListener('click', () => {
      document.querySelectorAll('.skin-tile').forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
      loadSkinFromURL(skinURL(user), user.replace(/^MHF_/, ''), skinURLAlt(user), user);
    });
    galleryEl.appendChild(tile);
  });
}

/* ---------- history (localStorage) ---------- */
const HKEY = 'sv_history', FKEY = 'sv_favs';
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const snapshot = () => { try { return skinCanvas.toDataURL('image/png'); } catch { return null; } };
let history = load(HKEY), favs = load(FKEY);

function recordHistory(name, nick) {
  const data = snapshot();
  if (!data) return;
  history = history.filter(h => h.data !== data);
  history.unshift({ name, nick: nick || null, data });
  history = history.slice(0, 12);
  save(HKEY, history);
  renderStrip('history', history, true);
}
function renderStrip(id, list, isHistory) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = `<p class="empty">${isHistory ? 'no skins yet' : 'tap ★ to save'}</p>`; return; }
  list.forEach((item, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'hist-tile'; wrap.title = item.name;
    const img = document.createElement('img'); img.src = item.data; img.alt = item.name;
    img.addEventListener('click', () => loadFromDataURL(item.data, item.name, item.nick));
    wrap.appendChild(img);
    if (!isHistory) {
      const x = document.createElement('button');
      x.className = 'hist-x'; x.textContent = '×'; x.title = 'remove';
      x.addEventListener('click', e => { e.stopPropagation(); favs.splice(i, 1); save(FKEY, favs); renderStrip('favorites', favs, false); emit('favchange', favs.length); });
      wrap.appendChild(x);
    }
    el.appendChild(wrap);
  });
}

export function isFav() {
  const data = snapshot();
  return data ? favs.some(f => f.data === data) : false;
}
export function toggleFav() {
  const data = snapshot();
  if (!data) { toast('Cannot save this skin'); return false; }
  const idx = favs.findIndex(f => f.data === data);
  if (idx >= 0) { favs.splice(idx, 1); toast('Removed from favorites'); }
  else { favs.unshift({ name: state.currentName, nick: state.currentNick, data }); favs = favs.slice(0, 24); toast('★ Saved to favorites'); emit('achieve', 'collector'); }
  save(FKEY, favs);
  renderStrip('favorites', favs, false);
  emit('favchange', favs.length);
  return idx < 0;
}

/* ---------- share link ---------- */
import { getEnvironment, getAnim } from './core.js';
export function buildShareLink() {
  const base = location.origin + location.pathname;
  const p = new URLSearchParams();
  if (state.currentNick) p.set('skin', state.currentNick);
  p.set('env', getEnvironment());
  p.set('anim', getAnim());
  return base + '?' + p.toString();
}
export async function copyShareLink() {
  const link = buildShareLink();
  try { await navigator.clipboard.writeText(link); toast('🔗 Link copied'); }
  catch { prompt('Copy this link:', link); }
  if (!state.currentNick) toast('Tip: only username skins reload from a link', 3200);
}
export function parseShareParams() {
  const p = new URLSearchParams(location.search);
  if (p.get('env')) setEnvironment(p.get('env'));
  if (p.get('anim')) setAnim(p.get('anim'));
  if (p.get('skin')) { loadByNick(p.get('skin')); return true; }
  return false;
}

/* ============================================================ */
export function initSkins() {
  galleryEl = document.getElementById('gallery');

  // collection tabs
  const tabs = document.getElementById('collectionTabs');
  Object.keys(COLLECTIONS).forEach((name, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === 0 ? ' active' : ''); b.textContent = name;
    b.addEventListener('click', () => {
      activeCollection = name;
      document.querySelectorAll('#collectionTabs .chip').forEach(c => c.classList.toggle('active', c === b));
      renderGallery();
    });
    tabs.appendChild(b);
  });
  renderGallery();

  // search by nick
  const nickInput = document.getElementById('nickInput');
  const go = () => { if (nickInput.value.trim()) { loadByNick(nickInput.value); emit('achieve', 'searcher'); } };
  document.getElementById('nickGo').addEventListener('click', go);
  nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });

  // random
  document.getElementById('randomBtn').addEventListener('click', () => {
    const u = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    loadSkinFromURL(skinURL(u), u.replace(/^MHF_/, ''), skinURLAlt(u), u);
    emit('achieve', 'gambler');
  });

  // convert + favorite
  document.getElementById('convertBtn').addEventListener('click', () => {
    if (convertClassicToModern()) toast('Converted to 64×64'); else toast('Already modern format');
  });
  const favBtn = document.getElementById('favBtn');
  const syncFav = () => favBtn.classList.toggle('active', isFav());
  favBtn.addEventListener('click', () => { toggleFav(); syncFav(); });

  // history feed
  on('skin', ({ name, nick }) => { recordHistory(name, nick); syncFav(); });
  renderStrip('history', history, true);
  renderStrip('favorites', favs, false);

  // share
  document.getElementById('shareBtn').addEventListener('click', copyShareLink);
}

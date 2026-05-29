/* ============================================================
   ARCADE  (gamification)
   Achievements (localStorage), "guess the player" mini-game,
   creative challenge timer, and pet mode (head follows the cursor,
   click the model to make it wave).
   ============================================================ */
import { on, emit, state, setAnim, playGesture } from './core.js';
import { RANDOM_NAMES, skinURL, skinURLAlt, loadSkinFromURL } from './skins.js';
import { toast } from './ui.js';

/* ---------- achievements ---------- */
const ACHIEVEMENTS = [
  { id: 'first', icon: '🧩', title: 'First Contact', desc: 'Load any skin' },
  { id: 'explorer', icon: '🧭', title: 'Explorer', desc: 'View 8 different skins' },
  { id: 'mover', icon: '🕺', title: 'Choreographer', desc: 'Try the 7 core animations' },
  { id: 'artist', icon: '🎨', title: 'Pixel Artist', desc: 'Paint in the editor' },
  { id: 'creator', icon: '💾', title: 'Creator', desc: 'Download a skin' },
  { id: 'searcher', icon: '🔎', title: 'Detective', desc: 'Search a username' },
  { id: 'gambler', icon: '🎲', title: 'Lucky Roll', desc: 'Load a random skin' },
  { id: 'collector', icon: '★', title: 'Collector', desc: 'Save a favorite' },
  { id: 'photographer', icon: '📸', title: 'Say Cheese', desc: 'Take a snapshot' },
  { id: 'director', icon: '🎬', title: 'Director', desc: 'Export an animation' },
  { id: 'genius', icon: '🧠', title: 'Skin Savant', desc: 'Guess streak of 5' },
  { id: 'pet', icon: '🐾', title: 'Best Friend', desc: 'Pet the character' },
];
const AKEY = 'sv_ach';
let unlocked = new Set(JSON.parse(localStorage.getItem(AKEY) || '[]'));

function renderAchievements() {
  const el = document.getElementById('achievements');
  if (!el) return;
  el.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const got = unlocked.has(a.id);
    const d = document.createElement('div');
    d.className = 'ach' + (got ? ' got' : '');
    d.title = a.desc;
    d.innerHTML = `<span class="ach-ico">${a.icon}</span><span class="ach-tt">${a.title}</span>`;
    el.appendChild(d);
  });
  const done = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).length;
  const cnt = document.getElementById('achCount');
  if (cnt) cnt.textContent = `${done}/${ACHIEVEMENTS.length}`;
}
function unlock(id) {
  if (unlocked.has(id)) return;
  const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
  unlocked.add(id);
  localStorage.setItem(AKEY, JSON.stringify([...unlocked]));
  renderAchievements();
  toast(`🏆 ${a.title} unlocked!`, 3000);
}

/* progress tracking */
const seen = new Set(JSON.parse(localStorage.getItem('sv_seen') || '[]'));
const triedAnims = new Set();
const CORE_ANIMS = ['idle', 'walk', 'run', 'wave', 'jump', 'dance', 'sneak'];

/* ---------- guess the player ---------- */
let target = null, score = 0, streak = 0, guessing = false;
function newGuess() {
  guessing = true;
  const pool = RANDOM_NAMES.filter(n => !n.startsWith('MHF_'));
  target = pool[Math.floor(Math.random() * pool.length)];
  const opts = new Set([target]);
  while (opts.size < 4) opts.add(pool[Math.floor(Math.random() * pool.length)]);
  const options = [...opts].sort(() => Math.random() - 0.5);
  loadSkinFromURL(skinURL(target), '??? · GUESS', skinURLAlt(target), null);
  const box = document.getElementById('guessOptions');
  box.innerHTML = '';
  options.forEach(name => {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => answer(name, b));
    box.appendChild(b);
  });
  document.getElementById('guessResult').textContent = 'Who is this?';
}
function answer(name, btn) {
  if (!guessing) return;
  guessing = false;
  const res = document.getElementById('guessResult');
  document.querySelectorAll('#guessOptions button').forEach(b => {
    b.disabled = true;
    if (b.textContent === target) b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
  });
  if (name === target) {
    score++; streak++;
    res.textContent = `✓ ${target}!`;
    if (streak >= 5) unlock('genius');
  } else {
    streak = 0;
    res.textContent = `✗ it was ${target}`;
  }
  document.getElementById('guessScore').textContent = `Score ${score} · Streak ${streak}`;
}

/* ---------- creative challenge ---------- */
const THEMES = ['Space explorer', 'Neon cyberpunk', 'Forest druid', 'Pirate captain', 'Robot',
  'Ice queen', 'Lava golem', 'Detective', 'Astronaut', 'Vampire', 'Steampunk', 'Ninja',
  'Rainbow', 'Knight', 'Ghost', 'Superhero', 'Chef', 'Alien'];
let challengeIv = null;
function newChallenge() {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  let left = 300;
  const themeEl = document.getElementById('challengeTheme');
  const timeEl = document.getElementById('challengeTime');
  themeEl.textContent = '🎯 ' + theme;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  timeEl.textContent = fmt(left);
  clearInterval(challengeIv);
  challengeIv = setInterval(() => {
    left--; timeEl.textContent = fmt(left);
    if (left <= 0) { clearInterval(challengeIv); timeEl.textContent = "TIME'S UP!"; toast('Challenge over — show us your skin!'); }
  }, 1000);
  toast('Open the EDIT tab and build it!', 3000);
}

/* ============================================================ */
export function initArcade() {
  renderAchievements();

  // hooks
  on('skin', ({ name }) => {
    unlock('first');
    if (name && name !== '??? · GUESS') {
      seen.add(name);
      localStorage.setItem('sv_seen', JSON.stringify([...seen]));
      if (seen.size >= 8) unlock('explorer');
    }
  });
  on('anim', name => { triedAnims.add(name); if (CORE_ANIMS.every(a => triedAnims.has(a))) unlock('mover'); });
  on('paint', () => unlock('artist'));
  on('downloaded', () => unlock('creator'));
  on('achieve', id => unlock(id));

  // guess game
  document.getElementById('guessNew')?.addEventListener('click', newGuess);
  // challenge
  document.getElementById('challengeNew')?.addEventListener('click', newChallenge);

  // pet mode
  const petBtn = document.getElementById('petBtn');
  petBtn?.addEventListener('click', () => {
    state.petMode = !state.petMode;
    petBtn.classList.toggle('active', state.petMode);
    toast(state.petMode ? '🐾 Pet mode on — move your cursor, click to wave' : 'Pet mode off');
  });
  on('modelclick', () => {
    if (state.petMode) { playGesture('wave', 1500); unlock('pet'); }
  });
}

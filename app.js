'use strict';

/* ================= config ================= */
const KEY = 'ipet-fox-v1';
const DAY = 864e5;
const params = new URLSearchParams(location.search);
// ?speed=1440 → 1 real minute = 1 day (for testing growth); ?week=5 → preview 5 tails
const SPEED = Math.max(1, Number(params.get('speed')) || 1);
const FORCE_WEEK = Number(params.get('week')) || 0;
// ?r= picks the fox renderer (remembered): anim (default) = Wan clips, fox2d.js + assets/fox/clips/;
// 2d = the still sprites; 3d = fox3d.js + assets/fox3d/<model>/ (kept as the 3D prototype)
const RENDER = (() => {
  const r = params.get('r');
  let v = r;
  try { if (r) localStorage.setItem('ipet-renderer', r); else v = localStorage.getItem('ipet-renderer'); } catch (e) {}
  return ['anim', '2d', '3d'].includes(v) ? v : 'anim';
})();
const RENDER_3D = RENDER === '3d';

// stats change per (virtual) hour
const RATES_AWAKE = { hunger: -6, fun: -5, energy: -4, clean: -3 };
const RATES_SLEEP = { hunger: -3, fun: -1, energy: +18, clean: -1 };
const MAX_CATCHUP_H = 48;

// sprite layout (fractions of the square sprite canvas) — tuned to GPT's D01/B01 sprites
const TAIL_ROOT = { x: 0.54, y: 0.92 };
const STAGES = [
  { id: 'cub', maxTails: 3, scale: 0.78 },
  { id: 'teen', maxTails: 6, scale: 0.9 },
  { id: 'adult', maxTails: 9, scale: 1.0 },
];

// mood/expression → sprite name (D01 / B01 order from the GPT session)
const SPRITES = ['happy', 'smile', 'surprised', 'puzzled', 'playful', 'sulky', 'sleepy', 'angry', 'normal'];
// action poses from the D03–D10 grids (assets/fox/t<N>/<group>/<pose>.png), each with an expression fallback
const ACTIONS = {
  'd05/eat': 'smile', 'd06/pounce': 'playful', 'd08/sleep_curl': 'sleepy', 'd04/pet_happy': 'smile',
  'd03/tilt_left': 'puzzled', 'd07/yawn': 'sleepy', 'd04/surprised_joy': 'surprised',
};
const EXPR_SPRITE = {
  normal: 'normal', happy: 'happy', love: 'd04/pet_happy', eat: 'd05/eat', play: 'd06/pounce',
  sad: 'sulky', sleep: 'd08/sleep_curl', meh: 'puzzled', surprised: 'd04/surprised_joy', curious: 'd03/tilt_left',
  angry: 'angry', tired: 'd07/yawn',
  talkA: 'happy', talkB: 'normal', // mouth open / closed while the pet speaks a parent's message
};

const FOODS = [
  { e: '🍙', hunger: 25 }, { e: '🍎', hunger: 18, fun: 3 }, { e: '🐟', hunger: 30 },
  { e: '🍰', hunger: 15, fun: 10 }, { e: '🍗', hunger: 32 },
];

/* ================= assets ================= */
// Resolved at startup: tailless body (B01) if present, else D01 sprites (which already include 1 tail).
const ASSET = { body: {}, tailMode: 'd01', tails: [], dir: '' };

function probe(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(src); i.onerror = () => res(null); i.src = src; });
}

const FALLBACK_TAIL = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200">
    <path d="M50 198 C20 170 8 120 18 70 C26 30 44 6 52 4 C66 14 88 50 86 100 C84 150 70 180 50 198Z" fill="#F28C38" stroke="#49352D" stroke-width="3"/>
    <path d="M18 70 C26 30 44 6 52 4 C66 14 82 44 85 72 C66 60 38 60 18 70Z" fill="#FFF0D9" stroke="#49352D" stroke-width="3"/>
  </svg>`);

/* Art is whole-fox images with the tails drawn in (so WAN can animate the full character):
     assets/fox/t<N>/<expression>.png   N = tail count 1..9
   Until a tail count has its own art, a temporary preview stacks tail sprites behind the
   tailless body (ASSET.tailMode 'layer') — not the production path. */
async function loadAssets() {
  const n = tailCount();
  Object.assign(ASSET, { body: {}, tailMode: 'layer', tails: [], dir: '' });
  renderedTails = -1;
  if (await probe(`assets/fox/t${n}/normal.png`)) {
    ASSET.tailMode = 'baked';
    ASSET.dir = `t${n}`;
    // expressions arrive grid by grid; anything not delivered yet falls back to the home pose
    const found = await Promise.all(SPRITES.map(name => probe(`assets/fox/t${n}/${name}.png`)));
    SPRITES.forEach((name, i) => { ASSET.body[name] = found[i] || `assets/fox/t${n}/normal.png`; });
    const acts = Object.keys(ACTIONS);
    const got = await Promise.all(acts.map(a => probe(`assets/fox/t${n}/${a}.png`)));
    acts.forEach((a, i) => { ASSET.body[a] = got[i] || ASSET.body[ACTIONS[a]]; });
  } else {
    // probe one sprite per folder; a folder is either complete or absent
    const hasBody = await probe('assets/fox/cub/normal.png');
    if (!hasBody) ASSET.tailMode = 'd01'; // D01 sprites already draw one tail
    for (const name of SPRITES) ASSET.body[name] = hasBody ? `assets/fox/cub/${name}.png` : `assets/fox/${name}.png`;
    for (const a in ACTIONS) ASSET.body[a] = ASSET.body[ACTIONS[a]];
    const hasTails = await probe('assets/fox/tail/t1.png');
    for (let i = 1; i <= 9; i++) ASSET.tails.push(hasTails ? `assets/fox/tail/t${i}.png` : FALLBACK_TAIL);
  }
  el.petWrap.classList.toggle('baked', ASSET.tailMode === 'baked');
  try { ANIM = await fetch('assets/fox/anim.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})); } catch (e) { ANIM = {}; }
  player.name = null;
}

/* ================= WAN animation hook =================
   assets/fox/anim.json maps a sprite name (optionally "<stage>/<name>") to an animation:
     { "happy": { "frames": "assets/fox/anim/happy/%03d.png", "count": 24, "fps": 12, "loop": true },
       "cub/playful": { "video": "assets/fox/anim/cub_playful.mov", "loop": false } }
   Frames: transparent PNG/WebP sequence (same 512² canvas + feet baseline as the stills).
   Video: HEVC-with-alpha .mov plays transparent on iOS Safari; anything else needs a background.
   Sprites without an entry fall back to the static PNG. */
let ANIM = {};
const player = { name: null, timer: 0 };

function frameUrls(a) {
  if (Array.isArray(a.frames)) return a.frames;
  const start = a.start || 0;
  return Array.from({ length: a.count }, (_, i) => a.frames.replace(/%0(\d)d/, (_, w) => String(start + i).padStart(+w, '0')));
}

function showSprite(name) {
  if (player.name === name) return;
  player.name = name;
  clearInterval(player.timer);
  const a = ANIM[`t${tailCount()}/${name}`] || ANIM[name];
  el.fox.classList.toggle('animated', !!a);
  if (a && a.video) {
    el.body.hidden = true;
    el.video.hidden = false;
    el.video.loop = a.loop !== false;
    if (el.video.getAttribute('src') !== a.video) el.video.src = a.video;
    el.video.currentTime = 0;
    el.video.play().catch(() => {});
    return;
  }
  el.video.pause();
  el.video.hidden = true;
  el.body.hidden = false;
  if (a && a.frames) {
    const urls = frameUrls(a);
    urls.forEach(u => { new Image().src = u; }); // warm the cache so frames don't flicker
    let i = 0;
    el.body.src = urls[0];
    player.timer = setInterval(() => {
      if (++i >= urls.length) {
        if (a.loop === false) { clearInterval(player.timer); return; } // hold last frame
        i = 0;
      }
      el.body.src = urls[i];
    }, 1000 / (a.fps || 12));
    return;
  }
  const src = ASSET.body[name];
  if (src && el.body.getAttribute('src') !== src) el.body.src = src;
}

/* ================= state ================= */
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function defaultState() {
  const now = Date.now();
  return {
    name: '', hatched: false, age: 0, last: now,
    stats: { hunger: 80, fun: 80, energy: 85, clean: 100 },
    bond: 0, sleeping: false, poops: [], nextPoop: now + rand(2, 4) * 36e5 / SPEED, tails: 1,
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.stats) return Object.assign(defaultState(), s);
  } catch (e) {}
  return defaultState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

let S = load();

const weeks = () => FORCE_WEEK || Math.floor(S.age / (7 * DAY)) + 1;
// tailsOverride: set by hand with the tail buttons on the stage (0 = follow the weeks)
const tailCount = () => S.tailsOverride || clamp(weeks(), 1, 9);
function currentStage() { const t = tailCount(); return STAGES.find(s => t <= s.maxTails); }

/* advance the world by real elapsed time (scaled by SPEED) */
function simulate(now) {
  const realMs = Math.max(0, now - S.last);
  S.last = now;
  if (!S.hatched || realMs === 0) return 0;
  S.age += realMs * SPEED; // growth never caps — the fox keeps aging while you're away
  const h = Math.min(realMs * SPEED / 36e5, MAX_CATCHUP_H);
  const r = S.sleeping ? RATES_SLEEP : RATES_AWAKE;
  for (const k in r) S.stats[k] = clamp(S.stats[k] + r[k] * h);
  S.stats.clean = clamp(S.stats.clean - S.poops.length * 2 * h);
  holdLocks();
  if (!S.sleeping) {
    while (S.nextPoop <= now && S.poops.length < 4) {
      S.poops.push({ id: Math.random().toString(36).slice(2), x: rand(12, 88) });
      S.nextPoop += rand(2, 4) * 36e5 / SPEED;
    }
  }
  if (S.nextPoop <= now) S.nextPoop = now + rand(2, 4) * 36e5 / SPEED;
  if (S.sleeping && S.stats.energy >= 100) { S.sleeping = false; say(t('wokeUp')); setExpr('happy', 2000); }
  return h;
}

/* ================= dom ================= */
const $ = s => document.querySelector(s);
const el = {
  stage: $('#stage'), petWrap: $('#petWrap'), fox: $('#fox'), body: $('#foxBody'), video: $('#foxVideo'), tails: $('#tails'),
  bubble: $('#bubble'), fx: $('#fx'), poops: $('#poops'), name: $('#petName'), tailBadge: $('#tailBadge'),
  age: $('#age'), growBar: $('#growBar'), sleepBtn: $('#sleepBtn'), bowl: $('#bowl'), foodPick: $('#foodPick'), ver: $('#ver'),
};

let expr = null, exprUntil = 0, bubbleTimer = 0, lastPet = 0, renderedTails = -1, renderedStage = '';

function setExpr(name, ms) { expr = name; exprUntil = Date.now() + ms; render(); }

function mood() {
  if (expr && Date.now() < exprUntil) return expr;
  expr = null;
  if (S.sleeping) return 'sleep';
  const { hunger, fun, energy, clean } = S.stats;
  const low = Math.min(hunger, fun, energy, clean);
  if (energy < 20) return 'tired';
  if (low < 20) return 'sad';
  if (low > 65) return 'happy';
  return 'normal';
}

let sayTalk = 0;
function say(text, ms = 2600) {
  el.bubble.textContent = text;
  if (window.Fox2D) { // the 2D fox's mouth moves while its bubble is up
    Fox2D.talk(true);
    clearTimeout(sayTalk);
    sayTalk = setTimeout(() => Fox2D.talk(false), Math.min(ms, 600 + text.length * 120));
  }
  // keep the bubble inside the stage when the fox stands near an edge
  el.bubble.style.setProperty('--bx', '0px');
  const b = el.bubble.getBoundingClientRect(), s = el.stage.getBoundingClientRect(), pad = 8;
  const shift = Math.min(0, s.right - pad - b.right) || Math.max(0, s.left + pad - b.left);
  el.bubble.style.setProperty('--bx', shift + 'px');
  el.bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => el.bubble.classList.remove('show'), ms);
}

function spawnFx(emoji, xPct, yPct, cls = '') {
  const d = document.createElement('div');
  d.className = 'fx ' + cls;
  d.textContent = emoji;
  d.style.left = xPct + '%';
  d.style.top = yPct + '%';
  el.fx.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}
function petPos() {
  const s = el.stage.getBoundingClientRect(), p = el.fox.getBoundingClientRect();
  return { x: ((p.left + p.width / 2 - s.left) / s.width) * 100, y: ((p.top + p.height * 0.35 - s.top) / s.height) * 100 };
}

/* tails: fan behind the body; each tail sways around its root */
function renderTails() {
  const n = tailCount();
  if (n === renderedTails) return;
  if (renderedTails > 0 && n > renderedTails) window.Fox2D?.play('proud'); // a new tail: chest out
  renderedTails = n;
  el.tails.innerHTML = '';
  // baked art draws every tail itself; D01 sprites already draw one
  const extra = ASSET.tailMode === 'baked' ? 0 : ASSET.tailMode === 'd01' ? n - 1 : n;
  el.tails.style.setProperty('--ts', tailScale(n));
  const angles = fanAngles(n).slice(n - extra);
  angles.forEach((a, i) => {
    const t = document.createElement('img');
    t.className = 'tail';
    t.src = ASSET.tails[i % ASSET.tails.length];
    t.draggable = false;
    t.style.setProperty('--a', a + 'deg');
    t.style.setProperty('--x', TAIL_ROOT.x * 100 + '%');
    t.style.setProperty('--y', TAIL_ROOT.y * 100 + '%');
    t.style.setProperty('--d', rand(1.6, 2.4).toFixed(2) + 's');
    t.style.animationDelay = (-rand(0, 2)).toFixed(2) + 's';
    el.tails.appendChild(t);
  });
}
// every 3 tails beyond the first three, all tails shrink 15%: 1–3 → 100%, 4–6 → 85%, 7–9 → 72%
const tailScale = n => Math.pow(0.85, Math.floor((n - 1) / 3));

function fanAngles(n) {
  if (n === 1) return [48];
  const spread = Math.min(124, 17 * (n - 1));
  const start = 18 - spread / 2; // fan centred just right of straight-up
  // draw outer tails first so the centre ones overlap them
  return Array.from({ length: n }, (_, i) => start + (spread * i) / (n - 1)).sort((a, b) => Math.abs(b - 18) - Math.abs(a - 18));
}

// the admin's FF locks: a locked stat stays full (FF, the top value) whatever happens to it
function holdLocks() { for (const k in S.locks || {}) if (S.locks[k]) S.stats[k] = 100; }
function render() {
  holdLocks();
  for (const k in S.stats) {
    const v = S.stats[k];
    const bar = document.querySelector(`.stat[data-k="${k}"] .bar i`);
    bar.style.width = v + '%';
    bar.className = v < 25 ? 'low' : v < 50 ? 'mid' : '';
    document.querySelector(`.ff[data-ff="${k}"]`)?.classList.toggle('on', !!S.locks?.[k]);
  }
  el.name.textContent = S.name || t('foxName');
  const n = tailCount(), wk = weeks();
  el.tailBadge.textContent = t('tails', { n });
  $('#tailN').textContent = n;
  $('#tailCtl').classList.toggle('manual', !!S.tailsOverride);
  const days = Math.floor(S.age / DAY);
  const toNext = 7 - (S.age / DAY) % 7;
  el.age.textContent = `${t('week', { w: wk })} · ` + (n >= 9 ? t('nineDone') : t('nextTail', { t: toNext < 1 ? t('hours', { n: Math.ceil(toNext * 24) }) : t('days', { n: Math.ceil(toNext) }) }));
  el.growBar.style.width = (n >= 9 ? 100 : ((S.age / DAY) % 7) / 7 * 100) + '%';

  const st = currentStage();
  if (st.id !== renderedStage) {
    el.petWrap.classList.remove(...STAGES.map(s => s.id));
    el.petWrap.classList.add(st.id);
    renderedStage = st.id;
  }
  renderTails();

  const m = mood();
  el.fox.classList.remove(...[...el.fox.classList].filter(c => c.startsWith('ex-')));
  el.fox.classList.add('ex-' + m);
  showSprite(EXPR_SPRITE[m] || 'normal');
  if (window.Fox3D) Fox3D.set({ mood: m, tails: n, scale: st.scale });
  if (window.Fox2D) Fox2D.set({ mood: m });

  el.stage.classList.toggle('night', S.sleeping);
  el.sleepBtn.querySelector('em').textContent = S.sleeping ? t('act_wake') : t('act_sleep');
  el.sleepBtn.querySelector('span').textContent = S.sleeping ? '☀️' : '🌙';
  document.querySelectorAll('.actions button:not(#sleepBtn)').forEach(b => (b.disabled = S.sleeping));

  // poops
  const ids = S.poops.map(p => p.id).join();
  if (el.poops.dataset.ids !== ids) {
    el.poops.dataset.ids = ids;
    el.poops.innerHTML = '';
    for (const p of S.poops) {
      const d = document.createElement('div');
      d.className = 'poop';
      d.textContent = '💩';
      d.style.left = p.x + '%';
      d.onclick = e => { e.stopPropagation(); S.poops = S.poops.filter(q => q.id !== p.id); S.stats.clean = clamp(S.stats.clean + 8); spawnFx('✨', p.x, 85); render(); save(); };
      el.poops.appendChild(d);
    }
  }
}

/* ================= actions ================= */
function addBond(n) { S.bond += n; }

/* food bowl: meat or veggies. The fox loves both (the point: veggies are yummy too) and is happiest when it
   gets both on the same day. The bowl is a layer in front of the fox; it shows assets/fox/food/<kind>_<3|2|1>.png
   and empty.png once they are drawn, a simple drawn bowl until then. */
const MEALS = { meat: { hunger: 30 }, veg: { hunger: 28, fun: 2 } };
let eating = false;
const foodArt = {};
function foodImg(name) { // the picture's URL, or null until we know it exists
  if (!(name in foodArt)) {
    foodArt[name] = null;
    const im = new Image();
    im.onload = () => { foodArt[name] = im.src; };
    im.src = `assets/fox/food/${name}.png`;
  }
  return foodArt[name];
}
function bowlSVG(kind, n) {
  const spots = [[50, 38], [36, 41], [64, 41], [43, 33], [57, 33], [29, 45], [71, 45], [50, 28], [50, 45]];
  const colours = kind === 'meat' ? ['#9a5634', '#b8693d', '#8a4a2c'] : ['#3f9b3a', '#f08a24', '#7cc242'];
  const bits = spots.slice(0, n * 3).map(([x, y], k) =>
    `<circle cx="${x}" cy="${y}" r="${kind === 'veg' && k % 3 === 2 ? 4 : 7}" fill="${colours[k % 3]}" stroke="#5a3a26" stroke-width="1.2"/>`);
  return `<svg viewBox="0 0 100 70"><ellipse cx="50" cy="44" rx="40" ry="10" fill="#e9dccb" stroke="#5a3a26" stroke-width="2"/>${bits.join('')}
    <path d="M10 44 Q14 66 50 66 Q86 66 90 44 Z" fill="#fff6ea" stroke="#5a3a26" stroke-width="2"/>
    <circle cx="35" cy="56" r="3" fill="#f3a35b"/><circle cx="50" cy="58" r="3" fill="#f3a35b"/><circle cx="65" cy="56" r="3" fill="#f3a35b"/></svg>`;
}
function showBowl(kind, n) {
  const art = foodImg(n ? `${kind}_${n}` : 'empty');
  el.bowl.innerHTML = art ? `<img src="${art}" alt="">` : bowlSVG(kind, n);
  el.bowl.hidden = false;
  el.bowl.classList.remove('out');
}
const wait = ms => new Promise(r => setTimeout(r, ms));
// just opened: its eating clips may still be on the way — a few seconds' wait for them rather than none
async function eatClips() { for (let k = 0; RENDER === 'anim' && window.Fox2D && !Fox2D.canEat && k < 50; k++) await wait(100); }
// a drink (the feed menu's water): its water bowl in front of it, it laps a while
async function drink() {
  if (eating) return;
  eating = true;
  walkTarget = null;
  userWalkUntil = Date.now() + 20000;
  el.bowl.innerHTML = '<img src="assets/scene/props/water.png" alt="">';
  el.bowl.hidden = false;
  el.bowl.classList.remove('out');
  await eatClips();
  const anim = RENDER === 'anim' && window.Fox2D && Fox2D.canEat;
  if (anim) {
    Fox2D.drink(true);
    await wait(4000 + rand(0, 2000));
    Fox2D.drink(false);
  } else { setExpr('eat', 3000); await wait(3000); }
  S.stats.fun = clamp(S.stats.fun + 2);
  addBond(1);
  save();
  say(pick(t('drinkYum')));
  await wait(1200);
  el.bowl.classList.add('out');
  await wait(300);
  el.bowl.hidden = true;
  eating = false;
}
async function eat(kind) {
  if (eating) return;
  if (S.stats.hunger >= 95) { say(t('full')); setExpr('meh', 1500); return; }
  eating = true;
  walkTarget = null;
  userWalkUntil = Date.now() + 20000;
  showBowl(kind, 3);
  await eatClips();
  const anim = RENDER === 'anim' && window.Fox2D && Fox2D.canEat;
  if (anim) { // lean down to the bowl first
    Fox2D.eat(true);
    for (let k = 0; k < 80 && !Fox2D.state.eating; k++) await wait(100);
  } else setExpr('eat', 4800);
  for (const n of [2, 1, 0]) { // three bites
    await wait(1400);
    showBowl(kind, n);
  }
  const m = MEALS[kind];
  S.stats.hunger = clamp(S.stats.hunger + m.hunger);
  if (m.fun) S.stats.fun = clamp(S.stats.fun + m.fun);
  S.stats.clean = clamp(S.stats.clean - 2);
  addBond(2);
  const day = new Date().toDateString();
  if (!S.meals || S.meals.day !== day) S.meals = { day, meat: 0, veg: 0, both: false };
  S.meals[kind]++;
  if (anim) Fox2D.eat(false);
  const p = petPos();
  if (S.meals.meat && S.meals.veg && !S.meals.both) { // meat and veggies on the same day: a little party
    S.meals.both = true;
    addBond(5);
    if (anim) Fox2D.play('jump_joy');
    say(t('balanced'), 3000);
    for (let k = 0; k < 5; k++) setTimeout(() => spawnFx(pick(['💗', '✨', '🌟']), p.x + rand(-14, 14), p.y), k * 180);
  } else {
    say(pick(t(kind === 'veg' ? 'vegYum' : 'meatYum')));
    if (!S.meals.both && Math.random() < 0.6) setTimeout(() => say(t(kind === 'veg' ? 'wantMeat' : 'wantVeg')), 2600);
  }
  if (Math.random() < 0.3) S.nextPoop = Math.min(S.nextPoop, Date.now() + rand(20, 40) * 6e4 / SPEED);
  save();
  await wait(1200);
  el.bowl.classList.add('out');
  await wait(300);
  el.bowl.hidden = true;
  eating = false;
}

const actions = {
  feed() {
    if (RENDER === 'anim') { el.foodPick.hidden = !el.foodPick.hidden; return; } // meat, veggies or water? (eat: too full)
    if (S.stats.hunger >= 95) { say(t('full')); setExpr('meh', 1500); return; }
    const f = pick(FOODS);
    const p = petPos();
    spawnFx(f.e, p.x, p.y + 8, 'drop');
    setTimeout(() => {
      S.stats.hunger = clamp(S.stats.hunger + f.hunger);
      if (f.fun) S.stats.fun = clamp(S.stats.fun + f.fun);
      S.stats.clean = clamp(S.stats.clean - 2);
      addBond(2);
      setExpr('eat', 1800);
      say(pick(t('yum')));
      if (Math.random() < 0.3) S.nextPoop = Math.min(S.nextPoop, Date.now() + rand(20, 40) * 6e4 / SPEED);
      save();
    }, 650);
  },
  play() {
    if (RENDER === 'anim' && window.Ball) return; // 2D: the ball lives in this button (ball.js takes it out / in)
    if (S.stats.energy < 15) { say(t('tooTired')); setExpr('tired', 1800); return; }
    S.stats.fun = clamp(S.stats.fun + 20);
    S.stats.energy = clamp(S.stats.energy - 10);
    S.stats.hunger = clamp(S.stats.hunger - 5);
    addBond(3);
    setExpr('play', 1800);
    const p = petPos();
    for (let i = 0; i < 4; i++) setTimeout(() => spawnFx(pick(['⭐', '⚽', '🎵']), p.x + rand(-20, 20), p.y), i * 200);
    say(pick(t('playLines')));
    save();
  },
  clean() {
    S.poops = [];
    S.stats.clean = 100;
    addBond(1);
    setExpr('love', 1600);
    window.Fox2D?.play('shake_dry'); // all clean: a good shake
    for (let i = 0; i < 8; i++) setTimeout(() => spawnFx('🫧', rand(15, 85), rand(45, 85)), i * 90);
    say(t('cleanDone'));
    save();
  },
  sleep() {
    if (S.sleeping) {
      S.sleeping = false;
      say(S.stats.energy < 50 ? t('stillSleepy') : t('morning'));
      window.Fox2D?.play('wave');
      setExpr(S.stats.energy < 50 ? 'tired' : 'happy', 1500);
    } else {
      if (S.stats.energy > 80) { say(t('notSleepy')); setExpr('play', 1500); return; }
      S.sleeping = true;
      say(t('goodnight'));
      walk2d(BED.x, BED.z + 0.02); // off to its bed first (2D fox), then it dozes off and curls up
    }
    save();
    render();
  },
};

function onPetTap() {
  if (rubbed) { rubbed = false; return; } // the finger was rubbing, not tapping
  if (S.sleeping) { say(t('dontWake')); return; }
  const now = Date.now();
  if (now - lastPet < 600) return;
  lastPet = now;
  S.stats.fun = clamp(S.stats.fun + 3);
  addBond(1);
  const p = petPos();
  spawnFx(pick(['💗', '💕', '✨']), p.x + rand(-10, 10), p.y);
  // 2D fox: each tap plays another idle action
  if (RENDER === 'anim' && window.Fox2D) { if (!eating) Fox2D.poke(); if (Math.random() < 0.3) say(pick(t('petLines'))); save(); return; }
  // curious & playful personality: not always the same reaction
  const r = Math.random();
  if (r < 0.15) { setExpr('surprised', 1200); say(t('huh')); }
  else if (r < 0.3) { setExpr('curious', 1400); say(t('what')); }
  else { setExpr('love', 1300); if (Math.random() < 0.4) say(pick(t('petLines'))); }
  save();
}

/* 2D fox: keep a finger on it and rub round and round → it's petted (eyes closed, head rubbing) for as long
   as the finger keeps moving; a plain tap stays a tap */
let rubbed = false;
function bindRub() {
  if (RENDER !== 'anim') return;
  let down = null, path = 0, lastMove = 0, rubbing = false, timer = 0, fxAt = 0;
  const end = () => {
    down = null;
    clearInterval(timer);
    if (rubbing) { rubbing = false; Fox2D.rub(false); Fox2D.nudge(); save(); }
  };
  el.fox.addEventListener('pointerdown', e => {
    if (!window.Fox2D || S.sleeping) return;
    down = { x: e.clientX, y: e.clientY };
    path = 0;
    lastMove = Date.now();
    el.fox.setPointerCapture(e.pointerId);
    clearInterval(timer);
    timer = setInterval(() => { if (rubbing && Date.now() - lastMove > 500) end(); }, 100); // finger stopped
  });
  el.fox.addEventListener('pointermove', e => {
    if (!down) return;
    path += Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = { x: e.clientX, y: e.clientY };
    lastMove = Date.now();
    if (!rubbing && path > 60) { rubbing = rubbed = true; Fox2D.rub(true); userWalkUntil = Date.now() + 8000; }
    if (rubbing) { // the head sways round with the finger
      const r = el.fox.getBoundingClientRect(), hx = r.left + r.width / 2, hy = r.top + r.height * 0.35;
      const k = v => Math.max(-1, Math.min(1, v / (r.width * 0.2)));
      Fox2D.nudge(k(e.clientX - hx), k(e.clientY - hy));
    }
    if (rubbing && Date.now() - fxAt > 900) { // hearts and a little bond while it lasts
      fxAt = Date.now();
      const p = petPos();
      spawnFx(pick(['💗', '💕']), p.x + rand(-8, 8), p.y - 4);
      S.stats.fun = clamp(S.stats.fun + 1);
      addBond(1);
    }
  });
  el.fox.addEventListener('pointerup', end);
  el.fox.addEventListener('pointercancel', end);
}

/* ================= behaviour loop ================= */
function wander() {
  if (!S.hatched || S.sleeping || expr || Date.now() < userWalkUntil || window.Ball?.busy) return;
  if (window.Fox2D && S.stats.hunger < 30 && Math.random() < 0.35) { Fox2D.play('hungry'); return; } // paws on its tummy
  const cur = parseFloat(el.petWrap.style.left) || 50;
  const next = clamp(cur + rand(-35, 35), 22, 78);
  if (Math.abs(next - cur) < 6) return;
  if (walk2d(next, Math.random() * 0.6) || RENDER === 'anim') return; // (2D fox: it only ever moves walking)
  el.fox.classList.toggle('flip', next < cur);
  el.petWrap.classList.add('walking');
  el.petWrap.style.left = next + '%';
  setTimeout(() => el.petWrap.classList.remove('walking'), 2600);
}

/* walk where the child points: tap the ground, or keep the finger down and the fox follows it */
let userWalkUntil = 0, walkTimer = 0;
function walkTo(pct, follow, z) {
  const cur = parseFloat(el.petWrap.style.left) || 50;
  const next = clamp(pct, 15, 85);
  if (Math.abs(next - cur) < 1.5 && (z == null || Math.abs(z - foxZ) < 0.05)) return;
  userWalkUntil = Date.now() + 8000; // don't wander off right after being led somewhere
  if (walk2d(next, z ?? foxZ) || RENDER === 'anim') return; // (2D fox: no sliding while its walk isn't in yet)
  const secs = follow ? 0.5 : Math.max(0.5, Math.abs(next - cur) / 22);
  el.fox.classList.toggle('flip', next < cur);
  el.petWrap.style.transitionDuration = secs + 's';
  el.petWrap.classList.add('walking');
  el.petWrap.style.left = next + '%';
  clearTimeout(walkTimer);
  walkTimer = setTimeout(() => { el.petWrap.classList.remove('walking'); el.petWrap.style.transitionDuration = ''; }, secs * 1000 + (follow ? 150 : 0));
}

/* 2D fox: it stands up, turns and walks in its own clips (fox2d.js), so the room position moves here, step by
   step, and only while a walk loop is playing — not while it gets up, turns round or sits down */
const WALK_SPEED = 16; // % of the room per second
const RUN_FASTER = 2.2;  // running after the ball (walk[_r]_loop_run)
let walkTarget = null, walkClock = 0;
/* depth (2.5D, scene.js): the ground runs from the front edge (z 0) back towards the trees (z 1). Farther
   is higher on the stage and smaller; things nearer are drawn over things farther away. */
const DEPTH = { near: 8, far: 30, shrink: 0.4, across: 30 }; // bottom % at z 0 / z 1, size lost at z 1, z 1 ≈ 30 % of width
const groundAt = z => DEPTH.near + (DEPTH.far - DEPTH.near) * z;  // bottom % of the stage
const sizeAt = z => 1 - DEPTH.shrink * z;
const layerAt = z => 10 + Math.round((1 - z) * 80);                // z-index
const zFromY = y => { const r = el.stage.getBoundingClientRect(); return clamp(((r.bottom - y) / r.height * 100 - DEPTH.near) / (DEPTH.far - DEPTH.near) * 100) / 100; };
let foxX = 50, foxZ = 0;
const BED = { x: 20, z: 0.5 }; // its cushion in the scene (scene.js draws it here): it goes there to sleep
// things on the ground the fox and the ball meet (scene.js draws them; x %, z, and their half size on the ground
// rx %, rz): a soft one is walked over and gives under a weight (the bed); a solid one, h % high, would be
// walked round and bounce the ball off it
const THINGS = [
  { name: 'bed', x: BED.x, z: BED.z + 0.04, rx: 13, rz: 0.08, soft: true },
];
const within = (t, x, z, mx = 0, mz = 0) => ((x - t.x) / (t.rx + mx)) ** 2 + ((z - t.z) / (t.rz + mz)) ** 2 < 1;
const pressed = { fox: 0, ball: 0 }; // how far each sinks into a soft thing now (% of the stage height; scene.js)
const sinkAt = (x, z, k = 1) => { // standing on a soft thing: sinks in, most in the middle
  const t = THINGS.find(t => t.soft && within(t, x, z));
  return t ? 1.6 * k * (1 - Math.hypot((x - t.x) / t.rx, (z - t.z) / t.rz)) : 0;
};
function placeFox() {
  el.petWrap.style.left = foxX + '%';
  if (RENDER !== 'anim') return;
  pressed.fox = sinkAt(foxX, foxZ);
  el.petWrap.style.bottom = groundAt(foxZ) - pressed.fox + '%';
  el.petWrap.style.transform = `translateX(-50%) scale(${sizeAt(foxZ)})`;
  el.petWrap.style.zIndex = layerAt(foxZ);
}

/* 2D fox: it stands up, turns and walks in its own clips (fox2d.js), so the room position moves here, step by
   step, and only while a walk loop is playing — not while it gets up, turns round or sits down. It walks
   side-on even when it goes deeper or nearer (it slants across the ground and shrinks / grows). */
function walk2d(x, z = foxZ, then, keep) { // keep: on arrival stay standing, don't sit (then queues what's next)
  if (RENDER !== 'anim' || !window.Fox2D || !Fox2D.canWalk) return false;
  if (eating) return true; // stays at its bowl
  z = clamp(z * 100) / 100;
  for (const t of THINGS) if (!t.soft && within(t, x, z, 1, 0.01)) z = t.z + (z < t.z ? -1 : 1) * (t.rz + 0.06); // not on it: by it
  walkTarget = { x, z, then, keep, via: roundThings(x, z) };
  el.petWrap.style.transition = 'none';
  if (!walkClock) walkClock = setInterval(walkStep, 50);
  walkStep();
  return true;
}
// the way there going round the solid things on the ground: for each one in the way, one or two points around it
// (in front, behind, at its sides or corners) — the shortest way with no leg through it
function roundThings(x, z, fx = foxX, fz = foxZ) {
  const clear = (t, a, b) => { // (from close by it: only through it counts)
    const [mx, mz] = within(t, a.x, a.z, 4, 0.05) || within(t, b.x, b.z, 4, 0.05) ? [0.5, 0.01] : [4, 0.05];
    for (let k = 1; k < 20; k++) if (within(t, a.x + (b.x - a.x) * k / 20, a.z + (b.z - a.z) * k / 20, mx, mz)) return false;
    return true;
  };
  const len = pts => pts.slice(1).reduce((n, p, k) => n + Math.hypot(p.x - pts[k].x, (p.z - pts[k].z) * DEPTH.across), 0);
  const via = [], to = { x, z };
  let from = { x: fx, z: fz };
  for (const t of THINGS) {
    if (t.soft || clear(t, from, to)) continue;
    const C = [];
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) if (i || j) C.push({ x: t.x + i * (t.rx + 5), z: clamp((t.z + j * (t.rz + 0.09)) * 100) / 100 });
    const ways = [...C.map(p => [p]), ...C.flatMap(p => C.filter(q => q !== p).map(q => [p, q]))]
      .filter(w => [from, ...w, to].every((p, k, all) => !k || clear(t, all[k - 1], p)))
      .sort((a, b) => len([from, ...a, to]) - len([from, ...b, to]));
    if (!ways.length) continue;
    via.push(...ways[0]);
    from = ways[0][ways[0].length - 1];
  }
  return via;
}
// It never steps on the spot: a walk loop can only be left at its end (the one picture its ways out start on),
// so the fox stops as its last stride begins — that stride carries it the rest of the way (slower, when the way
// is short) — and a stride under way when it is called off plays out moving on.
let walkDir = null; // the last step (x %, z) while walking
function walkStep() {
  const st = Fox2D.state;
  const move = (x, z) => { foxX += x; foxZ += z; walkDir = { x, z }; placeFox(); };
  if (walkTarget == null || walkTarget.last) {
    if (st.stride && walkDir) {
      const w = walkTarget; // on its last stride: just onto the spot; called off: on as it was going
      // never more in a step than a stride takes it (a step short rather than a slide)
      const cap = WALK_SPEED * (st.running ? RUN_FASTER : 1) * 0.05 * sizeAt(foxZ);
      if (w) {
        const dx = w.x - foxX, dz = w.z - foxZ, n = Math.max(1, st.strideLeft * 1.25);
        const k = Math.min(1, cap / (Math.hypot(dx / n, (dz / n) * DEPTH.across) || 1));
        move((dx / n) * k, (dz / n) * k);
      } else move(walkDir.x, walkDir.z);
      return;
    }
    walkTarget = walkDir = null;
    clearInterval(walkClock);
    walkClock = 0;
    return;
  }
  const goal = walkTarget.via?.[0] || walkTarget;
  let dx = goal.x - foxX, dz = (goal.z - foxZ) * DEPTH.across, dist = Math.hypot(dx, dz);
  if (goal !== walkTarget && dist < 2) { walkTarget.via.shift(); return walkStep(); } // round it: on to the next
  const speed = WALK_SPEED * (Fox2D.state.running ? RUN_FASTER : 1);
  const step = Math.min(dist, speed * 0.05 * sizeAt(foxZ)); // farther away it looks slower
  const arrive = () => {
    const { then, keep } = walkTarget;
    walkTarget.last = true;
    if (!keep) Fox2D.stop();
    if (then) then();
  };
  const final = goal === walkTarget;
  if (final && dist < 0.4) { arrive(); return walkStep(); }
  // facing: mostly deeper / nearer → its back / its front (when those clips are there), else side-on by the
  // sideways part; a short way straight in or out keeps the way it faces
  const deep = Math.abs(dz) > Math.abs(dx) * 1.5 && Math.abs(dz) > 3 && Fox2D.canWalkDepth;
  const facing = deep ? (dz > 0 ? 'walk_back' : 'walk_front')
    : Math.abs(dx) > 1 ? (dx < 0 ? 'walk' : 'walk_r') : st.go || (dx < 0 ? 'walk' : 'walk_r');
  Fox2D.go(facing);
  if (!Fox2D.state.walking) return;
  // the spot is within this stride (16 frames a second, a step every 50 ms): stop now, the stride ends there
  if (final && dist <= step * Fox2D.state.strideLeft * 1.25) { arrive(); return; }
  move((dx / dist) * step, (dz / dist) * step / DEPTH.across);
}

function bindWalk() {
  let leading = false;
  const pct = e => { const r = el.stage.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * 100; };
  el.stage.addEventListener('pointerdown', e => {
    if (!S.hatched || S.sleeping || e.target.closest('#petWrap, .poop, button, #tailCtl, .toy')) return;
    leading = true;
    el.stage.setPointerCapture(e.pointerId);
    walkTo(pct(e), false, zFromY(e.clientY));
  });
  el.stage.addEventListener('pointermove', e => { if (leading) walkTo(pct(e), true, zFromY(e.clientY)); });
  const stop = () => { leading = false; };
  el.stage.addEventListener('pointerup', stop);
  el.stage.addEventListener('pointercancel', stop);
}

function setTailsByHand(d) {
  S.tailsOverride = d === 0 ? 0 : clamp(tailCount() + d, 1, 9);
  S.tails = tailCount();
  save();
  loadAssets().then(render);
}

function chatter() {
  if (!S.hatched || inbox.busy || el.bubble.classList.contains('show')) return;
  if (S.sleeping) { const p = petPos(); spawnFx('Z', p.x + 8, p.y, 'zzz'); return; }
  const { hunger, fun, energy, clean } = S.stats;
  const needs = [
    [hunger, t('hungry')], [fun, t('bored')], [energy, t('sleepy')], [clean, t('dirty')],
  ].sort((a, b) => a[0] - b[0]);
  if (needs[0][0] < 35) say(needs[0][1]);
  else if (Math.random() < 0.35) {
    setExpr('curious', 1500);
    say(pick(t('idle')));
  }
}

function tick() {
  const before = S.tails;
  simulate(Date.now());
  const now = tailCount();
  S.tails = now;
  if (now > before) celebrateTail(now);
  if (now !== before) loadAssets().then(render); // each tail count has its own whole-fox art
  render();
}

function celebrateTail(n) {
  const p = petPos();
  setExpr('happy', 2500);
  say(n === 9 ? t('nineTails') : t('newTail', { n }), 3500);
  for (let i = 0; i < 10; i++) setTimeout(() => spawnFx(pick(['✨', '🌟', '🦊']), p.x + rand(-25, 25), p.y + rand(-5, 20)), i * 120);
}

/* ================= parent link (prototype backend: server.py) =================
   The parent page schedules speech and sends gifts; the child page polls its inbox. */
const FAMILY = (params.get('family') || localStorage.getItem('ipet-family') || 'demo').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'demo';
try { localStorage.setItem('ipet-family', FAMILY); } catch (e) {}
const inbox = { queue: [], busy: false, unlocked: false, since: Number(localStorage.getItem('ipet-inbox-since')) || 0 };
let talkTimer = 0;

async function pollInbox() {
  if (!S.hatched) return;
  try {
    const r = await fetch(`api/inbox?family=${FAMILY}&since=${inbox.since}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { now, events } = await r.json();
    if (!inbox.since) inbox.since = now; // first run: don't replay history
    else for (const e of events) { inbox.queue.push(e); inbox.since = Math.max(inbox.since, e.at); }
    try { localStorage.setItem('ipet-inbox-since', inbox.since); } catch (e) {}
    processInbox();
  } catch (e) {} // offline / no server: the pet still works on its own
}

async function processInbox() {
  if (inbox.busy || !inbox.queue.length) return;
  const ev = inbox.queue[0];
  if (ev.type === 'speech' && !inbox.unlocked) {
    // iOS won't play sound without a tap first
    say(t('msgWaiting'), 600000);
    setExpr('happy', 2000);
    return;
  }
  inbox.queue.shift();
  inbox.busy = true;
  if (ev.type === 'gift') await receiveGift(ev);
  else await speak(ev);
  inbox.busy = false;
  setTimeout(processInbox, 600);
}

function receiveGift(ev) {
  const f = FOODS.find(x => x.e === ev.item) || { e: ev.item, hunger: 20 };
  const p = petPos();
  spawnFx(f.e, p.x, p.y + 8, 'drop');
  return new Promise(res => setTimeout(() => {
    S.stats.hunger = clamp(S.stats.hunger + f.hunger);
    if (f.fun) S.stats.fun = clamp(S.stats.fun + f.fun);
    addBond(3);
    setExpr('eat', 1800);
    say(t('giftFrom', { from: ev.from || t('parents'), e: f.e }), 3000);
    window.Fox2D?.play('delight'); // a present! paws on its cheeks
    save();
    setTimeout(res, 2200);
  }, 650));
}

async function speak(ev) {
  say(ev.text || t('whisper'), 600000);
  let open = false;
  el.fox.classList.add('talking');
  talkTimer = setInterval(() => { open = !open; setExpr(open ? 'talkA' : 'talkB', 60000); }, 170);
  await PetVoice.play(ev);
  clearInterval(talkTimer);
  el.fox.classList.remove('talking');
  setExpr('happy', 1500);
  say(ev.text || t('whisper'), 2500);
  addBond(2);
}

function unlockAudio() {
  if (inbox.unlocked) return;
  PetVoice.unlock();
  inbox.unlocked = true;
  setTimeout(processInbox, 300);
}

/* ================= boot ================= */
function hatch() {
  const name = $('#nameInput').value.trim() || t('foxName');
  const egg = $('#egg');
  egg.classList.add('cracking');
  setTimeout(() => {
    egg.classList.remove('cracking');
    egg.classList.add('hatched');
    setTimeout(() => {
      Object.assign(S, defaultState(), { name, hatched: true, last: Date.now() });
      save();
      $('#intro').classList.add('hidden');
      render();
      say(t('hello', { name }), 3000);
      window.Fox2D?.play('wave');
      setExpr('happy', 2500);
    }, 450);
  }, 1200);
}

function bind() {
  document.querySelectorAll('.actions button').forEach(b => b.addEventListener('click', () => { actions[b.dataset.act](); render(); }));
  el.fox.addEventListener('click', onPetTap);
  el.foodPick.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    el.foodPick.hidden = true;
    if (b.dataset.food === 'water') drink(); else eat(b.dataset.food);
  }));
  bindRub();
  bindWalk();
  document.querySelectorAll('#tailCtl button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setTailsByHand(+b.dataset.d); }));
  $('#hatchBtn').addEventListener('click', hatch);
  $('#nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') hatch(); });
  $('#menuBtn').addEventListener('click', () => $('#menu').classList.remove('hidden'));
  $('#closeMenu').addEventListener('click', () => $('#menu').classList.add('hidden'));
  // admin mode (from the menu, or ?admin=1; remembered on this device): the FF lock by each stat
  const admin = on => { document.body.classList.toggle('admin', on); try { localStorage.setItem('ipet-admin', on ? '1' : ''); } catch (e) {} };
  let isAdmin = new URLSearchParams(location.search).has('admin');
  try { isAdmin = isAdmin || localStorage.getItem('ipet-admin') === '1'; } catch (e) {}
  admin(isAdmin);
  $('#adminBtn').addEventListener('click', () => admin(!document.body.classList.contains('admin')));
  document.querySelectorAll('.ff').forEach(b => b.addEventListener('click', () => {
    S.locks = { ...S.locks, [b.dataset.ff]: !S.locks?.[b.dataset.ff] };
    render(); save();
  }));
  $('#renameBtn').addEventListener('click', () => {
    const n = prompt(t('renamePrompt'), S.name);
    if (n && n.trim()) { S.name = n.trim().slice(0, 10); save(); render(); }
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm(t('resetConfirm'))) return;
    localStorage.removeItem(KEY);
    location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { simulate(Date.now()); save(); return; }
    const away = (Date.now() - S.last) * SPEED;
    tick();
    if (S.hatched && away > 30 * 6e4) say(away > 36e5 ? t('awayHours', { n: Math.round(away / 36e5) }) : t('back'));
  });
}

(async function boot() {
  bind();
  if (RENDER === 'anim') {
    el.fox.classList.add('anim2d');
    el.petWrap.style.transition = 'none'; // it moves only by walking (walk2d), never by a CSS slide
    placeFox();
    const js = document.createElement('script');
    js.src = 'fox2d.js?v=' + el.ver?.textContent.slice(1); // the version, as on index.html's scripts
    js.onload = () => Fox2D.ready.then(() => { if (S.hatched && !S.sleeping) Fox2D.play('wave'); }); // hello when the app opens
    document.head.appendChild(js);
  }
  if (RENDER_3D) {
    el.fox.classList.add('three');
    el.petWrap.classList.add('r3d');
    const js = document.createElement('script');
    js.type = 'module';
    js.src = 'fox3d.js';
    document.head.appendChild(js);
  }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  $('#familyCode').textContent = FAMILY;
  I18N.apply();
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { I18N.set(b.dataset.lang); render(); }));
  await loadAssets();
  if (!S.hatched) $('#intro').classList.remove('hidden');
  simulate(Date.now());
  S.tails = tailCount();
  render();
  setInterval(tick, 1000);
  setInterval(save, 5000);
  setInterval(wander, 4500);
  setInterval(chatter, 14000);
  setInterval(pollInbox, 4000);
  pollInbox();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

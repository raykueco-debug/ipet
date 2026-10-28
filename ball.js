/* A ball to throw. Drag it and let go: it flies on the 2.5D ground (left/right, depth and height), bounces,
   rolls and stops — always settling the same way up, so the fox's pick-up always meets the same picture.
   The fox fetches it, brings it back (it doesn't hand it over), plays with it a while, leaves it aside and asks
   for the toys to be put away: only dropping the ball in the basket puts it back home.

   World: x in % of the stage width, z = depth 0 (front) … 1 (back), h = height above the ground in % of the
   stage height (app.js: groundAt / sizeAt / layerAt). Art: assets/scene/toys/ball.png and basket.png once
   drawn, simple drawn ones until then. Needs the 2D fox (fox2d.js) for the fetching. */
(function () {
  const G = 300, BOUNCE = 0.5, ROLL = 2.4, AIR = 0.15;   // gravity %/s², energy kept per bounce, friction /s
  const SIZE = 0.14;                                       // ball width as a share of the stage width, at z 0
  const BASKET = { x: 86, z: 0.04 };                       // where the basket stands
  const MOUTH = { x: 0.49, y: 0.52 };                      // ball in the mouth: point in the fox picture (walk pose)
  const stage = document.getElementById('stage');

  const art = (name, drawn) => {
    const d = document.createElement('div');
    d.className = 'toy toy-' + name;
    d.innerHTML = drawn;
    const im = new Image();
    im.onload = () => { d.innerHTML = ''; d.appendChild(im); };
    im.src = `assets/scene/toys/${name}.png`;
    stage.appendChild(d);
    return d;
  };
  const OUT = '#4a3a2a';
  const ballEl = art('ball', `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#ff6b5b" stroke="${OUT}" stroke-width="5"/>
    <path d="M6 50 Q50 30 94 50 Q50 70 6 50Z" fill="#fff6e8" stroke="${OUT}" stroke-width="4"/>
    <path d="M50 38 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1Z" fill="#ffd84d"/>
    <circle cx="32" cy="26" r="7" fill="#ffffff" opacity=".7"/></svg>`);
  const shadowEl = document.createElement('div');
  shadowEl.className = 'toy-shadow';
  stage.appendChild(shadowEl);
  const basketEl = art('basket', `<svg viewBox="0 0 120 80"><ellipse cx="60" cy="22" rx="54" ry="13" fill="#7a5233" stroke="${OUT}" stroke-width="4"/>
    <path d="M6 22 L16 70 Q60 82 104 70 L114 22 Q60 38 6 22Z" fill="#c98d55" stroke="${OUT}" stroke-width="4"/>
    <path d="M14 44 Q60 58 106 44 M18 60 Q60 72 102 60" fill="none" stroke="#9a6a3c" stroke-width="4"/></svg>`);

  const b = { x: BASKET.x, z: BASKET.z, h: 0, vx: 0, vz: 0, vh: 0, spin: 0, mode: 'home' };
  let fetchRun = 0; // bumps when a fetch is called off (the ball was grabbed)
  let busy = false;  // fetching / playing: the fox doesn't wander off meanwhile

  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  function place(elm, x, z, h, w) {
    elm.style.left = x + '%';
    elm.style.bottom = groundAt(z) + h + '%';
    elm.style.width = w + 'px';
    elm.style.zIndex = layerAt(z) + 1;
  }
  function render() {
    const w = W() * SIZE * sizeAt(b.z);
    if (b.mode === 'mouth') { // in the fox's mouth: a point of its picture
      const r = document.getElementById('fox').getBoundingClientRect(), s = stage.getBoundingClientRect();
      const bw = r.width * 0.3;
      ballEl.style.left = ((r.left + r.width * MOUTH.x - s.left) / s.width) * 100 + '%';
      ballEl.style.bottom = ((s.bottom - (r.top + r.height * MOUTH.y) - bw * 0.35) / s.height) * 100 + '%';
      ballEl.style.width = bw + 'px';
      ballEl.style.zIndex = layerAt(foxZ) + 2;
      ballEl.style.transform = 'translateX(-50%)';
      shadowEl.style.opacity = 0;
      return;
    }
    const home = b.mode === 'home';
    place(ballEl, b.x, b.z, home ? 3.5 : b.h, w * (home ? 0.8 : 1));
    if (home) ballEl.style.zIndex = layerAt(BASKET.z); // sits in the basket, behind its front rim
    ballEl.style.transform = `translateX(-50%) rotate(${b.spin}deg)`;
    place(shadowEl, b.x, b.z, 0, w * Math.max(0.4, 1 - b.h / 30));
    shadowEl.style.zIndex = layerAt(b.z);
    shadowEl.style.opacity = home ? 0 : 0.25 * Math.max(0.3, 1 - b.h / 40);
  }
  place(basketEl, BASKET.x, BASKET.z, -1, W() * 0.2);
  addEventListener('resize', () => place(basketEl, BASKET.x, BASKET.z, -1, W() * 0.2));

  // physics: in the air under gravity, bouncing; on the ground rolling to a stop, then the same way up
  let last = performance.now();
  function step() {
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (b.mode === 'free') {
      b.vh -= G * dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
      if (b.h <= 0) {
        b.h = 0;
        b.vh = Math.abs(b.vh) > 25 ? -b.vh * BOUNCE : 0;
        const k = Math.exp(-ROLL * dt);
        if (!b.vh) { b.vx *= k; b.vz *= k; }
      } else { const k = Math.exp(-AIR * dt); b.vx *= k; b.vz *= k; }
      if (b.x < 6 || b.x > 94) { b.x = Math.max(6, Math.min(94, b.x)); b.vx *= -0.6; }
      if (b.z < 0 || b.z > 1) { b.z = Math.max(0, Math.min(1, b.z)); b.vz *= -0.6; }
      b.spin += (b.vx * 9 - b.vz * 120) * dt;
      if (!b.h && !b.vh && Math.hypot(b.vx, b.vz * 30) < 1.5) settle();
    }
    render();
  }
  setInterval(step, 1000 / 60); // a fixed clock, like fox2d.js (rAF stops while the page is hidden)

  function settle() { // stopped: turn the same way up (every throw ends on one picture) and tell the fox
    b.mode = 'rest';
    b.vx = b.vz = b.vh = 0;
    b.spin = 0;
    ballEl.style.transition = 'transform .25s ease-out';
    setTimeout(() => (ballEl.style.transition = ''), 260);
    if (b.after) { const f = b.after; b.after = null; f(); }
  }

  // grab and throw: the finger's speed when it lets go is the throw; upwards on the screen = deeper
  let drag = null;
  ballEl.addEventListener('pointerdown', e => {
    if (b.mode === 'mouth' || !window.Fox2D) return;
    e.stopPropagation();
    try { ballEl.setPointerCapture(e.pointerId); } catch (err) {} // (no capture for a synthetic pointer)
    callOff();
    b.mode = 'held';
    drag = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    hold(e);
  });
  ballEl.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (drag.length > 8) drag.shift();
    hold(e);
  });
  function hold(e) { // follow the finger, at the depth it was at
    const s = stage.getBoundingClientRect();
    b.x = Math.max(4, Math.min(96, ((e.clientX - s.left) / s.width) * 100));
    b.h = Math.max(0, ((s.bottom - e.clientY) / s.height) * 100 - groundAt(b.z) - 4);
    b.spin = 0;
  }
  const letGo = e => {
    if (!drag) return;
    const s = stage.getBoundingClientRect(), a = drag[0], z = drag[drag.length - 1], dt = Math.max(0.016, (z.t - a.t) / 1000);
    const vx = ((z.x - a.x) / s.width) * 100 / dt, vy = ((a.y - z.y) / s.height) * 100 / dt; // %/s, up = +
    drag = null;
    if (overBasket(z.x, z.y)) return putAway();
    b.mode = 'free';
    b.vx = Math.max(-160, Math.min(160, vx * 0.7));
    b.vz = Math.max(-0.8, Math.min(2.2, vy * 0.012));
    b.vh = Math.max(0, Math.min(160, vy * 0.6));
    b.after = Math.hypot(vx, vy) > 40 ? fetch : null; // a real throw: the fox goes for it
  };
  ballEl.addEventListener('pointerup', letGo);
  ballEl.addEventListener('pointercancel', letGo);

  function overBasket(x, y) { // let go over the basket (on the screen, a little generous) = put away
    const r = basketEl.getBoundingClientRect(), m = r.width * 0.3;
    return x > r.left - m && x < r.right + m && y > r.top - m * 2 && y < r.bottom + m;
  }
  function putAway() {
    const wasOut = b.mode !== 'home';
    b.mode = 'home';
    b.x = BASKET.x; b.z = BASKET.z; b.h = 0; b.spin = 0;
    basketEl.classList.remove('ask');
    clearInterval(remind);
    if (wasOut && asked) {
      asked = false;
      say(t('tidyThanks'), 2600);
      addBond(2);
      const p = petPos();
      for (let k = 0; k < 3; k++) setTimeout(() => spawnFx(pick(['💗', '✨']), p.x + rand(-10, 10), p.y), k * 200);
      save();
    }
  }

  // the fox's part
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let asked = false, remind = 0;
  function callOff() { // the ball was grabbed: whatever the fox was doing with it, stop
    fetchRun++;
    busy = false;
    if (walkTarget) { walkTarget = null; Fox2D.stop(); }
    if (b.mode === 'mouth') b.mode = 'rest';
  }
  const sat = () => Fox2D.state.clip === 'normal_loop';
  async function untilSat(run) { for (let k = 0; k < 60 && !sat(); k++) { await wait(100); if (run !== fetchRun) return false; } return run === fetchRun; }
  const walkThere = (x, z, run) => new Promise(ok => { if (!walk2d(x, z, () => ok(run === fetchRun))) ok(false); });

  async function fetch() {
    const run = ++fetchRun;
    busy = true;
    try { await fetchAndPlay(run); } finally { if (run === fetchRun) busy = false; }
  }
  async function fetchAndPlay(run) {
    if (!S.hatched || S.sleeping || !Fox2D.canWalk) return;
    while (eating) { await wait(500); if (run !== fetchRun) return; }
    // go to the ball: stand right behind it, so it is under the fox's mouth
    if (!(await walkThere(b.x, Math.min(1, b.z + 0.04), run))) return;
    b.mode = 'mouth'; // (a pick-up clip goes here once it is made)
    // carry it back to the middle — not to the player — and sit
    if (!(await walkThere(50 + rand(-12, 12), 0.2 + Math.random() * 0.15, run))) return;
    if (!(await untilSat(run))) return;
    b.mode = 'free';
    b.x = foxX; b.z = Math.max(0, foxZ - 0.06); b.h = 4; b.vx = rand(-6, 6); b.vz = -0.05; b.vh = 10;
    await wait(1200);
    // play with it a bit
    for (let k = 0, n = 3 + Math.floor(Math.random() * 3); k < n; k++) {
      if (run !== fetchRun) return;
      setExpr('play', 1300);
      const toFox = foxX - b.x;
      b.mode = 'free';
      b.vx = Math.abs(toFox) > 12 ? Math.sign(toFox) * 30 : rand(-35, 35);
      b.vz = rand(-0.15, 0.15); b.vh = rand(20, 45);
      await wait(1500 + Math.random() * 800);
    }
    if (run !== fetchRun) return;
    // done: push it aside and ask for the toys to be put away
    b.mode = 'free';
    b.vx = (b.x < 50 ? -1 : 1) * rand(40, 60); b.vz = rand(-0.2, 0.1); b.vh = 15;
    await wait(1800);
    if (run !== fetchRun || b.mode === 'home') return;
    asked = true;
    say(t('tidyAsk'), 3200);
    basketEl.classList.add('ask');
    clearInterval(remind);
    remind = setInterval(() => { if (b.mode !== 'home' && b.mode !== 'held' && !S.sleeping) say(t('tidyAsk'), 3000); }, 45000);
  }

  window.Ball = { get state() { return { ...b }; }, get busy() { return busy; }, putAway };
})();

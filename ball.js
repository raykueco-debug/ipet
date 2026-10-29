/* A ball to throw. Drag it and let go: it flies on the 2.5D ground (left/right, depth and height), bounces,
   rolls and slows to a stop on its own (a football: it looks the same whichever way up it stops).
   The ball is too big to carry: the fox goes to it and plays — nudges it about with its nose, now and then bats
   it with a paw — then sits by it and asks for the toys to be put away. It never brings it back: only the
   player putting it away puts it home. Home is the 玩耍 (play) button, off the scene: drag from it to take
   the ball out and throw it (a tap drops it in front of the fox), drag the ball back onto it to put it away.

   World: x in % of the stage width, z = depth 0 (front) … 1 (back), h = height above the ground in % of the
   stage height (app.js: groundAt / sizeAt / layerAt). Art: assets/scene/toys/ball.png once
   drawn, simple drawn ones until then. Needs the 2D fox (fox2d.js) for the fetching. */
(function () {
  const G = 300, BOUNCE = 0.5, ROLL = 2.4, AIR = 0.15;   // gravity %/s², energy kept per bounce, friction /s
  const SIZE = 0.14;                                       // ball width as a share of the stage width, at z 0
  const homeBtn = document.querySelector('[data-act=play]'); // the ball lives in the 玩耍 button
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
  const ballEl = art('ball', `<svg viewBox="0 0 100 100"><defs><clipPath id="ballClip"><circle cx="50" cy="50" r="45"/></clipPath></defs>
    <circle cx="50" cy="50" r="46" fill="#fdfdf8"/>
    <g clip-path="url(#ballClip)"><polygon points="50.0,35.0 64.3,45.4 58.8,62.1 41.2,62.1 35.7,45.4" fill="#2b2b33"/><line x1="50.0" y1="35.0" x2="50.0" y2="23.0" stroke="#2b2b33" stroke-width="2.5"/><line x1="64.3" y1="45.4" x2="75.7" y2="41.7" stroke="#2b2b33" stroke-width="2.5"/><line x1="58.8" y1="62.1" x2="65.9" y2="71.8" stroke="#2b2b33" stroke-width="2.5"/><line x1="41.2" y1="62.1" x2="34.1" y2="71.8" stroke="#2b2b33" stroke-width="2.5"/><line x1="35.7" y1="45.4" x2="24.3" y2="41.7" stroke="#2b2b33" stroke-width="2.5"/><polygon points="57.1,4.3 61.4,17.7 50.0,26.0 38.6,17.7 42.9,4.3" fill="#2b2b33"/><polygon points="91.3,29.2 95.7,42.6 84.2,50.9 72.8,42.6 77.2,29.2" fill="#2b2b33"/><polygon points="78.2,69.4 82.6,82.8 71.2,91.1 59.7,82.8 64.1,69.4" fill="#2b2b33"/><polygon points="35.9,69.4 40.3,82.8 28.8,91.1 17.4,82.8 21.8,69.4" fill="#2b2b33"/><polygon points="22.8,29.2 27.2,42.6 15.8,50.9 4.3,42.6 8.7,29.2" fill="#2b2b33"/></g>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#4a3a2a" stroke-width="5"/>
    <path d="M22 30 a34 34 0 0 1 22 -16" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".8"/></svg>`);
  const shadowEl = document.createElement('div');
  shadowEl.className = 'toy-shadow';
  stage.appendChild(shadowEl);

  const b = { x: 50, z: 0.15, h: 0, vx: 0, vz: 0, vh: 0, spin: 0, mode: 'home' };
  let fetchRun = 0; // bumps when a fetch is called off (the ball was grabbed)
  let busy = false;  // playing with it: the fox doesn't wander off meanwhile

  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  function place(elm, x, z, h, w) {
    elm.style.left = x + '%';
    elm.style.bottom = groundAt(z) + h + '%';
    elm.style.width = w + 'px';
    elm.style.zIndex = layerAt(z) + 1;
  }
  function render() {
    const w = W() * SIZE * sizeAt(b.z);
    const home = b.mode === 'home';
    ballEl.style.display = home ? 'none' : ''; // put away: in the 玩耍 button, not in the scene
    homeBtn?.classList.toggle('ball-out', !home);
    if (home) { shadowEl.style.opacity = 0; return; }
    place(ballEl, b.x, b.z, b.h, w);
    ballEl.style.transform = `translateX(-50%) rotate(${b.spin}deg)`;
    place(shadowEl, b.x, b.z, 0, w * Math.max(0.4, 1 - b.h / 30));
    shadowEl.style.zIndex = layerAt(b.z);
    shadowEl.style.opacity = home ? 0 : 0.25 * Math.max(0.3, 1 - b.h / 40);
  }

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

  function settle() { // rolled to a stop (a football looks the same whichever way up it stops)
    b.mode = 'rest';
    b.vx = b.vz = b.vh = 0;
    if (b.after) { const f = b.after; b.after = null; f(); }
  }

  // grab and throw: the finger's speed when it lets go is the throw; upwards on the screen = deeper
  let drag = null;
  ballEl.addEventListener('pointerdown', e => {
    if (!window.Fox2D) return;
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
  function hold(e) { // follow the finger, at the depth it was at (below the stage too, on the way to the button)
    const s = stage.getBoundingClientRect();
    b.x = Math.max(4, Math.min(96, ((e.clientX - s.left) / s.width) * 100));
    b.h = Math.max(0, ((s.bottom - e.clientY) / s.height) * 100 - groundAt(b.z) - 4);
  }
  const letGo = e => {
    if (!drag) return;
    const s = stage.getBoundingClientRect(), a = drag[0], z = drag[drag.length - 1], dt = Math.max(0.016, (z.t - a.t) / 1000);
    const vx = ((z.x - a.x) / s.width) * 100 / dt, vy = ((a.y - z.y) / s.height) * 100 / dt; // %/s, up = +
    drag = null;
    if (overHome(z.x, z.y)) return putAway();
    b.mode = 'free';
    b.vx = Math.max(-160, Math.min(160, vx * 0.7));
    b.vz = Math.max(-0.8, Math.min(2.2, vy * 0.012));
    b.vh = Math.max(0, Math.min(160, vy * 0.6));
    b.after = Math.hypot(vx, vy) > 40 ? fetch : null; // a real throw: the fox goes for it
  };
  ballEl.addEventListener('pointerup', letGo);
  ballEl.addEventListener('pointercancel', letGo);

  // taking it out of the 玩耍 button: a drag from the button throws it, a tap drops it in front of the fox
  homeBtn?.addEventListener('pointerdown', e => {
    if (b.mode !== 'home' || !window.Fox2D || !S.hatched || S.sleeping) return;
    e.preventDefault();
    b.mode = 'held';
    b.z = Math.min(0.3, foxZ + 0.1);
    drag = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    const move = ev => { drag.push({ t: performance.now(), x: ev.clientX, y: ev.clientY }); if (drag.length > 8) drag.shift(); hold(ev); };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const moved = Math.hypot(ev.clientX - drag[0].x, ev.clientY - drag[0].y) > 20;
      if (moved) return letGo(ev);
      drag = null; // a tap: it drops in front of the fox, and the fox goes for it
      b.mode = 'free';
      b.x = Math.max(10, Math.min(90, foxX + rand(-12, 12))); b.z = Math.max(0, foxZ - 0.08); b.h = 40;
      b.vx = rand(-10, 10); b.vz = 0; b.vh = 0;
      b.after = fetch;
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    hold(e);
  });

  function overHome(x, y) { // let go over the 玩耍 button (a little generous) = put away
    if (!homeBtn) return false;
    const r = homeBtn.getBoundingClientRect(), m = r.width * 0.3;
    return x > r.left - m && x < r.right + m && y > r.top - m * 2 && y < r.bottom + m;
  }
  function putAway() {
    const wasOut = b.mode !== 'home';
    b.mode = 'home';
    b.h = 0;
    homeBtn?.classList.remove('ask');
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

  // the fox's part: it plays with the ball (too big to carry) — goes to it, nudges it about with its nose,
  // now and then sits and bats it with a paw — and leaves it where it ends up for the player to tidy away
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let asked = false, remind = 0;
  function callOff() { // the ball was grabbed: whatever the fox was doing with it, stop
    fetchRun++;
    busy = false;
    if (walkTarget) { walkTarget = null; Fox2D.stop(); }
  }
  const sat = () => Fox2D.state.clip === 'normal_loop';
  async function until(test, run, ms = 6000) {
    for (let k = 0; k < ms / 50 && !test(); k++) { await wait(50); if (run !== fetchRun) return false; }
    return run === fetchRun;
  }
  const walkThere = (x, z, run, keep) => new Promise(ok => { if (!walk2d(x, z, () => ok(run === fetchRun), keep)) ok(false); });
  const rolled = run => until(() => b.mode === 'rest' || b.mode === 'home', run, 5000);

  async function fetch() {
    const run = ++fetchRun;
    busy = true;
    try { await play(run); } finally { if (run === fetchRun) busy = false; }
  }
  async function play(run) {
    if (!S.hatched || S.sleeping || !Fox2D.canWalk) return;
    if (S.stats.energy < 15) { say(t('tooTired')); return; } // too tired to play: the ball just lies there
    while (eating) { await wait(500); if (run !== fetchRun) return; }
    S.stats.fun = clamp(S.stats.fun + 15);
    S.stats.energy = clamp(S.stats.energy - 8);
    addBond(2);
    save();
    for (let k = 0, n = 3 + Math.floor(Math.random() * 3); k < n; k++) {
      if (!(await rolled(run))) return;
      const sitAndBat = k > 0 && Fox2D.canPlay && Math.random() < 0.3;
      // come up to the ball from the side the fox is on; its head (the middle of its picture) over the ball
      const from = foxX >= b.x ? 1 : -1, s = sizeAt(b.z);
      if (!(await walkThere(b.x + from * (sitAndBat ? 2 : 4) * s, Math.min(1, b.z + 0.04), run, !sitAndBat))) return;
      if (sitAndBat) { // sit, paw up: the ball goes when the paw is at the top
        if (!(await until(sat, run))) return;
        Fox2D.play('paw');
        if (!(await until(() => Fox2D.state.clip === 'normal_to_paw' && Fox2D.state.frame >= 14, run, 4000))) return;
        kick(rand(-1, 1) < 0 ? -1 : 1, 35, 30);
      } else if (Fox2D.canPush && ['walk', 'walk_r'].includes(Fox2D.state.go)) { // side-on: dip the head and push it with the nose
        Fox2D.nudge_ball();
        if (!(await until(() => Fox2D.state.pushing && Fox2D.state.frame >= 12, run, 5000))) return;
        kick(-from, 40, 10);
      } else { // (no push clip yet)
        setExpr('play', 1200);
        await wait(500);
        kick(-from, 40, 10);
      }
      await wait(600);
    }
    if (!(await rolled(run))) return;
    // had enough: sit down by it and ask for the toys to be put away
    Fox2D.stop();
    if (!(await until(sat, run))) return;
    if (b.mode === 'home') return;
    asked = true;
    say(t('tidyAsk'), 3200);
    homeBtn?.classList.add('ask');
    clearInterval(remind);
    remind = setInterval(() => { if (b.mode !== 'home' && b.mode !== 'held' && !S.sleeping) say(t('tidyAsk'), 3000); }, 45000);
  }
  function kick(dir, speed, up) { // a nudge: this way, a bit random, away from the walls
    b.mode = 'free';
    if ((b.x < 15 && dir < 0) || (b.x > 85 && dir > 0)) dir = -dir;
    b.vx = dir * speed * rand(0.7, 1.2);
    b.vz = rand(-0.2, 0.2);
    b.vh = up * rand(0.5, 1);
  }

  window.Ball = { get state() { return { ...b }; }, get busy() { return busy; }, putAway };
})();

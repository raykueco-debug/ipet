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
    elm.style.bottom = groundAt(z) + h - (h ? 0 : sinkAt(x, z, 0.5)) + '%'; // sinks into the soft bed a little
    elm.style.width = w + 'px';
    elm.style.zIndex = layerAt(z) + 1;
  }
  function render() {
    const w = W() * SIZE * sizeAt(b.z);
    const home = b.mode === 'home';
    ballEl.style.display = home ? 'none' : ''; // put away: in the 玩耍 button, not in the scene
    homeBtn?.classList.toggle('ball-out', !home);
    pressed.ball = !home && !b.h ? sinkAt(b.x, b.z, 0.5) : 0; // (scene.js: the bed gives under it)
    if (home) { shadowEl.style.opacity = 0; return; }
    place(ballEl, b.x, b.z, b.h, w);
    ballEl.style.transform = `translateX(-50%) rotate(${b.spin}deg)`;
    place(shadowEl, b.x, b.z, 0, w * Math.max(0.4, 1 - b.h / 30));
    shadowEl.style.zIndex = 9; // on the ground: under everything that stands on it
    shadowEl.style.opacity = home ? 0 : 0.25 * Math.max(0.3, 1 - b.h / 40);
  }

  function fly(p, dt) { // one step of a free ball: in the air under gravity, bouncing; on the ground rolling
    p.vh -= G * dt;
    p.x += p.vx * dt; p.z += p.vz * dt; p.h += p.vh * dt;
    if (p.h <= 0) {
      p.h = 0;
      p.vh = Math.abs(p.vh) > 25 ? -p.vh * BOUNCE : 0;
      const k = Math.exp(-ROLL * dt);
      if (!p.vh) { p.vx *= k; p.vz *= k; }
    } else { const k = Math.exp(-AIR * dt); p.vx *= k; p.vz *= k; }
    if (p.x < 6 || p.x > 94) { p.x = Math.max(6, Math.min(94, p.x)); p.vx *= -0.6; }
    if (p.z < 0 || p.z > 1) { p.z = Math.max(0, Math.min(1, p.z)); p.vz *= -0.6; }
    for (const t of THINGS) { // app.js: a solid thing low enough to hit bounces it back; a soft one slows it
      if (!within(t, p.x, p.z)) continue;
      if (t.soft) { if (!p.h) { const k = Math.exp(-ROLL * 1.5 * dt); p.vx *= k; p.vz *= k; } continue; }
      if (p.h > t.h) continue;
      const nx = (p.x - t.x) / t.rx, nz = (p.z - t.z) / t.rz, d = Math.hypot(nx, nz) || 1;
      p.x = t.x + (nx / d) * t.rx * 1.02; p.z = t.z + (nz / d) * t.rz * 1.02; // out to its edge
      const ux = nx / d, uz = nz / d, vn = p.vx / t.rx * ux + p.vz / t.rz * uz; // against its edge, in its own units
      if (vn < 0) { p.vx -= 1.6 * vn * ux * t.rx; p.vz -= 1.6 * vn * uz * t.rz; }
    }
    p.spin += (p.vx * 9 - p.vz * 120) * dt;
  }
  const still = p => !p.h && !p.vh && Math.hypot(p.vx, p.vz * 30) < 1.5;
  function restAt() { // where the ball will stop (the same steps, played ahead)
    const p = { ...b };
    for (let k = 0; k < 1200 && !still(p); k++) fly(p, 1 / 60);
    return p;
  }

  // hitboxes (x % of the stage, z, at the fox's depth), from the fox's picture: side-on it is about 3/4 of its
  // box long with the muzzle at the front end; facing us or away it is narrower and deeper
  const foxW = () => el.petWrap.offsetWidth / stage.clientWidth * 100 * sizeAt(foxZ); // its box, % of the stage
  const boxAt = z => foxW() / sizeAt(foxZ) * sizeAt(z); // the same at another depth
  const ballR = () => SIZE * 50 * sizeAt(b.z);
  function body() {
    const w = foxW(), v = Fox2D.state.view;
    if (Fox2D.state.facing) return { x: foxX, z: foxZ, rx: 0.37 * w, rz: 0.04, h: 22 };
    if (v === 'walk_front' || v === 'walk_back') return { x: foxX, z: foxZ, rx: 0.22 * w, rz: 0.09, h: 26 };
    return { x: foxX, z: foxZ, rx: 0.28 * w, rz: 0.06, h: 30 }; // sitting
  }
  // a move under way: { clips: [names it is live in], from: frame share, zone() → box + the way it sends the
  // ball (vx, vz, vh), hit }
  let strike = null;
  const inBox = (t, r) => ((b.x - t.x) / (t.rx + r)) ** 2 + ((b.z - t.z) / (t.rz + r / 100)) ** 2 < 1 && b.h < t.h;
  function contact() {
    if (b.mode !== 'free' && b.mode !== 'rest') return;
    const st = Fox2D.state, r = ballR();
    const z = strike && strike.clips.includes(st.clip) && st.frame >= st.frames * strike.from && strike.zone();
    if (z && inBox(z, r)) {
      strike.hit = true;
      strike = null;
      return send(z.vx, z.vz, z.vh);
    }
    // bumped by the body: only walking into it (going, and the ball ahead of it on the way it goes) — pushed
    // out ahead and carried on that way, faster than the fox; standing by it, the fox leaves it be
    if (!st.stride || !walkDir) return;
    const t = body();
    if (!inBox(t, r)) return;
    const ux = walkDir.x, uz = walkDir.z * DEPTH.across, n = Math.hypot(ux, uz) || 1; // its way, in % both ways
    if ((b.x - t.x) * ux + (b.z - t.z) * DEPTH.across * uz <= 0) return; // behind it on its way: not pushed
    const speed = (n * 20) * 1.4 + 10; // % a second
    b.x = t.x + (ux / n) * (t.rx + r);
    b.z = t.z + (uz / n) * (t.rz + 0.02);
    send((ux / n) * speed, (uz / n) * speed / DEPTH.across, 6);
  }
  function send(vx, vz, vh) { // off it goes: a little random, and away from the walls
    b.mode = 'free';
    if ((b.x < 12 && vx < 0) || (b.x > 88 && vx > 0)) vx = -vx;
    if ((b.z < 0.04 && vz < 0) || (b.z > 0.96 && vz > 0)) vz = -vz * 0.5;
    b.vx = vx * rand(0.8, 1.15);
    b.vz = vz * rand(0.8, 1.15);
    b.vh = vh * rand(0.75, 1);
  }

  // physics: in the air under gravity, bouncing; on the ground rolling to a stop, then the same way up
  let last = performance.now();
  function step() {
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (b.mode === 'free') {
      fly(b, dt);
      if (still(b)) settle();
    }
    if (window.Fox2D && RENDER === 'anim') contact();
    render();
  }
  setInterval(step, 1000 / 60); // a fixed clock, like fox2d.js (rAF stops while the page is hidden)

  function settle() { // rolled to a stop (a football looks the same whichever way up it stops)
    b.mode = 'rest';
    b.vx = b.vz = b.vh = 0;
  }

  // grab and throw: the finger's speed when it lets go is the throw; upwards on the screen = deeper
  let drag = null;
  // a finger on the ball takes it, whatever is drawn over it (the fox's picture is a big see-through box: when it
  // stands by the ball, its box covers it) — caught before anything else gets the touch; a little generous
  const onBall = e => {
    if (b.mode === 'home' || b.mode === 'held') return false;
    const r = ballEl.getBoundingClientRect(), rad = r.width / 2 * 1.3;
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < Math.max(rad, 28);
  };
  document.addEventListener('pointerdown', e => {
    if (!window.Fox2D || !onBall(e)) return;
    e.stopPropagation();
    e.preventDefault();
    try { ballEl.setPointerCapture(e.pointerId); } catch (err) {} // (no capture for a synthetic pointer)
    callOff();
    b.mode = 'held';
    watchIt(true);
    drag = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    hold(e);
  }, true);
  ballEl.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (drag.length > 8) drag.shift();
    hold(e);
  });
  // taken up: the fox drops into its ready-to-pounce crouch and its head follows the ball (fox2d.js watch / look)
  let watched = false;
  function watchIt(on) { // (again on each move of the ball held: its clips may come in meanwhile)
    if (on && (watched || !window.Fox2D?.canWatch || !S.hatched || S.sleeping || eating)) return;
    watched = on;
    if (on) { if (walkTarget) { walkTarget = null; Fox2D.stop(); } Fox2D.run(false); }
    window.Fox2D?.watch(on);
  }
  function hold(e) { // follow the finger, at the depth it was at (below the stage too, on the way to the button)
    const s = stage.getBoundingClientRect();
    b.x = Math.max(4, Math.min(96, ((e.clientX - s.left) / s.width) * 100));
    b.h = Math.max(0, ((s.bottom - e.clientY) / s.height) * 100 - groundAt(b.z) - 4);
    if (b.mode === 'held') watchIt(true);
    if (window.Fox2D) Fox2D.look((b.x - foxX) / 35); // its head after it: 35 % to a side is as far as it turns
  }
  const letGo = e => {
    if (!drag) return;
    const s = stage.getBoundingClientRect(), a = drag[0], z = drag[drag.length - 1], dt = Math.max(0.016, (z.t - a.t) / 1000);
    const vx = ((z.x - a.x) / s.width) * 100 / dt, vy = ((a.y - z.y) / s.height) * 100 / dt; // %/s, up = +
    drag = null;
    if (overHome(z.x, z.y)) { watchIt(false); return putAway(); }
    b.mode = 'free';
    b.vx = Math.max(-160, Math.min(160, vx * 0.7));
    b.vz = Math.max(-0.8, Math.min(2.2, vy * 0.012));
    b.vh = Math.max(0, Math.min(160, vy * 0.6));
    fetch(); // the fox goes for it at once, while it still flies and rolls
  };
  ballEl.addEventListener('pointerup', letGo);
  ballEl.addEventListener('pointercancel', letGo);

  // taking it out of the 玩耍 button: a drag from the button throws it, a tap drops it in front of the fox
  homeBtn?.addEventListener('pointerdown', e => {
    if (b.mode !== 'home' || !window.Fox2D || !S.hatched || S.sleeping) return;
    e.preventDefault();
    b.mode = 'held';
    watchIt(true);
    b.z = 0; // out of the button: at the very front, nearest the player
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
      fetch();
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
    watchIt(false);
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
    strike = null;
    clearInterval(pace);
    Fox2D.run(false);
    if (walkTarget) { walkTarget = null; Fox2D.stop(); }
  }
  // sat down (at home, or in a mood's loop: a cue still goes by way of home)
  const sat = () => { const c = Fox2D.state.clip || ''; return !Fox2D.state.go && c.includes('_loop') && !c.startsWith('walk'); };
  async function until(test, run, ms = 6000) {
    for (let k = 0; k < ms / 50 && !test(); k++) { await wait(50); if (run !== fetchRun) return false; }
    return run === fetchRun;
  }
  // where the fox goes for the ball lying at p: side-on with its muzzle at it (from the side the fox is on, or the
  // other when that is off the edge); the ball right in front of it (overlapping, nearer us): behind the ball, to
  // bump it toward us; sitting by it: just behind it, the ball at its front paws
  function spotFor(p, plan) {
    const w = boxAt(p.z), r = SIZE * 50 * sizeAt(p.z);
    if (plan === 'front') return { x: p.x, z: Math.min(1, p.z + 0.15) };
    if (plan === 'paw') return { x: p.x + (foxX >= p.x ? 1 : -1) * 0.08 * w, z: Math.min(1, p.z + 0.06) };
    let from = foxX >= p.x ? 1 : -1;
    const off = 0.37 * w + r + 1;
    if (p.x + from * off < 4 || p.x + from * off > 96) from = -from;
    return { x: Math.max(4, Math.min(96, p.x + from * off)), z: Math.min(1, p.z + 0.02) };
  }
  const planFor = p => { // the ball overlapping it, nearer us: bump it toward us
    const w = boxAt(p.z);
    return Math.abs(p.x - foxX) < 0.3 * w && p.z < foxZ - 0.02 && p.z > 0.06 && Fox2D.canWalkDepth ? 'front' : 'side';
  };
  // walk / run there, never through the ball on the way (round behind it)
  function goTo(spot, keep, then) {
    if (!walk2d(spot.x, spot.z, then, keep)) return false;
    const w = boxAt(b.z), r = ballR(), via = walkTarget?.via;
    const hits = (ax, az, bx, bz) => {
      for (let k = 1; k < 16; k++) {
        const x = ax + (bx - ax) * k / 16, z = az + (bz - az) * k / 16;
        if (Math.abs(x - b.x) < 0.4 * w + r && Math.abs(z - b.z) < 0.08) return true;
      }
      return false;
    };
    if (via && b.mode === 'rest' && hits(foxX, foxZ, spot.x, spot.z)) {
      const side = foxX >= b.x ? 1 : -1;
      via.unshift({ x: Math.max(4, Math.min(96, b.x + side * (0.45 * w + r))), z: Math.min(1, b.z + 0.12) });
    }
    return true;
  }
  const walkThere = (spot, run, keep) => new Promise(ok => { if (!goTo(spot, keep, () => ok(run === fetchRun))) ok(false); });
  let pace = 0;
  let dashing = false; // going in for a pounce: it runs all the way in
  function pacing() { // runs while it's far, walks the last body length (slowing down as a real one does)
    clearInterval(pace);
    pace = setInterval(() => {
      const w = walkTarget?.via?.[0] || walkTarget;
      Fox2D.run(!!w && (dashing || Math.hypot(w.x - foxX, (w.z - foxZ) * DEPTH.across) > 0.9 * foxW()));
    }, 100);
  }
  // stopped (or put away): false when it is still going after a while, or the fetch was called off
  const rolled = async run => (await until(() => b.mode === 'rest' || b.mode === 'home', run, 5000)) && b.mode !== 'free';
  async function chase(run) { // up at once, for where it will stop, while it still flies and rolls
    for (let k = 0; b.mode === 'free' && k < 40; k++) {
      // on to where it will be, staying up (no sitting down on the way: it goes straight into its move when it
      // gets there); there before the ball has stopped, it sits and watches it
      const p = restAt(), plan = planFor(p), s = spotFor(p, plan);
      dashing = plan === 'side';
      if (Math.hypot(s.x - foxX, (s.z - foxZ) * DEPTH.across) > 3) walk2d(s.x, s.z, null, true);
      else if (!walkTarget && Fox2D.state.go) Fox2D.stop();
      await wait(250);
      if (run !== fetchRun) return false;
    }
    return rolled(run);
  }

  // thrown while it watched it held up: its head follows it a moment in the air (till it first lands), then off
  async function follow(run) {
    if (!watched) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 600 && !(performance.now() - t0 > 300 && b.h === 0) && run === fetchRun) {
      Fox2D.look((b.x - foxX) / 35);
      await wait(50);
    }
    watchIt(false);
  }
  async function fetch() {
    const run = ++fetchRun;
    busy = true;
    await follow(run);
    pacing();
    try { await play(run); } finally { if (run === fetchRun) { busy = false; clearInterval(pace); Fox2D.run(false); } }
  }
  // one go at the ball lying still: get to it, face it, and the move that fits where it lies — true if it hit it
  // the pounce carries it forward: over its leap (a share of its way in, eased: slow off, quickest in the air,
  // slow landing) the fox moves this far the way it faces — the one move where it goes without walking
  const LEAP = 0.18; // of its box
  async function leapIn(clip, dist, run) {
    if (!(await until(() => Fox2D.state.clip === clip, run, 4000))) return;
    let done = 0;
    while (Fox2D.state.clip === clip && run === fetchRun) {
      const u = Math.min(1, Math.max(0, (Fox2D.state.frame / Fox2D.state.frames - 0.3) / 0.5));
      const to = dist * (1 - Math.cos(u * Math.PI)) / 2;
      foxX = Math.max(4, Math.min(96, foxX + to - done));
      done = to;
      placeFox();
      await wait(30);
    }
  }
  async function playOnce(run) {
    const paw = Fox2D.canPlay && Fox2D.state.view === 'normal' && !Fox2D.state.go && Math.abs(b.x - foxX) < 0.3 * foxW()
      && Math.abs(b.z - foxZ) < 0.1 && b.z < foxZ;
    const plan = paw ? 'paw' : planFor(b);
    const moves = Fox2D.ballMoves.filter(m => m !== 'tail'); // (the tail sweep turns its back on the ball: not for this)
    // running in at it: a pounce, straight off the run (it is queued as the last stride begins, see below)
    const onTheRun = Fox2D.state.running || dashing && Fox2D.state.go;
    const kind = plan !== 'side' ? plan : moves.length && (onTheRun || Math.random() < 0.75) ? 'move' : Fox2D.canPush ? 'push' : 'move';
    dashing = onTheRun && kind === 'move'; // (and on running the last bit)
    const m = kind !== 'move' ? null : onTheRun && moves.includes('pounce') && Math.random() < 0.8 ? 'pounce' : pick(moves);
    // a pounce leaps: it starts that much further back, and lands with its muzzle at the ball
    const leap = m === 'pounce' ? LEAP * boxAt(b.z) : 0, spot = spotFor(b, plan);
    if (leap) spot.x = Math.max(4, Math.min(96, spot.x + Math.sign(spot.x - b.x) * leap));
    if (!(await walkThere(spot, run, plan !== 'paw'))) return false;
    if (b.mode !== 'rest') return false; // it got away meanwhile: after it again
    // where it stands for it: it may still be on its last stride there (walk2d says so as that stride begins)
    const at = walkTarget?.last ? { x: walkTarget.x, z: walkTarget.z } : { x: foxX, z: foxZ };
    const w = foxW(), r = ballR(), dir = Math.sign(b.x - at.x) || -1, g = dir > 0 ? 'walk_r' : 'walk';
    let done;
    if (kind === 'front') { // facing us, a bump with the head: it comes at us (toward the screen), up a little
      if (Math.abs(b.x - at.x) > 0.3 * w || b.z > at.z) return false;
      if (!Fox2D.canPushFront) { // (no bump clip yet) walk on into it, toward us: the body pushes it
        await walkThere({ x: b.x, z: Math.max(0, b.z - 0.12) }, run, false);
        return true;
      }
      strike = { clips: ['walk_front_loop_push'], from: 0.25, zone: () => ({ x: foxX, z: foxZ - 0.07, rx: 0.2 * foxW(), rz: 0.08, h: 30,
        vx: rand(-12, 12), vz: -rand(0.75, 1.05), vh: rand(40, 60) }) };
      Fox2D.nudge_ball();
      Fox2D.go('walk_front');
      done = () => Fox2D.state.clip === 'walk_front_loop_push' && Fox2D.state.frame >= Fox2D.state.frames - 2;
    } else if (kind === 'paw') { // sitting with it at its front paws: bat it, out toward us and to the side
      Fox2D.stop();
      if (!(await until(sat, run))) return false;
      strike = { clips: ['normal_to_paw', 'paw_loop'], from: 0.5, zone: () => ({ x: foxX, z: foxZ - 0.05, rx: 0.22 * foxW(), rz: 0.08, h: 40,
        vx: (b.x >= foxX ? 1 : -1) * rand(20, 35), vz: -rand(0.3, 0.6), vh: rand(25, 40) }) };
      Fox2D.play('paw');
      done = () => Fox2D.state.clip === 'paw_to_normal';
    } else { // side-on: it faces the ball first (gets up / turns round that way; the move is queued first, so
      // that goes straight into it), then hits it with what is on its head's side
      const muzzle = at.x + dir * (0.37 * w + leap);
      if (Math.abs(b.x - muzzle) > r + 0.12 * w || Math.abs(b.z - at.z) > 0.1) return false;
      const head = (reach, speed, up) => () => { // the way the frame playing faces: never a hit on the tail's side
        const f = Fox2D.state.facing;
        return f ? { x: foxX + f * 0.37 * foxW(), z: foxZ, rx: reach * foxW(), rz: 0.08, h: 40, vx: f * speed, vz: rand(-0.25, 0.25), vh: up } : null;
      };
      if (kind === 'move') {
        const rr = dir > 0 ? '_r' : '';
        const [speed, up, reach] = { pounce: [55, 85, 0.2], swipe: [50, 18, 0.16], bat: [30, 8, 0.16], header: [35, 75, 0.15] }[m];
        // (a pounce hits as it lands, at the end of its leap; the others as the paw / head gets there)
        strike = { clips: [`${g}_to_${m}${rr}`, `${m}${rr}_to_${g}`], from: m === 'pounce' ? 0.65 : 0.35, zone: head(reach, speed, up) };
        Fox2D.ballMove(m);
        if (leap) leapIn(`${g}_to_${m}${rr}`, dir * leap, run);
        done = () => Fox2D.state.clip === `${m}${rr}_to_${g}` && Fox2D.state.frame >= 4;
      } else {
        strike = { clips: [`${g}_loop_push`], from: 0.3, zone: head(0.12, 38, 8) };
        Fox2D.nudge_ball();
        done = () => Fox2D.state.pushing && Fox2D.state.frame >= Fox2D.state.frames - 2;
      }
      Fox2D.go(g);
    }
    dashing = false;
    const k = strike;
    await until(() => k.hit || done(), run, 7000);
    if (strike === k) strike = null;
    return !!k.hit;
  }
  async function play(run) {
    // just opened: its walking clips may still be on the way — wait for them, never just ignore the ball
    for (let k = 0; !Fox2D.canWalk && k < 600; k++) { await wait(100); if (run !== fetchRun) return; }
    if (!S.hatched || S.sleeping || !Fox2D.canWalk) return;
    if (S.stats.energy < 15) { Fox2D.play('yawn'); say(t('tooTired')); return; } // too tired: a yawn, the ball just lies there
    while (eating) { await wait(500); if (run !== fetchRun) return; }
    S.stats.fun = clamp(S.stats.fun + 15);
    S.stats.energy = clamp(S.stats.energy - 2); // (a little each throw: a child throws it again and again)
    addBond(2);
    save();
    // a few hits, after it each time it goes; tries that didn't reach it don't count (a few, then it stops)
    for (let hits = 0, tries = 0, n = 3 + Math.floor(Math.random() * 3); hits < n && tries < n + 8; tries++) {
      if (b.mode === 'home') return; // put away meanwhile
      if (!(await chase(run))) { if (run !== fetchRun) return; continue; }
      if (await playOnce(run)) { hits++; await wait(rand(250, 600)); } // watches it go a moment
      if (run !== fetchRun) return;
    }
    if (!(await rolled(run))) return;
    // had enough: sit down by it and ask for the toys to be put away
    clearInterval(pace);
    Fox2D.run(false);
    Fox2D.stop();
    if (!(await until(sat, run))) return;
    if (b.mode === 'home') return;
    asked = true;
    say(t('tidyAsk'), 3200);
    homeBtn?.classList.add('ask');
    clearInterval(remind);
    remind = setInterval(() => { if (b.mode !== 'home' && b.mode !== 'held' && !S.sleeping) say(t('tidyAsk'), 3000); }, 45000);
  }

  // drop(x, z): the ball lands there (for trying the play out: the fox goes for it as if thrown)
  const drop = (x, z) => { callOff(); Object.assign(b, { x, z, h: 20, vx: 0, vz: 0, vh: 0, mode: 'free' }); fetch(); };
  window.Ball = { get state() { return { ...b }; }, get busy() { return busy; }, putAway, drop };
})();

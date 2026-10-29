/* 狐火奔跑 — a run through the forest behind the fox (a prototype).
   Three lanes on a road that runs into the distance, played like the old lane-dodging car games: tap the left /
   right half of the screen (or swipe) to change lane and get out of the way of what blocks it; now and then
   something lies across the whole road — swipe up to jump it (a log), down to duck under it (a bough). Fox-fire orbs to collect. ⚡ a burst of speed — the
   fox can use it as many times as it has tails (S.tails of the pet, or ?tails=): it glows, goes through
   anything and draws the orbs in. No losing: a bump is a stumble and a slower moment; the run ends on the clock.
   World: x in lanes (-1, 0, 1; the edges ±1.6), z ahead of the fox in metres-ish; seen from just behind it. */
(function () {
  const RUN_S = 75;                      // a run, seconds
  const SPEED = [9, 14];                 // m/s at the start / the end
  const BOOST = { s: 3, x: 1.9 };        // a burst: seconds, × speed
  const FAR = 70, CAM = 7;               // spawn distance; camera depth (projection)
  const params = new URLSearchParams(location.search);
  const tails = (() => {
    if (params.get('tails')) return Math.max(1, Math.min(9, +params.get('tails') || 1));
    try { const s = JSON.parse(localStorage.getItem('ipet-fox-v1')); return Math.max(1, Math.min(9, s.tailsOverride || s.tails || 1)); } catch (e) { return 1; }
  })();
  const BIOMES = [ // a stretch each, in turn
    { sky: ['#bfe6ff', '#eaf7ff'], ground: '#9fd486', road: '#e9d29c', edge: '#7cc35f', tree: ['#5fb54d', '#3f8f3a'], name: 'meadow' },
    { sky: ['#ffd9ec', '#fff3f8'], ground: '#a6dc84', road: '#f1dcae', edge: '#86c867', tree: ['#ff9ec4', '#e8709d'], name: 'flowers' },
    { sky: ['#b5ecff', '#e8fbff'], ground: '#8fd3c7', road: '#cfe7f0', edge: '#5fb3b0', tree: ['#4fae8a', '#2f7a65'], name: 'creek' },
    { sky: ['#1d2550', '#3a3f7a'], ground: '#2f5a4a', road: '#5a5f7a', edge: '#244538', tree: ['#2e6b52', '#1b4436'], name: 'night' },
    { sky: ['#dfeaf5', '#ffffff'], ground: '#eef4fa', road: '#d6e0ea', edge: '#c7d6e6', tree: ['#7fae9a', '#4f7f6c'], name: 'snow' },
  ];
  const STRETCH = 15; // seconds a biome

  const cv = document.getElementById('game'), g = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize);
  resize();
  const horizon = () => H * 0.32, ground0 = () => H * 0.9, laneW = () => Math.min(W * 0.28, H * 0.2);
  // a little round world: the ground bends away from the fox — far off it sinks, and off to the sides too, so
  // the horizon is a gentle arc and things come up over it
  const BEND = [0.03, 0.04]; // of the screen's height: sunk at the far end, at the screen's edges
  function project(x, z) { // → screen x, y and scale
    const s = CAM / (CAM + Math.max(-CAM * 0.9, z));
    const sx = W / 2 + x * laneW() * s, far = Math.max(0, z) / FAR, side = Math.min(1, Math.abs(sx - W / 2) / (W / 2));
    // (only ever down, and only away from the fox: the ground under it stays put)
    return { x: sx, y: horizon() + (ground0() - horizon()) * s + H * (BEND[0] * far * far + BEND[1] * side * side * Math.max(0, 1 - s)), s };
  }

  // the fox, bounding away pounce after pounce: up from its crouch and down into it again (back_crouch_to_back_air
  // + back_air_to_back_crouch, tools/wan_run.sh) — or, until those are there, its running-away loop bounced by the
  // code — at the run's pace
  let frames = [], pace = 1, pouncing = false;
  async function clipFrames(clip) {
    const r = await fetch(`assets/fox/clips/${clip}/meta.json`).catch(() => null);
    if (!r?.ok) return null;
    const m = await r.json();
    return m.frames.map(f => { const im = new Image(); im.src = `assets/fox/clips/${clip}/${f}?v=${m.rev || 1}`; return im; });
  }
  (async () => {
    const up = await clipFrames('back_crouch_to_back_air'), down = up && await clipFrames('back_air_to_back_crouch');
    if (up && down) { frames = [...up, ...down.slice(1, -1)]; pace = 0.75; pouncing = true; return; }
    for (const [clip, k] of [['walk_back_loop_run', 1], ['walk_back_loop', 1.4]]) {
      const f = await clipFrames(clip);
      if (f) { frames = f; pace = k; return; }
    }
  })();

  // game state
  let run = null;
  const fresh = () => ({ t: 0, z: 0, lane: 0, x: 0, jump: -1, duck: -1, stumble: -1, boost: -1, boostsLeft: tails,
    orbs: 0, things: [], trees: [], nextRow: 18, frame: 0, flash: [] });
  function speed() {
    const k = Math.min(1, run.t / RUN_S), base = SPEED[0] + (SPEED[1] - SPEED[0]) * k;
    return base * (run.boost >= 0 ? BOOST.x : 1) * (run.stumble >= 0 ? 0.45 : 1);
  }
  const biome = () => BIOMES[Math.floor(run.t / STRETCH) % BIOMES.length];

  // a row of things ahead: always a way through (a free lane, or something to jump / duck), orbs on the way
  function spawnRow(z) {
    const r = Math.random(), lanes = [-1, 0, 1];
    if (r < 0.07) { // now and then across the road: jump it or duck it
      const type = Math.random() < 0.5 ? 'log' : 'branch';
      for (const l of lanes) run.things.push({ type, lane: l, z, across: true });
      for (let k = 0; k < 3; k++) run.things.push({ type: 'orb', lane: pick(lanes), z: z + 2 + k * 2, h: type === 'log' ? 1.2 : 0.4 });
      return;
    }
    const n = Math.random() < 0.55 ? 1 : 2, used = shuffle(lanes).slice(0, n);
    for (const l of used) run.things.push({ type: pick(['rock', 'rock', 'log', 'puddle', 'stump']), lane: l, z }); // in its lane: get out of the way
    const free = lanes.filter(l => !used.includes(l));
    const ol = pick(free.length ? free : lanes);
    for (let k = 0; k < 4; k++) run.things.push({ type: 'orb', lane: ol, z: z - 3 + k * 1.8, h: 0.4 });
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

  // input: swipes (and arrow keys / space when trying it on a computer)
  let touch = null;
  cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  addEventListener('pointerup', e => {
    if (!touch || !run) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch = null;
    if (Math.hypot(dx, dy) < 24) return move(e.clientX < W / 2 ? -1 : 1); // a tap: that half's way
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else duck();
  });
  addEventListener('keydown', e => {
    if (!run) return;
    if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowUp') jump(); else if (e.key === 'ArrowDown') duck(); else if (e.key === ' ') boost();
  });
  const move = d => { run.lane = Math.max(-1, Math.min(1, run.lane + d)); };
  const jump = () => { if (run.jump < 0) { run.jump = 0; run.duck = -1; } };
  const duck = () => { if (run.jump < 0) run.duck = 0; };
  function boost() {
    if (!run || run.boostsLeft <= 0 || run.boost >= 0) return;
    run.boostsLeft--;
    run.boost = 0;
    hud();
  }
  document.getElementById('boost').addEventListener('click', e => { e.stopPropagation(); boost(); });

  function step(dt) {
    run.t += dt;
    const v = speed();
    run.z += v * dt;
    run.x += (run.lane - run.x) * Math.min(1, dt * 14); // a quick slide to its lane
    for (const k of ['jump', 'duck', 'stumble', 'boost']) if (run[k] >= 0) run[k] += dt;
    if (run.jump > 0.62) run.jump = -1;
    if (run.duck > 0.6) run.duck = -1;
    if (run.stumble > 1.1) run.stumble = -1;
    if (run.boost > BOOST.s) run.boost = -1;
    run.frame += dt * 16 * (v / SPEED[0]) * pace;
    // the world comes at it
    for (const o of run.things) o.z -= v * dt;
    for (const tr of run.trees) tr.z -= v * dt;
    while (run.nextRow < FAR) { spawnRow(run.nextRow); run.nextRow += 9 + Math.random() * 5; }
    run.nextRow -= v * dt;
    while (run.trees.length < 26) run.trees.push({ side: Math.random() < 0.5 ? -1 : 1, off: 1.9 + Math.random() * 1.6, z: (run.trees.at(-1)?.z ?? 0) + 2 + Math.random() * 4, k: 0.8 + Math.random() * 0.6 });
    run.trees = run.trees.filter(tr => tr.z > -CAM * 0.8);
    // meeting things at the fox (z about 0, its lane)
    const air = run.jump >= 0 ? Math.sin(Math.PI * run.jump / 0.62) : 0, low = run.duck >= 0;
    for (const o of run.things) {
      if (o.hit) continue;
      if (o.type === 'orb' && run.boost >= 0 && o.z < 6 && o.z > -1) { o.lane += (run.x - o.lane) * Math.min(1, dt * 8); } // drawn in
      if (Math.abs(o.z) > 0.7 || Math.abs(o.lane - run.x) > 0.45) continue;
      if (o.type === 'orb') {
        if (o.h > 0.8 && air < 0.5) continue; // a high one: jump for it
        o.hit = true; run.orbs++; run.flash.push({ x: o.lane, t: 0 }); hud();
        continue;
      }
      // (a log or a puddle can be jumped too; rocks and stumps only got out of the way of)
      const cleared = (o.type === 'log' || o.type === 'puddle') ? air > 0.35 : o.type === 'branch' ? low : false;
      if (cleared) continue;
      o.hit = true;
      if (run.boost >= 0) { o.smash = 0; continue; } // bursting through it
      if (run.stumble < 0) run.stumble = 0;
    }
    run.things = run.things.filter(o => o.z > -CAM * 0.8 && !(o.hit && o.type === 'orb'));
    for (const f of run.flash) f.t += dt;
    run.flash = run.flash.filter(f => f.t < 0.4);
    if (run.t >= RUN_S) end();
  }

  // drawing
  function draw() {
    const b = biome(), hy = horizon();
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, b.sky[0]); sky.addColorStop(1, b.sky[1]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H); // (down behind the arc of the ground)
    if (b.name === 'night') for (let k = 0; k < 40; k++) { g.fillStyle = '#fff8'; g.fillRect((k * 97.3) % W, (k * 53.1) % hy, 2, 2); }
    // the ground: its far edge an arc (the round world), the sky down to it
    const edgeAt = sx => project((sx - W / 2) / laneW() / (CAM / (CAM + FAR)), FAR).y; // (the world x seen at sx out there)
    g.fillStyle = b.ground;
    g.beginPath(); g.moveTo(0, H);
    for (let k = 0; k <= 24; k++) g.lineTo(W * k / 24, edgeAt(W * k / 24));
    g.lineTo(W, H); g.closePath(); g.fill();
    // the road, bending down with the ground, its edges and stripes coming at the fox
    const zs = []; for (let k = 0; k <= 30; k++) zs.push(-CAM * 0.6 + (FAR + CAM * 0.6) * (k / 30) ** 1.6);
    const left = zs.map(z => project(-1.6, z)), right = zs.map(z => project(1.6, z));
    g.fillStyle = b.road;
    g.beginPath(); left.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); [...right].reverse().forEach(p => g.lineTo(p.x, p.y)); g.closePath(); g.fill();
    g.strokeStyle = b.edge; g.lineWidth = 6;
    for (const side of [left, right]) { g.beginPath(); side.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    g.fillStyle = '#ffffff55';
    for (let z = -(run.z % 4); z < FAR; z += 4) for (const x of [-0.5, 0.5]) {
      const a = project(x, z), c = project(x, z + 1.6);
      g.beginPath(); g.moveTo(a.x - 3 * a.s, a.y); g.lineTo(a.x + 3 * a.s, a.y); g.lineTo(c.x + 3 * c.s, c.y); g.lineTo(c.x - 3 * c.s, c.y); g.fill();
    }
    // far to near: trees, things, then the fox
    const items = [...run.trees.map(tr => ({ z: tr.z, d: () => tree(tr, b) })), ...run.things.map(o => ({ z: o.z, d: () => thing(o, b) }))];
    items.sort((p, q) => q.z - p.z);
    for (const it of items) if (it.z > 0.3) it.d();
    fox();
    for (const it of items) if (it.z <= 0.3) it.d();
    for (const f of run.flash) { const p = project(f.x, 0); g.fillStyle = `rgba(255,200,80,${1 - f.t / 0.4})`; g.beginPath(); g.arc(p.x, p.y - H * 0.2, 30 + f.t * 120, 0, 7); g.fill(); }
    if (run.boost >= 0) { g.fillStyle = '#fff6'; for (let k = 0; k < 14; k++) { const x = (k * 137 + run.z * 40) % W; g.fillRect(x, H * 0.4 + (k * 61) % (H * 0.5), 3, 40); } }
    document.getElementById('timeBar').style.width = Math.max(0, 100 - run.t / RUN_S * 100) + '%';
  }
  function tree(tr, b) {
    const p = project(tr.side * tr.off, tr.z), s = p.s * laneW() * tr.k;
    g.fillStyle = '#8a5c3a'; g.fillRect(p.x - s * 0.08, p.y - s * 0.5, s * 0.16, s * 0.5);
    g.fillStyle = b.tree[1]; g.beginPath(); g.arc(p.x, p.y - s * 0.75, s * 0.42, 0, 7); g.fill();
    g.fillStyle = b.tree[0]; g.beginPath(); g.arc(p.x - s * 0.08, p.y - s * 0.85, s * 0.32, 0, 7); g.fill();
  }
  function thing(o, b) {
    const p = project(o.lane, o.z), u = laneW() * p.s;
    if (o.type === 'orb') {
      const y = p.y - u * (0.25 + o.h * 0.5) + Math.sin(run.t * 6 + o.z) * u * 0.04, r = u * 0.13;
      const gl = g.createRadialGradient(p.x, y, 0, p.x, y, r * 2.4);
      gl.addColorStop(0, '#fffbe0'); gl.addColorStop(0.35, '#ffc247'); gl.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(p.x, y, r * 2.4, 0, 7); g.fill();
      return;
    }
    if (o.smash != null) { g.globalAlpha = Math.max(0, 1 - (o.smash += 0.05)); }
    g.strokeStyle = '#4a3a2a'; g.lineWidth = Math.max(1.5, 3 * p.s);
    if (o.type === 'rock') {
      g.fillStyle = b.name === 'snow' ? '#e9eef5' : '#b9b6ad';
      g.beginPath(); g.ellipse(p.x, p.y - u * 0.22, u * 0.4, u * 0.3, 0, Math.PI, 0); g.lineTo(p.x + u * 0.4, p.y); g.lineTo(p.x - u * 0.4, p.y); g.closePath(); g.fill(); g.stroke();
    } else if (o.type === 'log') {
      g.fillStyle = '#a8744a'; g.beginPath(); g.roundRect(p.x - u * 0.48, p.y - u * 0.2, u * 0.96, u * 0.2, u * 0.1); g.fill(); g.stroke();
      g.fillStyle = '#e3b98a'; g.beginPath(); g.ellipse(p.x + u * 0.46, p.y - u * 0.1, u * 0.06, u * 0.1, 0, 0, 7); g.fill();
    } else if (o.type === 'stump') {
      g.fillStyle = '#9b6a43'; g.beginPath(); g.roundRect(p.x - u * 0.26, p.y - u * 0.34, u * 0.52, u * 0.34, u * 0.05); g.fill(); g.stroke();
      g.fillStyle = '#e3b98a'; g.beginPath(); g.ellipse(p.x, p.y - u * 0.34, u * 0.26, u * 0.07, 0, 0, 7); g.fill(); g.stroke();
    } else if (o.type === 'puddle') {
      g.fillStyle = b.name === 'night' ? '#4c6fae' : '#7cc3ee'; g.beginPath(); g.ellipse(p.x, p.y - u * 0.03, u * 0.42, u * 0.1, 0, 0, 7); g.fill();
    } else if (o.type === 'branch') { // a bough across, up at head height: duck under
      const y = p.y - u * 0.62;
      g.fillStyle = '#8a5c3a'; g.fillRect(p.x - u * 0.5, y - u * 0.05, u, u * 0.1);
      g.fillStyle = b.tree[0]; for (const dx of [-0.35, -0.05, 0.25]) { g.beginPath(); g.arc(p.x + dx * u, y - u * 0.06, u * 0.12, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  function fox() {
    const p = project(run.x, 0), size = Math.min(W * 0.5, H * 0.34);
    const air = run.jump >= 0 ? Math.sin(Math.PI * run.jump / 0.62) : 0;
    g.fillStyle = '#0002'; g.beginPath(); g.ellipse(p.x, p.y, size * 0.2 * (1 - air * 0.3), size * 0.05, 0, 0, 7); g.fill();
    const f = frames[Math.floor(run.frame) % (frames.length || 1)];
    if (!f || !f.complete || !f.naturalWidth) return;
    // pouncing on: up through the first half of the loop, down through the second; (a trot: bounced twice a
    // loop, a little squash as it lands)
    const u = (run.frame % (frames.length || 24)) / (frames.length || 24), busy = run.jump >= 0 || run.duck >= 0;
    const hop = busy ? 0 : pouncing ? Math.sin(Math.PI * u) : Math.abs(Math.sin(u * Math.PI * 4));
    g.save();
    g.translate(p.x, p.y - air * size * 0.45 - hop * size * (pouncing ? 0.16 : 0.07));
    if (!busy && !pouncing) g.scale(1 + (1 - hop) * 0.04, 1 - (1 - hop) * 0.06);
    if (run.stumble >= 0) { g.rotate(Math.sin(run.stumble * 18) * 0.18); g.globalAlpha = Math.floor(run.stumble * 10) % 2 ? 0.5 : 1; }
    if (run.duck >= 0) g.scale(1.12, 0.62);
    if (run.boost >= 0) { g.shadowColor = '#ffb347'; g.shadowBlur = 30; }
    // feet at y 449 of 480 in the clip's frames
    g.drawImage(f, -size / 2, -size * 449 / 480, size, size);
    g.restore();
  }

  function hud() {
    document.getElementById('orbs').textContent = run.orbs;
    document.getElementById('boostLeft').textContent = `還有 ${run.boostsLeft} 次`;
    document.getElementById('boost').disabled = run.boostsLeft <= 0;
  }
  let last = 0, raf = 0;
  function loop(t) {
    const dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0)); // (a frame stamped before the start: none)
    last = t;
    if (run) { step(dt); if (run) draw(); }
    raf = requestAnimationFrame(loop);
  }
  function start() {
    run = fresh();
    document.getElementById('start').hidden = document.getElementById('end').hidden = true;
    hud();
    last = performance.now();
  }
  function end() {
    const n = run.orbs;
    run = null;
    document.getElementById('final').textContent = n;
    document.getElementById('endNote').textContent = `${tails} 條尾巴 = ${tails} 次加速。小狐多長一條尾巴，就能多加速一次！`;
    document.getElementById('end').hidden = false;
  }
  document.getElementById('go').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('home').addEventListener('click', () => { location.href = 'index.html'; });
  // the first frame behind the start card
  run = fresh(); draw(); run = null;
  raf = requestAnimationFrame(loop);
})();

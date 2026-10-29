/* 狐火奔跑 — a rhythm run through the forest behind the fox (a prototype).
   A classical piece plays all the way through (music.js): its accompaniment on its own, its lead laid on the road
   as notes, each where it falls in the music — the road moves with the music's own clock, so a note reaches the
   fox on its beat. Picked up on its beat, a note sounds; missed, that note is silent but the music goes on, and
   the run is scored by how much of the tune was played (完成度).
   Three kinds of note: 吃 — be in its lane as it comes (tap the left / right half of the screen, or swipe, to
   change lane); 跳 — swipe up on its beat; 連打 — a ribbon of quick notes: tap, tap, tap while it passes, each tap
   the next note. ⚡ (as many as the fox has tails: S.tails of the pet, or ?tails=) — for a few seconds every note
   plays itself, wherever the fox is.
   World: x in lanes (-1, 0, 1; the edges ±1.6), z ahead of the fox; seen from just behind it. */
(function () {
  const SCROLL = 9;                      // road speed (z a second): the music's time × this is where a note lies
  const LEAD_IN = 3;                     // seconds before the music starts: the first notes come from afar
  const WIN = { perfect: 0.07, good: 0.15 }; // how near its beat a note may be taken, seconds
  const BOOST_S = 3;                     // ⚡ seconds
  const FAR = 70, CAM = 7;               // the far end of the road; camera depth (projection)
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

  // the fox, bounding away pounce after pounce, a pounce every half bar (back_crouch_to_back_air +
  // back_air_to_back_crouch, tools/wan_run.sh) — or, until those are there, its running-away loop
  let frames = [], pouncing = false;
  async function clipFrames(clip) {
    const r = await fetch(`assets/fox/clips/${clip}/meta.json`).catch(() => null);
    if (!r?.ok) return null;
    const m = await r.json();
    return m.frames.map(f => { const im = new Image(); im.src = `assets/fox/clips/${clip}/${f}?v=${m.rev || 1}`; return im; });
  }
  (async () => {
    const up = await clipFrames('back_crouch_to_back_air'), down = up && await clipFrames('back_air_to_back_crouch');
    if (up && down) { frames = [...up, ...down.slice(1, -1)]; pouncing = true; return; }
    for (const clip of ['walk_back_loop_run', 'walk_back_loop']) { const f = await clipFrames(clip); if (f) { frames = f; return; } }
  })();

  // a piece into a chart: the lead's notes (rolls where they come quick), the accompaniment's to play; seconds
  function chart(song) {
    const lead = Music.parse(song.lead), back = Music.parse(song.back), s16 = song.sixteenth;
    const marks = [], backs = [], ps = lead.notes.map(n => n.midi[0]), low = Math.min(...ps), high = Math.max(...ps);
    let lane = 0;
    for (let k = 0; k < song.times; k++) {
      const off = k * lead.length;
      for (const n of back.notes) backs.push({ t: (off + n.t) * s16, midi: n.midi });
      const ns = lead.notes;
      for (let i = 0; i < ns.length;) {
        let j = i; while (j < ns.length && ns[j].len <= 1 && !ns[j].jump) j++;
        if (j - i >= 4) { // a run of quick notes: a roll
          marks.push({ type: 'roll', t: (off + ns[i].t) * s16, t1: (off + ns[j - 1].t + 1) * s16, lane: 0,
            notes: ns.slice(i, j).map(n => ({ t: (off + n.t) * s16, midi: n.midi[0], hit: false })) });
          i = j; continue;
        }
        const n = ns[i], t = (off + n.t) * s16, prev = marks.at(-1);
        if (n.len < 1) { backs.push({ t, midi: n.midi }); i++; continue; } // a grace note: it plays itself
        // its lane by its pitch (higher to the right), but only a lane at a time when they come close
        const want = Math.round(((n.midi[0] - low) / Math.max(1, high - low)) * 2 - 1), gap = prev ? t - (prev.t1 || prev.t) : 9;
        lane += Math.max(gap < 0.35 ? -1 : -2, Math.min(gap < 0.35 ? 1 : 2, want - lane));
        marks.push({ type: n.jump ? 'jump' : 'eat', t, midi: n.midi[0], lane: n.jump ? 0 : lane });
        i++;
      }
    }
    const total = marks.reduce((a, m) => a + (m.type === 'roll' ? m.notes.length : 1), 0);
    backs.sort((a, b) => a.t - b.t);
    return { marks, backs, total, length: lead.length * song.times * s16, name: song.name, s16 };
  }

  // game state
  let run = null;
  const fresh = () => {
    const c = chart(Music.SONGS[+params.get('song')] || pick(Music.SONGS)); // (?song=n: that one)
    return { ...c, start: Music.now() + LEAD_IN, sched: 0, lane: 0, x: 0, jump: -1, boost: -1, boostsLeft: tails,
      played: 0, combo: 0, frame: 0, flash: [], says: [], trees: [], dist: 0 };
  };
  const songT = () => Music.now() - run.start;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // input: a tap on a half moves that way (or, in a roll, is a roll hit); swipes; keys for trying it on a computer
  let touch = null;
  cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', e => {
    if (!touch || !run) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch = null;
    if (Math.hypot(dx, dy) < 24) { if (!rollTap()) move(e.clientX < W / 2 ? -1 : 1); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else rollTap();
  });
  addEventListener('keydown', e => {
    if (!run) return;
    if (e.key === 'ArrowLeft') { if (!rollTap()) move(-1); } else if (e.key === 'ArrowRight') { if (!rollTap()) move(1); }
    else if (e.key === 'ArrowUp') jump(); else if (e.key === ' ') boost(); else if (e.key === 'ArrowDown') rollTap();
  });
  const move = d => { run.lane = Math.max(-1, Math.min(1, run.lane + d)); };
  function boost() {
    if (!run || run.boostsLeft <= 0 || run.boost >= 0) return;
    run.boostsLeft--;
    run.boost = 0;
    hud();
  }
  document.getElementById('boost').addEventListener('click', e => { e.stopPropagation(); boost(); });

  // judging: a note taken near its beat sounds (on its beat when that is still to come), and counts
  function take(m, midi, at, off) {
    Music.play(midi, 0.55, run.start + at);
    run.played++;
    run.combo++;
    const q = Math.abs(off) <= WIN.perfect ? '完美！' : '很棒！';
    run.says.push({ text: run.combo >= 5 ? `${q} ${run.combo} 連擊` : q, t: 0 });
    run.flash.push({ x: m.lane, t: 0, c: hue(midi) });
    hud();
  }
  function jump() {
    if (run.jump >= 0) return;
    run.jump = 0;
    const now = songT(), m = run.marks.find(m => m.type === 'jump' && !m.done && Math.abs(m.t - now) <= WIN.good + 0.05);
    if (m) { m.done = true; take(m, m.midi, m.t, m.t - now); }
  }
  function rollTap() { // a tap while a roll passes: its next note
    const now = songT(), m = run.marks.find(m => m.type === 'roll' && now >= m.t - WIN.good && now <= m.t1 + WIN.good);
    if (!m) return false;
    const n = m.notes.find(n => !n.hit);
    if (n) { n.hit = true; take(m, n.midi, Math.max(now, n.t - WIN.good), 0); }
    return true;
  }

  function step(dt) {
    const now = songT();
    run.x += (run.lane - run.x) * Math.min(1, dt * 14); // a quick slide to its lane
    if (run.jump >= 0 && (run.jump += dt) > 0.62) run.jump = -1;
    if (run.boost >= 0 && (run.boost += dt) > BOOST_S) run.boost = -1;
    // a pounce every half bar (8 sixteenths), in time with the music
    run.frame = Math.max(0, now) / (8 * run.s16) * (frames.length || 1);
    run.dist += SCROLL * dt;
    // the accompaniment, a little ahead on the audio clock
    while (run.sched < run.backs.length && run.backs[run.sched].t < now + 0.25) {
      const b = run.backs[run.sched++];
      for (const m of b.midi) Music.play(m, 0.2, run.start + b.t);
    }
    // the lead: each note judged as it comes by
    for (const m of run.marks) {
      if (m.done) continue;
      if (m.type === 'roll') {
        if (run.boost >= 0) for (const n of m.notes) if (!n.hit && Math.abs(n.t - now) < 0.03) { n.hit = true; take(m, n.midi, n.t, 0); }
        if (now > m.t1 + WIN.good) { m.done = true; if (m.notes.some(n => !n.hit)) run.combo = 0; }
        continue;
      }
      const off = m.t - now;
      if (run.boost >= 0 && off <= 0.02) { m.done = true; take(m, m.midi, m.t, 0); continue; } // ⚡: plays itself
      if (m.type === 'eat' && Math.abs(off) <= WIN.good && Math.abs(run.x - m.lane) < 0.5) { m.done = true; take(m, m.midi, m.t, off); continue; }
      if (off < -WIN.good) { m.done = true; m.missed = true; run.combo = 0; } // gone by: silent, the music goes on
    }
    while (run.trees.length < 26) run.trees.push({ side: Math.random() < 0.5 ? -1 : 1, off: 1.9 + Math.random() * 1.6, z: (run.trees.at(-1)?.z ?? 0) + 2 + Math.random() * 4, k: 0.8 + Math.random() * 0.6 });
    for (const tr of run.trees) tr.z -= SCROLL * dt;
    run.trees = run.trees.filter(tr => tr.z > -CAM * 0.8);
    for (const f of run.flash) f.t += dt;
    run.flash = run.flash.filter(f => f.t < 0.4);
    for (const s of run.says) s.t += dt;
    run.says = run.says.filter(s => s.t < 0.7).slice(-2);
    if (now > run.length + 1.5) end();
  }

  // drawing
  const zOf = t => (t - songT()) * SCROLL;
  function draw() {
    const now = Math.max(0, songT()), b = BIOMES[Math.floor(now / STRETCH) % BIOMES.length], hy = horizon();
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
    for (let z = -(run.dist % 4); z < FAR; z += 4) for (const x of [-0.5, 0.5]) {
      const a = project(x, z), c = project(x, z + 1.6);
      g.beginPath(); g.moveTo(a.x - 3 * a.s, a.y); g.lineTo(a.x + 3 * a.s, a.y); g.lineTo(c.x + 3 * c.s, c.y); g.lineTo(c.x - 3 * c.s, c.y); g.fill();
    }
    // the line where notes are taken
    const a = project(-1.6, 0), c = project(1.6, 0);
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke(); g.setLineDash([]);
    // far to near: trees, notes, then the fox
    const items = run.trees.map(tr => ({ z: tr.z, d: () => tree(tr, b) }));
    for (const m of run.marks) {
      if (m.type === 'roll') { const z0 = zOf(m.t), z1 = zOf(m.t1); if (z1 > -2 && z0 < FAR) items.push({ z: Math.max(z0, 0), d: () => roll(m, z0, z1) }); continue; }
      if ((m.done && !m.missed) || (m.missed && zOf(m.t) < -3)) continue;
      const z = zOf(m.t); if (z < FAR && z > -3) items.push({ z, d: () => note(m, z) });
    }
    items.sort((p, q) => q.z - p.z);
    for (const it of items) if (it.z > 0.3) it.d();
    fox();
    for (const it of items) if (it.z <= 0.3) it.d();
    for (const f of run.flash) { const p = project(f.x, 0); g.globalAlpha = 0.45 * (1 - f.t / 0.4); g.fillStyle = f.c; g.beginPath(); g.arc(p.x, p.y - H * 0.2, 16 + f.t * 90, 0, 7); g.fill(); g.globalAlpha = 1; }
    for (const s of run.says) { // 完美 / 很棒, rising and fading
      g.globalAlpha = 1 - s.t / 0.7; g.font = `900 ${Math.round(H * 0.035)}px sans-serif`; g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeText(s.text, W / 2, H * 0.5 - s.t * 60); g.fillStyle = '#ff7a3d'; g.fillText(s.text, W / 2, H * 0.5 - s.t * 60);
      g.globalAlpha = 1;
    }
    if (run.boost >= 0) { g.fillStyle = '#fff6'; for (let k = 0; k < 14; k++) { const x = (k * 137 + run.dist * 40) % W; g.fillRect(x, H * 0.4 + (k * 61) % (H * 0.5), 3, 40); } }
    document.getElementById('timeBar').style.width = Math.max(0, 100 - now / run.length * 100) + '%';
  }
  function tree(tr, b) {
    const p = project(tr.side * tr.off, tr.z), s = p.s * laneW() * tr.k;
    g.fillStyle = '#8a5c3a'; g.fillRect(p.x - s * 0.08, p.y - s * 0.5, s * 0.16, s * 0.5);
    g.fillStyle = b.tree[1]; g.beginPath(); g.arc(p.x, p.y - s * 0.75, s * 0.42, 0, 7); g.fill();
    g.fillStyle = b.tree[0]; g.beginPath(); g.arc(p.x - s * 0.08, p.y - s * 0.85, s * 0.32, 0, 7); g.fill();
  }
  function glyph(x, y, r, c, alpha = 1) { // a glowing ♪
    g.globalAlpha = alpha;
    const gl = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    gl.addColorStop(0, '#ffffffcc'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
    g.fillStyle = c; g.strokeStyle = '#4a3a2a'; g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath(); g.ellipse(x - r * 0.2, y + r * 0.55, r * 0.5, r * 0.36, -0.4, 0, 7); g.fill(); g.stroke(); // its head
    g.fillRect(x + r * 0.22, y - r * 1.1, r * 0.16, r * 1.65);                                             // its stem
    g.beginPath(); g.moveTo(x + r * 0.38, y - r * 1.1); g.quadraticCurveTo(x + r * 1.1, y - r * 0.7, x + r * 0.8, y - r * 0.15);
    g.quadraticCurveTo(x + r * 0.9, y - r * 0.6, x + r * 0.38, y - r * 0.7); g.fill();               // its flag
    g.globalAlpha = 1;
  }
  function note(m, z) {
    const p = project(m.lane, z), u = laneW() * p.s, fade = m.missed ? 0.3 : 1;
    if (m.type === 'jump') { // high up, across the road: jump for it
      const y = p.y - u * 1.0;
      g.globalAlpha = fade; g.strokeStyle = '#ffd34d'; g.lineWidth = Math.max(2, 6 * p.s);
      g.beginPath(); g.arc(p.x, y, u * 0.42, 0, 7); g.stroke();
      g.fillStyle = '#ffd34d'; g.font = `900 ${Math.round(u * 0.3)}px sans-serif`; g.textAlign = 'center'; g.fillText('⤴', p.x, y - u * 0.5);
      glyph(p.x, y, u * 0.24, hue(m.midi), fade);
      return;
    }
    glyph(p.x, p.y - u * 0.45 + Math.sin(songT() * 6 + m.t) * u * 0.04, u * 0.16, hue(m.midi), fade);
  }
  function roll(m, z0, z1) { // a ribbon down the middle, its notes on it; tap, tap, tap as it passes
    const pts = [];
    for (let k = 0; k <= 12; k++) { const z = Math.max(-1, z0) + (Math.min(FAR, z1) - Math.max(-1, z0)) * k / 12; pts.push(project(0, z)); }
    g.fillStyle = '#ffb34766'; g.beginPath();
    pts.forEach((p, k) => { const w = laneW() * p.s * 0.45; k ? g.lineTo(p.x - w, p.y) : g.moveTo(p.x - w, p.y); });
    [...pts].reverse().forEach(p => { const w = laneW() * p.s * 0.45; g.lineTo(p.x + w, p.y); });
    g.closePath(); g.fill();
    for (const n of m.notes) {
      if (n.hit) continue;
      const z = zOf(n.t); if (z < -1 || z > FAR) continue;
      const p = project(0, z); glyph(p.x, p.y - laneW() * p.s * 0.3, laneW() * p.s * 0.1, hue(n.midi));
    }
    if (z0 < 4 && z1 > -1) { // passing now
      g.font = `900 ${Math.round(H * 0.04)}px sans-serif`; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#fff';
      g.strokeText('連打！點點點！', W / 2, H * 0.42); g.fillStyle = '#ff7a3d'; g.fillText('連打！點點點！', W / 2, H * 0.42);
    }
  }
  function fox() {
    const p = project(run.x, 0), size = Math.min(W * 0.5, H * 0.34);
    const air = run.jump >= 0 ? Math.sin(Math.PI * run.jump / 0.62) : 0;
    g.fillStyle = '#0002'; g.beginPath(); g.ellipse(p.x, p.y, size * 0.2 * (1 - air * 0.3), size * 0.05, 0, 0, 7); g.fill();
    const f = frames[Math.floor(run.frame) % (frames.length || 1)];
    if (!f || !f.complete || !f.naturalWidth) return;
    // pouncing on: up through the first half of the loop, down through the second
    const u = (run.frame % (frames.length || 24)) / (frames.length || 24);
    const hop = run.jump >= 0 ? 0 : pouncing ? Math.sin(Math.PI * u) : Math.abs(Math.sin(u * Math.PI * 4));
    g.save();
    g.translate(p.x, p.y - air * size * 0.45 - hop * size * (pouncing ? 0.14 : 0.07));
    if (run.boost >= 0) { g.shadowColor = '#ffb347'; g.shadowBlur = 30; }
    g.drawImage(f, -size / 2, -size * 449 / 480, size, size); // (feet at y 449 of 480 in the clip's frames)
    g.restore();
  }

  const hue = midi => `hsl(${(midi * 47) % 360}, 85%, 62%)`; // a colour for each pitch
  const done = () => Math.round(run.played / Math.max(1, run.total) * 100);
  function hud() {
    document.getElementById('orbs').textContent = `${done()}%`;
    document.getElementById('boostLeft').textContent = `還有 ${run.boostsLeft} 次`;
    document.getElementById('boost').disabled = run.boostsLeft <= 0;
  }
  let raf = 0;
  function loop() {
    if (run) {
      const t = performance.now() / 1000, dt = Math.max(0, Math.min(0.05, t - (loop.last || t)));
      loop.last = t;
      step(dt);
      if (run) draw();
    }
    raf = requestAnimationFrame(loop);
  }
  function start() {
    Music.unlock(); // (on the tap: sound may start now)
    run = fresh();
    loop.last = 0;
    document.getElementById('start').hidden = document.getElementById('end').hidden = true;
    hud();
  }
  function end() {
    const pct = done(), stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0, name = run.name;
    run = null;
    document.getElementById('final').textContent = `${pct}%`;
    document.getElementById('piece').textContent = `《${name}》`;
    document.getElementById('endNote').textContent = `${'⭐'.repeat(stars) || '再試一次就會更好！'}　${tails} 條尾巴 = ${tails} 次⚡`;
    document.getElementById('end').hidden = false;
  }
  document.getElementById('go').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('home').addEventListener('click', () => { location.href = 'index.html'; });
  // the first frame behind the start card
  run = fresh(); draw(); run = null;
  raf = requestAnimationFrame(loop);
})();

/* 狐火奔跑 — a rhythm run through the forest behind the fox (a prototype).
   A classical piece plays all the way through (music.js): its accompaniment on its own, its lead laid on the road
   as notes, each where it falls in the music — the road moves with the music's own clock, so a note reaches the
   fox on its beat. Taken on its beat, a note sounds; missed, that note is silent but the music goes on, and the
   run is scored by how much of the tune was played (完成度).
   Three keys along the bottom, one a lane: 吃 — the note's key as it comes (the fox goes to that lane); 滑行 — a
   ribbon of quick notes: tap, tap, tap (any key) while it passes, each tap the next note, the fox gliding; 跳 —
   all three keys at once, for the accents and the notes that end a phrase.
   The way is set with things in it, and the notes are the way past them: rocks in the other lanes as a note comes
   (follow the notes and they are dodged), a log across the road at a jump, a low bough over a glide (gliding,
   tapping, the fox ducks under). Running into one is only a stumble.
   Laid out to be won: wide timing, never a note right after a jump or too close to the last one to reach (those
   play themselves), and a miss costs only its own note.
   World: x in lanes (-1, 0, 1; the edges ±1.6), z ahead of the fox; seen from just behind it. */
(function () {
  const SCROLL = 9;                      // road speed (z a second): the music's time × this is where a note lies
  const LEAD_IN = 3;                     // seconds before the music starts: the first notes come from afar
  const WIN = { perfect: 0.08, good: 0.18 }; // how near its beat a note may be taken, seconds
  const CHORD = 0.15;                    // three keys within this = pressed together (a jump)
  const SPACING = { note: 0.2, afterJump: 0.4, jumps: 1 }; // the least time before a note / after a jump / between jumps
  const FAR = 70, CAM = 7;               // the far end of the road; camera depth (projection)
  const params = new URLSearchParams(location.search);
  const BIOMES = [ // a stretch each, in turn
    { sky: ['#bfe6ff', '#eaf7ff'], ground: '#9fd486', road: '#e9d29c', edge: '#7cc35f', tree: ['#5fb54d', '#3f8f3a'], name: 'meadow' },
    { sky: ['#ffd9ec', '#fff3f8'], ground: '#a6dc84', road: '#f1dcae', edge: '#86c867', tree: ['#ff9ec4', '#e8709d'], name: 'flowers' },
    { sky: ['#b5ecff', '#e8fbff'], ground: '#8fd3c7', road: '#cfe7f0', edge: '#5fb3b0', tree: ['#4fae8a', '#2f7a65'], name: 'creek' },
    { sky: ['#1d2550', '#3a3f7a'], ground: '#2f5a4a', road: '#5a5f7a', edge: '#244538', tree: ['#2e6b52', '#1b4436'], name: 'night' },
    { sky: ['#dfeaf5', '#ffffff'], ground: '#eef4fa', road: '#d6e0ea', edge: '#c7d6e6', tree: ['#7fae9a', '#4f7f6c'], name: 'snow' },
  ];
  const STRETCH = 15; // seconds a biome
  const LANE_COLOURS = ['#ff9f6b', '#ffd34d', '#7cc7ff']; // left, middle, right: the keys and their lanes

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
  // (the road ends a little above the keys)
  const horizon = () => H * 0.28, ground0 = () => H * 0.8, laneW = () => Math.min(W * 0.28, H * 0.2);
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

  // a piece into a chart (seconds): the lead's notes to take — quick runs as glides, accents and phrase ends as
  // jumps, the rest by pitch to a lane — and what plays itself: the accompaniment, and the lead notes too close to
  // reach (grace notes, a note hard on a jump or on the one before)
  function chart(song) {
    const lead = Music.parse(song.lead), back = Music.parse(song.back), s16 = song.sixteenth, bar = song.bar || 16;
    const marks = [], backs = [], ps = lead.notes.map(n => n.midi[0]), low = Math.min(...ps), high = Math.max(...ps);
    const auto = (t, midi) => backs.push({ t, midi: [midi], lead: true });
    let lastJump = -9;
    for (let k = 0; k < song.times; k++) {
      const off = k * lead.length;
      for (const n of back.notes) backs.push({ t: (off + n.t) * s16, midi: n.midi });
      const ns = lead.notes;
      for (let i = 0; i < ns.length;) {
        let j = i; while (j < ns.length && ns[j].len <= 1 && !ns[j].jump) j++;
        if (j - i >= 3) { // a run of quick notes: a glide, tap tap tap
          marks.push({ type: 'roll', t: (off + ns[i].t) * s16, t1: (off + ns[j - 1].t + 1) * s16, lane: 0,
            notes: ns.slice(i, j).map(n => ({ t: (off + n.t) * s16, midi: n.midi[0], hit: false })) });
          i = j; continue;
        }
        const n = ns[i], t = (off + n.t) * s16, prev = marks.at(-1), midi = n.midi[0];
        i++;
        const since = prev ? t - (prev.t1 || prev.t) : 9;
        if (n.len < 1 || since < SPACING.note || (prev?.type === 'jump' && since < SPACING.afterJump)) { auto(t, midi); continue; }
        // a jump: marked, or a held note that ends a phrase (every second bar) — not two close together
        const endsPhrase = n.len >= 4 && (n.t + n.len) % (bar * 2) === 0;
        if ((n.jump || endsPhrase) && t - lastJump >= SPACING.jumps) {
          marks.push({ type: 'jump', t, midi, lane: 0 });
          lastJump = t;
          continue;
        }
        const lane = Math.round(((midi - low) / Math.max(1, high - low)) * 2 - 1); // higher to the right
        marks.push({ type: 'eat', t, midi, lane });
      }
    }
    // the things in the way, each where a note shows the way past it
    const things = [];
    let lastRock = -9;
    for (const m of marks) {
      if (m.type === 'jump') things.push({ type: 'log', t: m.t });
      else if (m.type === 'roll') things.push({ type: 'bough', t: m.t, t1: m.t1 });
      else if (m.t - lastRock > 1.2 && Math.random() < 0.5) { // a rock (or a stump) in a lane the note isn't in
        things.push({ type: Math.random() < 0.7 ? 'rock' : 'stump', t: m.t, lane: pick([-1, 0, 1].filter(l => l !== m.lane)) });
        lastRock = m.t;
      }
    }
    const total = marks.reduce((a, m) => a + (m.type === 'roll' ? m.notes.length : 1), 0);
    backs.sort((a, b) => a.t - b.t);
    return { marks, backs, things, total, length: lead.length * song.times * s16, name: song.name, s16 };
  }

  // game state
  let run = null;
  const fresh = () => {
    const c = chart(Music.SONGS[+params.get('song')] || pick(Music.SONGS)); // (?song=n: that one)
    return { ...c, start: Music.now() + LEAD_IN, sched: 0, lane: 0, x: 0, jump: -1, glide: false,
      played: 0, combo: 0, frame: 0, flash: [], says: [], trees: [], dist: 0, presses: [], tapped: -9, stumble: -1 };
  };
  const songT = () => Music.now() - run.start;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // the three keys (and A / S / D or ← ↓ → on a computer; space = all three)
  const keys = [...document.querySelectorAll('.key')];
  function press(lane) {
    if (!run) return;
    const now = songT(), key = keys[lane + 1];
    key?.classList.add('down');
    setTimeout(() => key?.classList.remove('down'), 110);
    run.tapped = now;
    // a glide passing: any key is its next note
    const roll = run.marks.find(m => m.type === 'roll' && now >= m.t - WIN.good && now <= m.t1 + WIN.good);
    if (roll) {
      const n = roll.notes.find(n => !n.hit);
      if (n) { n.hit = true; take(roll, n.midi, Math.max(now, n.t - WIN.good), 0); }
      return;
    }
    // three together: a jump
    run.presses = run.presses.filter(p => now - p.t < CHORD);
    run.presses.push({ t: now, lane });
    if (new Set(run.presses.map(p => p.lane)).size === 3) { run.presses = []; return jump(now); }
    // a key: to that lane, and the note there if one is on its beat
    run.lane = lane;
    const m = run.marks.find(m => m.type === 'eat' && !m.done && m.lane === lane && Math.abs(m.t - now) <= WIN.good);
    if (m) { m.done = true; take(m, m.midi, m.t, m.t - now); }
  }
  function jump(now) {
    if (run.jump < 0) run.jump = 0;
    const m = run.marks.find(m => m.type === 'jump' && !m.done && Math.abs(m.t - now) <= WIN.good + 0.05);
    if (m) { m.done = true; take(m, m.midi, m.t, m.t - now); }
  }
  keys.forEach((k, i) => k.addEventListener('pointerdown', e => { e.preventDefault(); press(i - 1); }));
  addEventListener('keydown', e => {
    if (!run || e.repeat) return;
    const lane = { a: -1, s: 0, d: 1, ArrowLeft: -1, ArrowDown: 0, ArrowRight: 1 }[e.key];
    if (lane != null) press(lane);
    else if (e.key === ' ') { press(-1); press(0); press(1); }
  });

  function bump() { if (run.stumble < 0) run.stumble = 0; run.says.push({ text: '哎呀！', t: 0 }); }
  // a note taken near its beat sounds (on its beat when that is still to come), and counts
  function take(m, midi, at, off) {
    Music.play(midi, 0.55, run.start + at);
    run.played++;
    run.combo++;
    const q = Math.abs(off) <= WIN.perfect ? '完美！' : '很棒！';
    run.says.push({ text: run.combo >= 5 ? `${q} ${run.combo} 連擊` : q, t: 0 });
    run.flash.push({ x: m.lane, t: 0, c: hue(midi) });
    hud();
  }

  function step(dt) {
    const now = songT();
    run.glide = run.marks.some(m => m.type === 'roll' && now >= m.t - 0.1 && now <= m.t1 + 0.1);
    if (run.glide) run.lane = 0; // (a glide runs down the middle)
    run.x += (run.lane - run.x) * Math.min(1, dt * 16); // a quick slide to its lane
    if (run.jump >= 0 && (run.jump += dt) > 0.62) run.jump = -1;
    // a pounce every half bar (8 sixteenths), in time with the music
    run.frame = Math.max(0, now) / (8 * run.s16) * (frames.length || 1);
    run.dist += SCROLL * dt;
    // what plays itself, a little ahead on the audio clock
    while (run.sched < run.backs.length && run.backs[run.sched].t < now + 0.25) {
      const b = run.backs[run.sched++];
      for (const m of b.midi) Music.play(m, b.lead ? 0.4 : 0.2, run.start + b.t);
    }
    // the things in the way, as they reach the fox: past them, or a stumble (no more than that)
    if (run.stumble >= 0 && (run.stumble += dt) > 0.6) run.stumble = -1;
    const air = run.jump >= 0 ? Math.sin(Math.PI * run.jump / 0.62) : 0, ducking = now - run.tapped < 0.4;
    for (const o of run.things) {
      if (o.met || now < o.t) continue;
      if (o.type === 'bough') { if (now > o.t1) o.met = true; else if (!ducking && !o.bumped) { o.bumped = true; bump(); } continue; }
      o.met = true;
      const past = o.type === 'log' ? air > 0.25 : Math.abs(run.x - o.lane) > 0.5;
      if (!past) { o.smash = 0; bump(); }
    }
    // the lead's notes gone by untaken: silent, the music goes on
    for (const m of run.marks) {
      if (m.done) continue;
      if (m.type === 'roll') { if (now > m.t1 + WIN.good) { m.done = true; if (m.notes.some(n => !n.hit)) run.combo = 0; } continue; }
      if (m.t - now < -WIN.good) { m.done = true; m.missed = true; run.combo = 0; }
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
    // the road, bending down with the ground, its lanes tinted like their keys
    const zs = []; for (let k = 0; k <= 30; k++) zs.push(-CAM * 0.6 + (FAR + CAM * 0.6) * (k / 30) ** 1.6);
    const edge = x => zs.map(z => project(x, z)), left = edge(-1.6), right = edge(1.6);
    const band = (a, c) => { g.beginPath(); a.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); [...c].reverse().forEach(p => g.lineTo(p.x, p.y)); g.closePath(); g.fill(); };
    g.fillStyle = b.road; band(left, right);
    [-1, 0, 1].forEach((l, k) => { g.fillStyle = LANE_COLOURS[k] + '22'; band(edge(l - 0.5), edge(l + 0.5)); });
    g.strokeStyle = b.edge; g.lineWidth = 6;
    for (const side of [left, right]) { g.beginPath(); side.forEach((p, k) => k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    // where notes are taken: a ring in each lane, its key's colour
    [-1, 0, 1].forEach((l, k) => {
      const p = project(l, 0), u = laneW() * p.s;
      g.strokeStyle = LANE_COLOURS[k]; g.lineWidth = 4; g.beginPath(); g.ellipse(p.x, p.y, u * 0.3, u * 0.09, 0, 0, 7); g.stroke();
    });
    // far to near: trees, notes, then the fox
    const items = run.trees.map(tr => ({ z: tr.z, d: () => tree(tr, b) }));
    for (const o of run.things) {
      if (o.type === 'bough') { for (let t = o.t; t <= o.t1 + 0.01; t += 0.25) { const z = zOf(t); if (z > -2 && z < FAR) items.push({ z, d: () => bough(z, b) }); } continue; }
      const z = zOf(o.t); if (z > -3 && z < FAR) items.push({ z: z + 0.01, d: () => obstacle(o, z, b) });
    }
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
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeText(s.text, W / 2, H * 0.45 - s.t * 60); g.fillStyle = '#ff7a3d'; g.fillText(s.text, W / 2, H * 0.45 - s.t * 60);
      g.globalAlpha = 1;
    }
    document.getElementById('timeBar').style.width = Math.max(0, 100 - now / run.length * 100) + '%';
  }
  function tree(tr, b) {
    const p = project(tr.side * tr.off, tr.z), s = p.s * laneW() * tr.k;
    g.fillStyle = '#8a5c3a'; g.fillRect(p.x - s * 0.08, p.y - s * 0.5, s * 0.16, s * 0.5);
    g.fillStyle = b.tree[1]; g.beginPath(); g.arc(p.x, p.y - s * 0.75, s * 0.42, 0, 7); g.fill();
    g.fillStyle = b.tree[0]; g.beginPath(); g.arc(p.x - s * 0.08, p.y - s * 0.85, s * 0.32, 0, 7); g.fill();
  }
  function obstacle(o, z, b) {
    if (o.smash != null) { g.globalAlpha = Math.max(0, 1 - (o.smash += 0.06)); }
    g.strokeStyle = '#4a3a2a';
    if (o.type === 'log') { // across the road: jump it
      const a = project(-1.5, z), c = project(1.5, z), u = laneW() * a.s;
      g.lineWidth = Math.max(1.5, 3 * a.s); g.fillStyle = '#a8744a';
      g.beginPath(); g.roundRect(a.x, a.y - u * 0.22, c.x - a.x, u * 0.22, u * 0.11); g.fill(); g.stroke();
      g.fillStyle = '#e3b98a'; g.beginPath(); g.ellipse(c.x, c.y - u * 0.11, u * 0.06, u * 0.11, 0, 0, 7); g.fill(); g.stroke();
    } else {
      const p = project(o.lane, z), u = laneW() * p.s;
      g.lineWidth = Math.max(1.5, 3 * p.s);
      if (o.type === 'rock') {
        g.fillStyle = b.name === 'snow' ? '#e9eef5' : '#b9b6ad';
        g.beginPath(); g.ellipse(p.x, p.y - u * 0.2, u * 0.36, u * 0.28, 0, Math.PI, 0); g.lineTo(p.x + u * 0.36, p.y); g.lineTo(p.x - u * 0.36, p.y); g.closePath(); g.fill(); g.stroke();
      } else {
        g.fillStyle = '#9b6a43'; g.beginPath(); g.roundRect(p.x - u * 0.24, p.y - u * 0.32, u * 0.48, u * 0.32, u * 0.05); g.fill(); g.stroke();
        g.fillStyle = '#e3b98a'; g.beginPath(); g.ellipse(p.x, p.y - u * 0.32, u * 0.24, u * 0.07, 0, 0, 7); g.fill(); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  function bough(z, b) { // a low bough over the road, all along a glide: duck under
    const a = project(-1.6, z), c = project(1.6, z), u = laneW() * a.s, y = a.y - u * 0.62;
    g.fillStyle = '#8a5c3a'; g.fillRect(a.x, y - u * 0.05, c.x - a.x, u * 0.1);
    g.fillStyle = b.tree[0];
    for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(a.x + (c.x - a.x) * (k + 0.5) / 7, y - u * 0.04, u * 0.13, 0, 7); g.fill(); }
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
    if (m.type === 'jump') { // a bar across all three lanes, a big note over it: all three keys
      const a = project(-1.5, z), c = project(1.5, z);
      g.globalAlpha = fade; g.strokeStyle = '#ffb347'; g.lineWidth = Math.max(3, 10 * p.s); g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y - u * 0.15); g.lineTo(c.x, c.y - u * 0.15); g.stroke(); g.lineCap = 'butt';
      g.globalAlpha = 1;
      glyph(p.x, p.y - u * 0.85, u * 0.26, hue(m.midi), fade);
      return;
    }
    glyph(p.x, p.y - u * 0.45 + Math.sin(songT() * 6 + m.t) * u * 0.04, u * 0.16, LANE_COLOURS[m.lane + 1], fade);
  }
  function roll(m, z0, z1) { // a ribbon across the road, its notes on it; tap, tap, tap as it passes
    const pts = [];
    for (let k = 0; k <= 12; k++) { const z = Math.max(-1, z0) + (Math.min(FAR, z1) - Math.max(-1, z0)) * k / 12; pts.push(project(0, z)); }
    g.fillStyle = '#ffb34766'; g.beginPath();
    pts.forEach((p, k) => { const w = laneW() * p.s * 1.4; k ? g.lineTo(p.x - w, p.y) : g.moveTo(p.x - w, p.y); });
    [...pts].reverse().forEach(p => { const w = laneW() * p.s * 1.4; g.lineTo(p.x + w, p.y); });
    g.closePath(); g.fill();
    for (const n of m.notes) {
      if (n.hit) continue;
      const z = zOf(n.t); if (z < -1 || z > FAR) continue;
      const p = project(0, z); glyph(p.x, p.y - laneW() * p.s * 0.3, laneW() * p.s * 0.1, hue(n.midi));
    }
    if (z0 < 4 && z1 > -1) { // passing now
      g.font = `900 ${Math.round(H * 0.04)}px sans-serif`; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#fff';
      g.strokeText('滑行！一直點！', W / 2, H * 0.38); g.fillStyle = '#ff7a3d'; g.fillText('滑行！一直點！', W / 2, H * 0.38);
    }
  }
  function fox() {
    const p = project(run.x, 0), size = Math.min(W * 0.46, H * 0.3);
    const air = run.jump >= 0 ? Math.sin(Math.PI * run.jump / 0.62) : 0;
    g.fillStyle = '#0002'; g.beginPath(); g.ellipse(p.x, p.y, size * 0.2 * (1 - air * 0.3), size * 0.05, 0, 0, 7); g.fill();
    // gliding: low on the ground, held in its crouch (the first frame); else pouncing on — up through the first half
    // of the loop, down through the second
    const f = frames[run.glide ? 0 : Math.floor(run.frame) % (frames.length || 1)];
    if (!f || !f.complete || !f.naturalWidth) return;
    const u = (run.frame % (frames.length || 24)) / (frames.length || 24);
    const hop = run.jump >= 0 || run.glide ? 0 : pouncing ? Math.sin(Math.PI * u) : Math.abs(Math.sin(u * Math.PI * 4));
    g.save();
    g.translate(p.x, p.y - air * size * 0.5 - hop * size * (pouncing ? 0.14 : 0.07));
    if (run.glide) { g.rotate(Math.sin(songT() * 10) * 0.04); g.scale(1.1, 0.7); } // (low, a little sway as it glides under)
    if (run.stumble >= 0) g.rotate(Math.sin(run.stumble * 20) * 0.15);
    g.drawImage(f, -size / 2, -size * 449 / 480, size, size); // (feet at y 449 of 480 in the clip's frames)
    g.restore();
    if (run.glide) { g.fillStyle = '#fff8'; for (let k = 0; k < 6; k++) g.fillRect(p.x - size * 0.3 + k * size * 0.12, p.y + 4 + (k % 2) * 6, size * 0.06, 3); } // a skid
  }

  const hue = midi => `hsl(${(midi * 47) % 360}, 85%, 62%)`; // a colour for each pitch
  const done = () => Math.round(run.played / Math.max(1, run.total) * 100);
  function hud() { document.getElementById('orbs').textContent = `${done()}%`; }
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
    const pct = done(), stars = pct >= 85 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0, name = run.name;
    run = null;
    document.getElementById('final').textContent = `${pct}%`;
    document.getElementById('piece').textContent = `《${name}》`;
    document.getElementById('endNote').textContent = '⭐'.repeat(stars) || '再試一次就會更好！';
    document.getElementById('end').hidden = false;
  }
  document.getElementById('go').addEventListener('click', start);
  document.getElementById('again').addEventListener('click', start);
  document.getElementById('home').addEventListener('click', () => { location.href = 'index.html'; });
  // the first frame behind the start card
  run = fresh(); draw(); run = null;
  raf = requestAnimationFrame(loop);
})();

/* 小狐飛多遠 — a launch-and-bounce game (a prototype).
   The fox is flung off a bent branch (tap when the swing is high: the harder, the farther) and flies to the right.
   On the ground lie forest friends, and landing on one throws it on its own way: a rabbit bounces it (and runs ahead past two
   friends, knocking the first away, stopping by the second: off that one, a bunny bounce), a bear sends it high, a frog hops it along (and its next dive bounces
   high off the ground), an owl carries it, a boar runs it forward, a mushroom springs it up, a squirrel gives it a dash back —
   a hedgehog only slows it. Its tails are its dashes, one each: a tap while rising, off up and on at a slant; a tap while falling is a
   dive down at a slant (onto the next friend), free. It bounces on the plain ground less and less, rolls, and stops: that's how far.
   Stars in the air on the way (more the higher it flies) go home with it (with the farthest it has gone, kept in the pet's own save); every
   SUPER of them caught, the next friend it lands on is a super bounce, off far and high.
   Flung high enough (SKY.height), it goes up onto the clouds: a run along a cloud road, seen from behind (left /
   right for a lane, stars on them), bounding along, SKY.run m of it, then a leap off its end and, through black,
   down onto a giraffe, flying on.
   World: x metres along, y metres up (the ground at 0), seen from the side.
   It plays in a layer of its own, landscape only (fullscreen and locked where the phone lets it; held upright, it
   asks to be turned), on a stage of one fixed size and shape (STAGE, 16:9) scaled to fit the screen, so every
   phone sees the same stretch of the world; opened by the pet (app.js: Fling.open with its tails, farthest and what to
   do with the stars it brings home) or on a page of its own (fling.html). */
(function () {
  const params = new URLSearchParams(location.search);
  // the look: the sunny day (B01), or Halloween night (B03: pumpkins, a dark forest, the moon, now and then bats
  // flying by far off) — Halloween from mid-October to its day; ?bg=day / ?bg=halloween to pick
  const LOOKS = {
    day: { dir: 'assets/bg', lip: 0.25, sky: ['#8fd0ff', '#e6f6ff'], soil: '#9b7653', clouds: ['#8fd0ff', '#ffe6f2', '#e9e4ff'] },
    halloween: { dir: 'assets/bg/halloween', lip: 0.64, tree: { cx: 0.539, cut: 0.326, w: 0.28 }, friends: 'assets/friends/halloween', sky: ['#1b1440', '#4b3a7a'], soil: '#3b2638', clouds: ['#1b1440', '#6a4f96', '#3a2f6e'], night: true },
  };
  const LOOK = LOOKS[params.get('bg')] || (() => {
    const d = new Date(), m = d.getMonth(), day = d.getDate();
    return m === 9 && day >= 15 ? LOOKS.halloween : LOOKS.day;
  })();
  const G = 20;                        // gravity, m/s²
  // the fling: the fox pulled back on the little tree's top (dragged from anywhere), let go to fly the other way —
  // how far it's pulled the speed (min..max m/s), the way it's pulled the angle (within deg, up and to the right)
  const PULL = { rest: [0, 2.4], max: 2.6, least: 0.35, deg: [5, 80] };
  const LAUNCH = { min: 12, max: 42 };
  const DASH = { up: [6, 8], down: [2, -16] };     // up: a tail's dash [vx +, vy +]; down: a dive, as many as it likes [vx + (once a dive), vy at least]
  const DIVE_BOOST = 1.3;                          // diving onto a friend: its throw this much stronger
  const GROUND = { keep: 0.42, drag: 0.72, roll: 9 }; // a plain bounce keeps this of vy, this of vx; rolling slows by roll m/s²
  // how hard each extra throw is, over a tail's dash (DASH.up, ~10 m/s): a super bounce (stars) = a bunny bounce (the
  // friend a rabbit ran ahead to) > a combo (onto a friend from a friend, the ground not touched between) > a tail
  const SUPER = { stars: 10, vx: 10, vy: 26 };     // stars for a super bounce; what it adds to vx (at least 18), vy (to)
  const COMBO = 13;                                // a combo: this many m/s more, on the way the friend throws it
  const RABBIT = { run: 16, by: 1.4 };             // landed on, a rabbit runs ahead (at least this fast, m/s) to stand by the next friend
  // a frog landed on: the next dive onto the plain ground (only a dive) springs back, keeping this of its fall and at
  // least up m/s (6 m high) — once, then it takes another frog (two frogs before it are still once)
  const FROG = { keep: 0.6, up: 16 };
  const CAM = { metres: 7, least: 0.56 };          // the screen's height in metres on the ground; drawn smaller as the fox climbs, down to this of it; above, an arrow
  // stars: a column every step m, a chance in each band m — more the higher, and none above what the screen shows zoomed out
  const STARS = { step: 4, band: 1.5, low: 1.5, top: 0.84 * CAM.metres / CAM.least * (1 - 0.2 / 0.84) - 0.6 };
  // up past height m: off up onto the clouds, a run of run m along a cloud road (the fox seen from behind, three
  // lanes, stars on them), at speed m/s; at its end down off the cloud from drop m, onto a giraffe, and on
  const SKY = { height: 25, run: 500, speed: 40, drop: 22, hop: 0.7, intro: 0.8 }; // (hop: s a bound along the clouds; intro: s out of the cloud, up and down onto it, before the run)
  const FADE = 1; // s: into and out of the clouds, through black (half out, half in)
  const FOX_H = 1.7;                   // the fox's drawn height, m
  // a throw at an angle (the bear's belly, the owl's carry, the giraffe's neck): all as strong, only the angle theirs —
  // the fox's own speed, at least min, and add more
  const THROW = { min: 20, add: 4 };
  const throwAt = (f, deg) => {
    const v = Math.max(Math.hypot(f.vx, f.vy), THROW.min) + THROW.add, a = deg * Math.PI / 180;
    f.vx = v * Math.cos(a); f.vy = v * Math.sin(a);
  };
  // the friends — h: how high it stands, m; w: how often; hit: what it does to the fox (and the fox's pose after);
  // (say: what it does, in words — for whoever reads this)
  const FRIENDS = {
    rabbit:   { e: '🐰', h: 0.9, w: 30, say: '彈一下，往前跑撞飛一隻、停在下一隻旁邊：碰到牠 BUNNY BOUNCE', hit: f => { f.vy = 10; f.vx = Math.max(f.vx, 8) + 1; return 'boing'; } },
    frog:     { e: '🐸', h: 0.7, w: 14, say: '連跳三下＋之後俯衝落地彈更高', hit: f => { f.vy = 7; f.vx += 1; f.hops = 3; return 'hop'; } },
    mushroom: { e: LOOK.night ? '🎃' : '🍄', h: 1.1, w: 10, say: '彈超高', hit: f => { f.vy = 19; f.vx += 2; return 'big'; } },
    bear:     { e: '🐻', h: 1.3, r: 1.1, w: 8, say: '挺著大肚子睡覺：65° 彈飛', draw: drawBear, hit: f => { throwAt(f, 65); return 'big'; } },
    owl:      { e: '🦉', h: 1.2, w: 8,  say: '抓著 25° 斜飛', hit: f => { throwAt(f, 25); f.glide = 1.2; return 'whoosh'; } },
    giraffe:  { e: '🦒', h: 2.7, w: 8,  say: '用脖子 45° 甩出去', draw: drawGiraffe, hit: f => { throwAt(f, 45); f.hold = NECK.hold; return 'fling'; } },
    boar:     { e: '🐗', h: 1.0, w: 10, say: '背著往前衝', hit: f => { f.vy = 0; f.vx = Math.max(f.vx, 16) + 3; f.ride = 1; return 'whoosh'; } },
    hedgehog: { e: '🦔', h: 0.7, w: 14, say: '踩到被絆倒、變慢（俯衝撲到才會彈高）', hit: f => { f.vx *= 0.55; f.vy = 4; return 'ouch'; } },
    squirrel: { e: '🐿️', h: 0.8, w: 9,  say: '彈一下＋補 1 次衝刺', hit: f => { f.vy = 10; f.vx = Math.max(f.vx, 8) + 1; return 'refill'; } },
  };
  const KINDS = Object.keys(FRIENDS), WSUM = KINDS.reduce((a, k) => a + FRIENDS[k].w, 0);
  const ONLY = FRIENDS[params.get('friend')] && params.get('friend'); // (?friend=squirrel: all of one kind, to try it)
  const pickKind = () => { if (ONLY) return ONLY; let r = Math.random() * WSUM; for (const k of KINDS) if ((r -= FRIENDS[k].w) < 0) return k; return 'rabbit'; };

  // its tails and its farthest: from whoever opens it (the pet), else (on its own page) this browser's own
  let TAILS = 1, best = 0, opts = {};

  // the layer: canvas, counters along the top, the end card (no instructions: it's found out by playing)
  const layer = document.createElement('div');
  layer.className = 'fl'; layer.hidden = true;
  layer.innerHTML = `<div class="fl-stage"><canvas></canvas>
    <div class="fl-hud"><span class="fl-pill fl-dist"><span data-k="dist">0</span> m</span>
      <span class="fl-pill fl-speed">💨 <span data-k="speed">0</span> km/h</span>
      <span class="fl-pill fl-stars" data-k="starPill"><b data-k="starIcon">⭐</b> <span data-k="stars">0</span><span class="fl-meter"><i data-k="meterBar"></i></span></span>
      <span class="fl-pill" data-k="frogPill" hidden>🐸</span>
      <div class="fl-tails" data-k="tails"></div><button class="fl-x" data-k="close" aria-label="回到小狐">✕</button></div>
    <div class="fl-card" data-k="end" hidden><div>
      <h1 data-k="endTitle">飛好遠！</h1>
      <div class="fl-big"><span data-k="final">0</span> m</div>
      <p data-k="endNote"></p>
      <button data-k="again">再飛一次</button><button class="fl-ghost" data-k="home">回到小狐</button>
    </div></div></div>
    <div class="fl-upright"><span>📱</span>把手機轉成橫的來玩！<button data-k="close2">回到小狐</button></div>`;
  const $ = k => layer.querySelector(`[data-k="${k}"]`);
  const STAR = LOOK.night ? '🍬' : '⭐'; // (what's caught along the way: on Halloween night, sweets)
  if (LOOK.night) { layer.classList.add('fl-night'); $('starIcon').textContent = STAR; }
  const STAGE = { w: 800, h: 450 };   // the game's own pixels; the stage is scaled to the screen whole, bars round it where the shape differs
  const stage = layer.querySelector('.fl-stage'), cv = layer.querySelector('canvas'), g = cv.getContext('2d');
  const W = STAGE.w, H = STAGE.h;
  let DPR = 1, zoom = 1;
  function resize() {
    if (layer.hidden) return;
    zoom = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(-50%, -50%) scale(${zoom})`;
    DPR = Math.min(3, (window.devicePixelRatio || 1) * zoom); // (drawn at the screen's own sharpness)
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize);
  const at = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; }; // (a touch, in stage pixels)

  // the fox's clips: run (facing right: on the ground, and its most stretched frame in the air), pounce (crouched
  // on the branch; stretched out diving), roll (tumbling off a friend), joy (flung high), ouch, cheer / happy (at the end)
  const CLIPS = { run: 'walk_r_loop_run', pounce: 'walk_r_to_pounce_r', roll: 'roll_loop', joy: 'jump_joy_loop',
    ouch: 'surprised_loop', cheer: 'cheer_loop', happy: 'happy_loop', up: 'back_crouch_to_back_air', down: 'back_air_to_back_crouch' };
  const A = {};
  for (const [k, clip] of Object.entries(CLIPS)) (async () => {
    const r = await fetch(`assets/fox/clips/${clip}/meta.json`).catch(() => null);
    if (!r?.ok) return;
    const m = await r.json();
    A[k] = m.frames.map(f => { const im = new Image(); im.src = `assets/fox/clips/${clip}/${f}?v=${m.rev || 1}`; return im; });
  })();
  const AIR = +params.get('air') || 10, DIVE = 7, CROUCH = [0, 4]; // (frames: run's stretched, pounce's dive, pounce's crouch)
  const frameOf = (k, t, fps = 16) => A[k]?.length ? A[k][Math.floor(t * fps) % A[k].length] : null;

  // sounds: little synth blips (no files)
  let ac = null;
  function blip(f0, f1, dur, type = 'sine', vol = 0.15) {
    if (!ac) return;
    const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v).connect(ac.destination); o.start(t); o.stop(t + dur);
  }
  const chime = (f, n, gap) => { for (let i = 0; i < n; i++) setTimeout(() => blip(f * (1 + i * 0.25), f * 1.5 * (1 + i * 0.25), 0.2), i * gap); };
  const SFX = {
    boing: () => blip(220, 660, 0.25), hop: () => blip(400, 800, 0.12), big: () => blip(120, 520, 0.45, 'triangle', 0.25),
    whoosh: () => blip(900, 300, 0.4, 'triangle'), fling: () => { blip(150, 700, 0.35, 'triangle', 0.22); blip(1200, 400, 0.4, 'triangle', 0.08); }, ouch: () => blip(500, 150, 0.3, 'square', 0.08),
    star: () => blip(1200 + Math.random() * 600, 2400, 0.08, 'sine', 0.08), dash: () => blip(300, 1200, 0.3, 'sawtooth', 0.08), dive: () => blip(1000, 250, 0.2, 'triangle', 0.1),
    thud: () => blip(160, 60, 0.15, 'sine', 0.2), refill: () => { blip(220, 660, 0.25); chime(990, 2, 90); }, best: () => chime(660, 3, 120), ready: () => chime(880, 4, 80),
    super: () => { blip(100, 900, 0.7, 'sawtooth', 0.12); chime(660, 5, 90); },
  };

  let S = null; // the run
  const fresh = () => ({
    phase: 'aim', t: 0, power: 0, pull: { x: 0, y: 0 }, drag: null, spring: null,
    fox: { x: PULL.rest[0], y: PULL.rest[1], vx: 0, vy: 0, spin: 0, glide: 0, ride: 0, hops: 0, still: 0, dash: 0, dive: false, act: null, rainbow: 0 },
    tails: TAILS, combo: 0, frog: false, friends: [], stars: [], nextFriend: 8, nextStar: 4, got: 0, meter: 0, ready: params.has('ready'), // (?ready: a super bounce waiting from the start, to try it)
    fx: [], cam: { x: 0, s: 1, scroll: 0 }, shake: 0, fade: null, sky: null, passedBest: !best,
  });

  function spawn() { // keep the way ahead filled, a screen and more past the fox
    const ahead = S.fox.x + 60;
    while (S.nextFriend < ahead) {
      S.friends.push({ x: S.nextFriend, x0: S.nextFriend, y: 0, kind: pickKind(), used: false, t: 0, carry: false, bunny: false });
      S.nextFriend += 6 + Math.random() * 12 + Math.min(10, S.nextFriend / 80); // (thinning out farther on)
    }
    while (S.nextStar < ahead) { // few down low, thick up high
      for (let y = STARS.low; y < STARS.top; y += STARS.band) {
        if (Math.random() < 0.04 + 0.16 * (y / STARS.top) ** 1.2)
          S.stars.push({ x: S.nextStar + Math.random() * STARS.step, y: Math.min(STARS.top, y + Math.random() * STARS.band), got: false });
      }
      S.nextStar += STARS.step;
    }
    S.friends = S.friends.filter(a => a.x > S.fox.x - 30);
    S.stars = S.stars.filter(a => a.x > S.fox.x - 30);
  }

  function pop(text, x, y, color = '#fff', size = 0.8) { S.fx.push({ kind: 'text', text, x, y, t: 0, color, size }); }
  function dust(x, y, n = 6) { for (let k = 0; k < n; k++) S.fx.push({ kind: 'dust', x, y, vx: (Math.random() - 0.3) * 4, vy: Math.random() * 3, t: 0 }); }
  function confetti(x, y, n = 40) {
    const cs = ['#ff8a65', '#ffd34d', '#7cc7ff', '#9be27a', '#e58cff'];
    for (let k = 0; k < n; k++) S.fx.push({ kind: 'bit', x, y, vx: (Math.random() - 0.5) * 12, vy: Math.random() * 10, t: 0, c: cs[k % cs.length] });
  }
  const act = (name, dur) => { S.fox.act = { name, t: 0, dur }; }; // a pose played for a while (over the flying one)

  function aimed() { // the pull → its velocity: the other way, as fast as it's pulled far
    const len = Math.min(PULL.max, Math.hypot(S.pull.x, S.pull.y)), d = PULL.deg;
    const a = Math.max(d[0], Math.min(d[1], Math.atan2(-S.pull.y, -S.pull.x) * 180 / Math.PI)) * Math.PI / 180;
    const v = LAUNCH.min + (LAUNCH.max - LAUNCH.min) * len / PULL.max;
    return { vx: v * Math.cos(a), vy: v * Math.sin(a), power: len / PULL.max };
  }
  function pullTo(e) { // dragged from anywhere: the pull is how far the finger has gone from where it went down
    const s = S.cam.s, p = at(e), dx = (p.x - S.drag.x) / s, dy = -(p.y - S.drag.y) / s, len = Math.hypot(dx, dy);
    const k = len > PULL.max ? PULL.max / len : 1;
    S.pull = { x: dx * k, y: Math.max(-PULL.rest[1] + 0.2, dy * k) };
  }
  function letGo() {
    if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    const v = aimed();
    S.spring = { x: S.pull.x, y: S.pull.y, t: 0 };
    S.pull = { x: 0, y: 0 };
    if (v.power * PULL.max < PULL.least) return; // (hardly pulled: back on the tree)
    Object.assign(S.fox, { vx: v.vx, vy: v.vy });
    S.phase = 'fly';
    SFX.big(); dust(S.fox.x, S.fox.y, 6);
    if (v.power > 0.9) pop('超強！', S.fox.x + 1, S.fox.y + 2, '#ffe14d');
  }

  function tap() {
    if (!S) return;
    if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    if (S.phase !== 'fly') return;
    const f = S.fox;
    if (f.hold > 0) return; // (in the giraffe's mouth)
    if (f.vy < 0 && f.y > 0.01) { // falling: a dive down at a slant — free, as often as it likes
      if (!f.dive) f.vx += DASH.down[0];
      f.vy = Math.min(f.vy, DASH.down[1]); f.dive = true;
      f.glide = f.ride = 0; f.hops = 0; f.act = null; f.spin = 0;
      SFX.dive(); return;
    }
    if (S.tails <= 0) return; // rising (or rolling): up at a slant, a tail each
    S.tails--;
    f.vx += DASH.up[0]; f.vy = Math.max(f.vy, 0) + DASH.up[1]; f.dive = false;
    f.glide = f.ride = 0; f.hops = 0; f.still = 0; f.dash = 0.5; f.act = null; f.spin = 0;
    SFX.dash(); hud();
  }

  function comboUp(a, fr) { // onto a friend from a friend, the ground not touched between: COMBO m/s more, on the way it's thrown
    const f = S.fox, v = Math.hypot(f.vx, f.vy) || 1;
    f.vx += f.vx / v * COMBO; f.vy += f.vy / v * COMBO; S.shake = Math.max(S.shake, 0.2);
    pop(`COMBO ×${S.combo}!`, a.x - 0.5, fr.h + 3.2, '#7cf0ff', 0.75); chime(780, 2, 70);
  }
  function landOn(a) { // onto a friend: its own throw, or a super bounce when the stars are full
    const f = S.fox, fr = FRIENDS[a.kind];
    const dived = f.dive; // (diving onto it: a hedgehog knocked away, any other friend's throw the stronger)
    const combo = S.combo > 0; S.combo++; // (from a friend, not the ground)
    a.used = true; a.t = 0; f.y = box(a).h; f.hops = 0; f.glide = 0; f.ride = 0; f.dive = false; f.dash = 0;
    dust(a.x, 0.2, 5);
    if (dived && a.kind === 'hedgehog') {
      a.kick = true; a.vy = 9;
      FRIENDS.mushroom.hit(f); f.vx *= DIVE_BOOST; f.vy *= DIVE_BOOST; // (off it as off a mushroom dived onto)
      SFX.big(); act('joy', 0.8); S.shake = 0.2;
      pop('撲飛！', a.x, fr.h + 1.5, '#ffe14d');
      if (combo) comboUp(a, fr);
      return;
    }
    if (S.ready || a.bunny) { // a super bounce (the stars full), or a bunny bounce (a rabbit ran here first): as strong
      const bunny = a.bunny; // (the bunny's first: the stars keep for the next)
      f.vy = SUPER.vy; f.vx = Math.max(f.vx, 18) + SUPER.vx; f.rainbow = 2.2; f.spin = 0;
      if (bunny) a.bunny = false; else { S.ready = false; S.meter = 0; }
      S.shake = 0.5; act('joy', 1.2); SFX.super();
      pop(bunny ? 'BUNNY BOUNCE!' : 'SUPER BOUNCE!', a.x, fr.h + 2.5, bunny ? '#ffb3d9' : '#ffe14d', 1.3); confetti(a.x, fr.h + 1, 60);
      return;
    }
    const s = fr.hit(f); SFX[s]?.();
    if (dived && s !== 'ouch') { f.vx *= DIVE_BOOST; f.vy *= DIVE_BOOST; pop('強力！', a.x + 1, fr.h + 2.4, '#ffb347', 0.6); }
    if (combo && s !== 'ouch') comboUp(a, fr);
    if (s === 'ouch') S.combo = 0; // (tripped: no combo on from it)
    if (a.kind === 'rabbit') { // off ahead past two friends: the first knocked flying on the way, by the second it stops — a bunny bounce off that one
      const [k, b] = S.friends.filter(o => !o.used && !o.bunny && o.x > a.x + 2);
      if (b) { b.bunny = true; a.runTo = b; a.knock = k; a.speed = Math.max(RABBIT.run, f.vx + 6); }
    }
    if (a.kind === 'frog') { S.frog = true; pop('俯衝落地彈更高！', a.x + 1, fr.h + 2.6, '#9be27a', 0.55); }
    if (s === 'refill') { // a tail's dash back (no more than it has tails)
      const back = S.tails < TAILS; if (back) S.tails++;
      pop(back ? '+1 🔥' : '彈！', a.x, fr.h + 1.5, '#ffb347'); f.spin = 1; act('roll', 0.5); hud();
      return;
    }
    a.carry = a.kind === 'owl' || a.kind === 'boar';
    if (f.hold > 0) S.holder = a; // (the giraffe's: held in its mouth through the swing)
    if (s === 'ouch') { f.spin = 1; act('roll', 0.6); } // (tripped: tumbling over it)
    else if (s === 'big') act('joy', 0.8);
    else if (s === 'fling') { f.spin = 1.5; act('roll', 0.75); }
    else if (!a.carry) { f.spin = 1; act('roll', 0.5); }
    pop({ boing: '彈！', hop: '呱呱！', big: '飛高高！', whoosh: '咻～', fling: '甩～！', ouch: '絆倒！' }[s], a.x, fr.h + 1.5, s === 'ouch' ? '#ff8a8a' : '#fff');
  }

  function step(dt) {
    if (S.fade) { // going through black: the change made at its darkest, all going on meanwhile
      const fd = S.fade; fd.t += dt;
      if (!fd.done && fd.t >= FADE / 2) { fd.done = true; fd.mid(); }
      if (fd.t >= FADE) S.fade = null;
    }
    S.t += dt;
    S.shake = Math.max(0, S.shake - dt);
    const f = S.fox;
    if (f.act && (f.act.t += dt) > f.act.dur) f.act = null;
    if (S.spring) S.spring.t += dt;
    if (S.phase === 'aim') { // on the tree's top, pulled back as far as it's dragged
      S.power = Math.hypot(S.pull.x, S.pull.y) / PULL.max;
      f.x = PULL.rest[0] + S.pull.x; f.y = Math.max(0.2, PULL.rest[1] + S.pull.y);
      return;
    }
    if (S.phase === 'sky') return stepSky(dt);
    if (S.phase !== 'fly') { friends(dt); return; }
    // moving
    f.dash = Math.max(0, f.dash - dt); f.rainbow = Math.max(0, f.rainbow - dt);
    if (f.hold > 0) { f.hold -= dt; const h = headAt(S.holder); f.x = h.x; f.y = h.y - 0.5; } // (swung on the giraffe's neck, then let go)
    else if (f.ride > 0) { f.ride -= dt; f.y = FRIENDS.boar.h * 0.8; f.vy = 0; } // (on a boar's back)
    else {
      const grav = f.glide > 0 ? 0 : G; // (in the owl's claws: on at its angle)
      if (f.glide > 0) f.glide -= dt;
      f.vy -= grav * dt;
    }
    if (!(f.hold > 0)) { f.x += f.vx * dt; f.y += f.vy * dt; }
    f.spin = Math.max(0, f.spin - dt * 2);
    if (f.dash > 0) S.fx.push({ kind: 'fire', x: f.x - 0.3, y: f.y + 0.8, vx: -f.vx * 0.2, vy: 0.5, t: 0 });
    if (f.rainbow > 0) S.fx.push({ kind: 'rain', x: f.x - 0.2, y: f.y + 0.8, t: 0, c: `hsl(${(S.t * 600) % 360}, 90%, 65%)` });
    // onto a friend (coming down)
    if (f.vy < 0) for (const a of S.friends) {
      if (!a.used && Math.abs(f.x - a.x - box(a).cx) < (FRIENDS[a.kind].r || 0.9) && f.y < box(a).h && f.y > -0.3) { landOn(a); break; }
    }
    // the plain ground
    if (f.y <= 0) {
      const dived = f.dive;
      f.y = 0; f.dive = false; S.combo = 0;
      if (f.vy < 0) {
        if (dived && S.frog && -f.vy > 3) { // a dive onto the ground after a frog: sprung back up high (the frog's spring used)
          f.vy = Math.max(-f.vy * FROG.keep, FROG.up); f.vx *= 0.95; S.frog = false;
          SFX.hop(); dust(f.x, 0, 8); act('roll', 0.4); f.spin = 1; pop('呱彈！', f.x, 1.8, '#9be27a', 0.6);
        }
        else if (f.hops > 0) { f.hops--; f.vy = 7; f.vx *= 0.97; SFX.hop(); dust(f.x, 0); }
        else if (-f.vy > 3) { f.vy = -f.vy * GROUND.keep; f.vx *= GROUND.drag; SFX.thud(); dust(f.x, 0, 8); if (-f.vy > 6) act('roll', 0.4); }
        else f.vy = 0;
      }
      if (f.vy === 0) { // rolling to a stop
        f.vx = Math.max(0, f.vx - GROUND.roll * dt);
        if (f.vx === 0 && (f.still += dt) > (S.tails > 0 ? 1.2 : 0.6)) return end(); // (a beat to dash again, if a tail is left)
      }
    }
    // stars (and the super bounce they fill)
    for (const a of S.stars) if (!a.got && Math.hypot(a.x - f.x, a.y - (f.y + 0.7)) < 1.1) {
      a.got = true; pop('+1', a.x, a.y + 0.6, '#ffe14d', 0.5); starGot();
    }
    if (f.y > SKY.height && !(f.hold > 0) && !S.fade) S.fade = { t: 0, mid: toSky }; // high enough: up onto the clouds
    // past the farthest
    if (!S.passedBest && f.x > best) { S.passedBest = true; SFX.best(); pop('新紀錄！', f.x, f.y + 3, '#ffe14d'); confetti(f.x, f.y + 2); }
    friends(dt);
    spawn(); hud();
  }
  function starGot() { // a star caught (in the air or on the clouds): counted, and toward the super bounce
    S.got++; SFX.star();
    if (!S.ready && ++S.meter >= SUPER.stars) {
      S.ready = true; SFX.ready();
      pop('SUPER BOUNCE 準備好！', S.fox.x + 2, S.fox.y + 3, '#ffe14d', 0.9);
    }
  }

  // up on the clouds: a road of cloud on ahead, the fox running along it away from us, three lanes and stars in
  // rows on them (a tap on the left or the right half: a lane that way); SKY.run m of it, then down off its end
  function toSky() {
    const f = S.fox, sky = { z: 0, x0: f.x, lane: 0, x: 0, stars: [], t: 0, leap: -1, intro: 0, pop: 0 };
    for (let z = 40; z < SKY.run - 30; z += 35 + Math.random() * 15) { // rows of stars, a lane each
      const lane = Math.floor(Math.random() * 3) - 1;
      for (let k = 0; k < 4; k++) sky.stars.push({ lane, z: z + k * 3, got: false });
    }
    Object.assign(f, { vx: 0, vy: 0, hold: 0, glide: 0, ride: 0, hops: 0, dive: false, act: null, spin: 0, dash: 0 });
    S.sky = sky; S.phase = 'sky'; S.combo = 0;
    SFX.super(); hud();
  }
  function steer(d) { if (S?.phase === 'sky') S.sky.lane = Math.max(-1, Math.min(1, S.sky.lane + d)); }
  function stepSky(dt) {
    const sky = S.sky, f = S.fox;
    sky.t += dt;
    if (sky.leap >= 0) { // off the end: a leap out over the sea of cloud, and down through black
      sky.leap += dt;
      if (!S.fade && sky.leap > 0.6) S.fade = { t: 0, mid: fromSky };
      return hud();
    }
    if (!S.fade || S.fade.t > FADE * 0.75) sky.pop += dt; // (from when it's out of the black, mostly)
    if (sky.intro < SKY.intro) { sky.intro = Math.min(SKY.intro, sky.pop); sky.x += (sky.lane - sky.x) * Math.min(1, dt * 12); return hud(); } // (out of the cloud first)
    sky.z = Math.min(SKY.run, sky.z + SKY.speed * dt);
    sky.x += (sky.lane - sky.x) * Math.min(1, dt * 12);
    f.x = sky.x0 + sky.z;
    for (const a of sky.stars) if (!a.got && Math.abs(a.z - sky.z) < 1.5 && Math.abs(a.lane - sky.x) < 0.5) { a.got = true; starGot(); }
    if (!S.passedBest && f.x > best) { S.passedBest = true; SFX.best(); }
    if (sky.z >= SKY.run) { sky.leap = 0; SFX.super(); }
    hud();
  }
  function fromSky() { // off the cloud's end: down from on high, a giraffe right under it, the way on fresh from here
    const f = S.fox;
    f.x = S.sky.x0 + SKY.run; f.y = SKY.drop; f.vx = 0; f.vy = 0;
    S.sky = null; S.phase = 'fly';
    S.friends = []; S.stars = []; S.nextFriend = f.x + 14; S.nextStar = f.x + 4;
    const gi = { x: 0, x0: 0, y: 0, kind: 'giraffe', used: false, t: 0, carry: false, bunny: false };
    gi.x = gi.x0 = f.x - box(gi).cx; S.friends.push(gi); // (its head right under the fox)
    spawn(); act('joy', 0.8);
    pop('+500 m！', f.x, f.y + 2.5, '#ffe14d', 1.1);
  }

  function friends(dt) { // the friends after the fox lands on them: each its own way
    const f = S.fox;
    for (const a of S.friends) {
      if (!a.used) continue;
      a.t += dt;
      if (a.kick) { a.x += 12 * dt; a.vy -= G * dt; a.y = Math.max(0, a.y + a.vy * dt); }           // knocked away, tumbling
      else if (a.runTo) { // running ahead in hops, to stand by the next friend (then a hop of its own there, waving)
        const to = a.runTo.x - RABBIT.by;
        a.x = Math.min(to, a.x + a.speed * dt); a.y = Math.abs(Math.sin(a.t * 9)) * 0.5;
        const k = a.knock;
        if (k && !k.used && a.x >= k.x - 0.6) { // bumped into: knocked flying (gone, not to be landed on)
          k.used = k.kick = true; k.t = 0; k.vy = 9; a.knock = null;
          SFX.boing(); dust(k.x, 0.2, 6); pop('撞飛！', k.x, FRIENDS[k.kind].h + 1.2, '#ffb3d9', 0.6);
        }
        if (a.x >= to) { a.there = a.runTo; a.runTo = null; a.t = 0; }
      }
      else if (a.there) a.y = a.there.bunny ? Math.abs(Math.sin(a.t * 5)) * 0.7 : 0; // (hopping by its friend while the bunny bounce waits there)
      else if (a.kind === 'rabbit' || a.kind === 'squirrel') a.y = a.t < 0.5 ? Math.sin(a.t / 0.5 * Math.PI) * 0.8 : 0;          // a hop of its own
      else if (a.kind === 'frog') { a.x += 4 * dt; a.y = Math.abs(Math.sin(a.t * 5)) * 0.8; }       // off hopping
      else if (a.kind === 'owl') {
        if (a.carry && f.glide > 0) { a.x = f.x; a.y = f.y + FOX_H * 0.9; }                         // the fox in its claws
        else { a.carry = false; a.x += 7 * dt; a.y += 5 * dt; }                                     // and away up
      } else if (a.kind === 'boar') {
        if (a.carry && f.ride > 0) a.x = f.x;                                                       // the fox on its back
        else { a.carry = false; a.x += 10 * dt; }                                                   // and on running
      }
    }
  }

  // drawing
  const ground = () => H * 0.84;
  const toScreen = (x, y) => ({ x: (x - S.cam.x) * S.cam.s + W * 0.3, y: ground() - y * S.cam.s });
  function draw(dt) {
    if (S.phase === 'sky') { drawSky(dt); blackout(); return; }
    const f = S.fox;
    // the camera: the fox a third along, drawn smaller as it goes higher (so it stays in sight)
    const base = H / CAM.metres, want = Math.max(base * CAM.least, Math.min(base, (ground() - H * 0.18) / Math.max(1, f.y + FOX_H + 1)));
    S.cam.s += (want - S.cam.s) * Math.min(1, dt * 4);
    const cx = Math.max(0, f.x); // (still while it's pulled back)
    S.cam.scroll += (cx - S.cam.x) * S.cam.s; // how far the ground has gone by on screen, px — the hills go by a share of it (not cam.x × scale: that jumps as the camera zooms)
    S.cam.x = cx;
    const s = S.cam.s;
    g.save();
    if (S.shake > 0) g.translate((Math.random() - 0.5) * S.shake * 24, (Math.random() - 0.5) * S.shake * 24);
    // sky, hills far and near (moving less than the ground)
    const sky = g.createLinearGradient(0, 0, 0, ground());
    sky.addColorStop(0, LOOK.sky[0]); sky.addColorStop(1, LOOK.sky[1]);
    g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
    // the layers behind, far to near, each going by faster: GPT's strips (B01, docs/gpt_background.md) once there,
    // else drawn here
    if (LOOK.night) night(dt);
    if (BG.clouds) strip(BG.clouds, 0.05, H * 0.03, H * 0.2, S.t * 6);
    if (BG.far) strip(BG.far, 0.15, ground() - H * 0.4, H * 0.36);
    else { hills(0.15, '#bfe3c6', H * 0.18, 0.004); hills(0.35, '#9fd4a5', H * 0.12, 0.009); }
    if (BG.trees) strip(BG.trees, 0.5, ground() - H * 0.24 + 4, H * 0.24);
    else for (let k = Math.floor((S.cam.x * 0.5 - 40) / 7); k < (S.cam.x * 0.5 + 60) / 7; k++) { // trees along the back (at half the ground's pace)
      const tx = (k * 7 - S.cam.x * 0.5) * s + W * 0.3 + ((k * 37) % 11), ty = ground() - 2;
      const th = s * (3 + ((k * 13) % 5) * 0.6);
      g.fillStyle = '#7a5a3a'; g.fillRect(tx - s * 0.15, ty - th * 0.4, s * 0.3, th * 0.4);
      g.fillStyle = (k % 3) ? '#5fb36a' : '#4fa35d';
      g.beginPath(); g.ellipse(tx, ty - th * 0.6, th * 0.32, th * 0.42, 0, 0, Math.PI * 2); g.fill();
    }
    // ground
    if (BG.ground) { g.fillStyle = LOOK.soil; g.fillRect(-20, ground(), W + 40, H); strip(BG.ground, 1, ground() - (H - ground()) * BG_LIP, (H - ground()) * (1 + BG_LIP)); }
    else {
      g.fillStyle = '#7cc46a'; g.fillRect(-20, ground(), W + 40, H);
      g.fillStyle = '#6ab35a';
      for (let k = Math.floor((S.cam.x - 40) / 2); k < (S.cam.x + 80) / 2; k++) { const p = toScreen(k * 2, 0); if (k % 2) g.fillRect(p.x, ground(), 2 * s, H - ground()); }
      g.fillStyle = '#9b7653'; g.fillRect(-20, ground() + Math.max(14, s * 0.6), W + 40, H);
    }
    // distance signs every 50 m, and the farthest flag
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = Math.ceil((S.cam.x - 30) / 50) * 50; m < S.cam.x + 80; m += 50) {
      if (m <= 0) continue;
      const p = toScreen(m, 0);
      g.fillStyle = '#7a5a3a'; g.fillRect(p.x - 2, p.y - s * 1.6, 4, s * 1.6);
      g.fillStyle = '#fff6e6'; roundRect(p.x - s * 0.8, p.y - s * 2.1, s * 1.6, s * 0.7, 6); g.fill();
      g.fillStyle = '#7a5a3a'; g.font = `800 ${Math.round(s * 0.42)}px sans-serif`; g.fillText(`${m}m`, p.x, p.y - s * 1.75);
    }
    if (best > 0) {
      const p = toScreen(best, 0);
      g.fillStyle = '#fff'; g.fillRect(p.x - 2, p.y - s * 3, 4, s * 3);
      g.fillStyle = '#ff6b6b'; g.beginPath(); g.moveTo(p.x + 2, p.y - s * 3); g.lineTo(p.x + s * 1.2, p.y - s * 2.6); g.lineTo(p.x + 2, p.y - s * 2.2); g.fill();
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(s * 0.36)}px sans-serif`; g.fillText('最遠', p.x + s * 0.5, p.y - s * 3.4);
    }
    // the little tree it's flung from: its top where the fox is pulled to, whipping back and forth after the fling
    { let tx = PULL.rest[0], ty = PULL.rest[1];
      if (S.phase === 'aim' || S.phase === 'idle') { tx = f.x; ty = f.y; }
      else if (S.spring) { const t = S.spring.t, k = Math.exp(-t * 5) * Math.cos(t * 22); tx += S.spring.x * k; ty += S.spring.y * k; }
      if (TREE.base && TREE.crown) drawTree(tx, ty, s);
      else {
        const b = toScreen(-0.5, 0), tip = toScreen(tx, ty), mid = toScreen(-0.5, ty * 0.55);
        g.strokeStyle = '#7a5a3a'; g.lineCap = 'round'; g.lineWidth = s * 0.3;
        g.beginPath(); g.moveTo(b.x, b.y); g.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y); g.stroke();
        for (const [ox, oy, r, c] of [[-0.8, 0.2, 0.5, '#4fa35d'], [-0.35, 0.75, 0.6, '#5fb36a'], [0.3, 0.45, 0.45, '#4fa35d']]) {
          const q = toScreen(tx + ox, ty + oy); g.fillStyle = c; g.beginPath(); g.arc(q.x, q.y, r * s, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // the way it'll go, while pulled
    if (S.phase === 'aim' && S.drag && S.power * PULL.max >= PULL.least) {
      const v = aimed(); let x = f.x, y = f.y + 0.6, vx = v.vx, vy = v.vy;
      g.fillStyle = '#fff';
      for (let i = 1; i <= 14; i++) {
        for (let k = 0; k < 4; k++) { x += vx * 0.02; y += vy * 0.02; vy -= G * 0.02; }
        const q = toScreen(x, y); g.globalAlpha = 1 - i / 15; g.beginPath(); g.arc(q.x, q.y, s * 0.12, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // friends (the owl and the boar after the fox, carrying it)
    const carriers = S.friends.filter(a => a.carry && a.kind === 'owl');
    for (const a of S.friends) if (!carriers.includes(a)) drawFriend(a, s);
    // stars, twinkling
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = `${Math.round(s * 0.8)}px sans-serif`;
    for (const a of S.stars) if (!a.got) {
      const p = toScreen(a.x, a.y), k = 1 + Math.sin(S.t * 6 + a.x * 3 + a.y) * 0.15;
      g.save(); g.translate(p.x, p.y); g.scale(k, k); if (LOOK.night) candy(0, 0, s * 0.36, a.x + a.y); else g.fillText('⭐', 0, 0); g.restore();
    }
    // the fox
    drawFox(f, s);
    for (const a of carriers) drawFriend(a, s);
    // bits: dust, fire, rainbow, confetti, words
    const life = e => e.kind === 'text' ? 1 : e.kind === 'bit' ? 2 : e.kind === 'rain' ? 0.8 : 0.6;
    S.fx = S.fx.filter(e => (e.t += dt) < life(e));
    for (const e of S.fx) {
      if (e.kind !== 'text') { e.x += (e.vx || 0) * dt; e.y += (e.vy || 0) * dt; if (e.kind === 'bit') e.vy -= G * 0.5 * dt; }
      const p = toScreen(e.x, e.y + (e.kind === 'text' ? e.t * 1.2 : 0));
      g.globalAlpha = Math.max(0, 1 - e.t / life(e));
      if (e.kind === 'dust') { g.fillStyle = '#e8d8c0'; g.beginPath(); g.arc(p.x, p.y, s * (0.2 + e.t * 0.4), 0, Math.PI * 2); g.fill(); }
      else if (e.kind === 'fire') { g.fillStyle = e.t < 0.2 ? '#ffe14d' : '#ff8a3d'; g.beginPath(); g.arc(p.x, p.y, s * (0.45 - e.t * 0.6), 0, Math.PI * 2); g.fill(); }
      else if (e.kind === 'rain') { g.fillStyle = e.c; g.beginPath(); g.arc(p.x, p.y, s * (0.5 - e.t * 0.5), 0, Math.PI * 2); g.fill(); }
      else if (e.kind === 'bit') { g.fillStyle = e.c; g.fillRect(p.x, p.y, s * 0.2, s * 0.3); }
      else {
        g.textAlign = 'center'; g.font = `900 ${Math.round(s * e.size)}px sans-serif`; g.lineWidth = 4; g.strokeStyle = '#0005';
        g.strokeText(e.text, p.x, p.y); g.fillStyle = e.color; g.fillText(e.text, p.x, p.y);
      }
      g.globalAlpha = 1;
    }
    g.restore();
    offscreen(f, s);
    blackout();
  }
  function blackout() { // (into and out of the clouds)
    if (!S.fade) return;
    g.fillStyle = `rgba(0, 0, 0, ${Math.min(1, 1 - Math.abs(S.fade.t / (FADE / 2) - 1))})`; g.fillRect(0, 0, W, H);
  }

  // the cloud road, seen from just behind the fox (as the forest run's road): z ahead, in view units of ZV m
  const ZV = 3, FAR = 70, CAMZ = 7, HOR = () => H * 0.36, NEAR = () => H * 0.86, LANE = () => H * 0.2;
  function project(x, z) {
    const s = CAMZ / (CAMZ + Math.max(-CAMZ * 0.9, z));
    return { x: W / 2 + x * LANE() * s, y: HOR() + (NEAR() - HOR()) * s, s };
  }
  function puff(x, y, r, shade = '#dfe6ff') { // a round lump of cloud, a little shadow under it
    g.fillStyle = shade; g.beginPath(); g.arc(x, y + r * 0.18, r, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r * 0.92, 0, 7); g.fill();
  }
  // a cartoon puff of smoke: round grey-white clouds with a dark outline, bursting out and up, swelling, then gone
  const SMOKE = Array.from({ length: 9 }, (_, k) => ({ a: k / 9 * Math.PI * 2 + (k % 2) * 0.3, r: 0.8 + (k * 37 % 5) * 0.12, up: 0.5 + (k * 13 % 4) * 0.25 }));
  function smoke(p, t) {
    const L = LANE() * p.s, k = Math.min(1, t / 0.18), fade = Math.max(0, 1 - Math.max(0, t - 0.35) / 0.9);
    if (fade <= 0) return;
    g.save(); g.globalAlpha = fade; g.lineWidth = Math.max(2, L * 0.03); g.strokeStyle = '#5a4a7a';
    for (const pass of [0, 1]) for (const m of SMOKE) {
      const d = L * (0.25 + 0.7 * (1 - Math.exp(-t * 6))) * m.r, x = p.x + Math.cos(m.a) * d * 1.4;
      const y = p.y + Math.sin(m.a) * d * 0.45 - L * m.up * t * 0.9, r = L * (0.1 + 0.16 * k) * m.r * (0.6 + fade * 0.4);
      g.beginPath(); g.arc(x, y, r, 0, 7);
      if (pass) { g.fillStyle = '#f4f1ff'; g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, 7); g.fill(); }
      else g.stroke(); // (outlines first, all under the puffs: one cloud's outline, not each's)
    }
    g.restore();
  }
  function drawSky(dt) {
    const sky = S.sky, zv = sky.z / ZV, left = (SKY.run - sky.z) / ZV; // (left: how far on the road still goes)
    const hy = HOR(), grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, LOOK.clouds[0]); grad.addColorStop(0.36, LOOK.clouds[1]); grad.addColorStop(1, LOOK.clouds[2]);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    if (LOOK.night) night(dt);
    if (BG.clouds) { // high clouds drifting, and far ones along the horizon
      strip(BG.clouds, 0, H * 0.02, H * 0.16, S.t * 10);
      g.globalAlpha = 0.8; strip(BG.clouds, 0, hy - H * 0.09, H * 0.11, S.t * 4 + zv * 2); g.globalAlpha = 1;
    }
    // a sea of cloud down from the horizon, lumps of it going by on both sides
    const k0 = Math.floor(zv / 2.5);
    for (let k = k0 + 28; k >= k0 - 2; k--) {
      const z = k * 2.5 - zv; if (z < -CAMZ * 0.8 || z > FAR) continue;
      for (const side of [-1, 1]) {
        const off = 2.6 + (((k * 37 + (side > 0 ? 11 : 0)) % 7) + 7) % 7 * 0.45, p = project(side * off, z);
        puff(p.x, p.y, LANE() * p.s * (0.7 + (((k * 13) % 5) + 5) % 5 * 0.12), '#d9dcff');
      }
    }
    // past the road's end, a lower sea of cloud (where the fox leaps down into it)
    if (left < FAR) for (let z = FAR; z > left - 1; z -= 1.4) for (let x = -3.2; x <= 3.21; x += 0.8) {
      const q = project(x + (Math.round(z / 1.4) % 2) * 0.4, z);
      puff(q.x, q.y + LANE() * q.s * 0.9, LANE() * q.s * 0.55, '#d9dcff');
    }
    // the road: white cloud, three faint lanes, lumpy along both edges, ending where the run does
    const end = Math.min(FAR, left), zs = [];
    for (let k = 0; k <= 24; k++) zs.push(-CAMZ * 0.6 + (end + CAMZ * 0.6) * (k / 24) ** 1.6);
    const edge = x => zs.map(z => project(x, z)), L = edge(-1.6), R = edge(1.6);
    g.fillStyle = '#ffffff'; g.beginPath();
    L.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); [...R].reverse().forEach(p => g.lineTo(p.x, p.y));
    g.closePath(); g.fill();
    g.strokeStyle = '#e4e8ff'; g.lineWidth = 3;
    for (const x of [-0.5, 0.5]) { g.beginPath(); edge(x).forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    for (let k = Math.ceil(end / 1.2); k >= -4; k--) { // the lumps along its edges, far to near
      const z = k * 1.2 - (zv % 1.2); if (z > end) continue;
      for (const side of [-1, 1]) { const p = project(side * 2.0, z); puff(p.x, p.y, LANE() * p.s * 0.38); }
    }
    if (left < FAR) for (let x = -1.6; x <= 1.61; x += 0.4) { const q = project(x, left); puff(q.x, q.y, LANE() * q.s * 0.35); } // (its far end, rounded)
    // stars on it, far to near, then the fox
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = sky.stars.length - 1; i >= 0; i--) {
      const a = sky.stars[i]; if (a.got) continue;
      const z = (a.z - sky.z) / ZV; if (z < -1 || z > FAR) continue;
      const p = project(a.lane, z), r = LANE() * p.s * 0.5, k = 1 + Math.sin(S.t * 6 + a.z) * 0.12;
      if (LOOK.night) candy(p.x, p.y - r * 1.2, r * 0.6 * k, a.z); else { g.font = `${Math.round(r * 1.4 * k)}px sans-serif`; g.fillText('⭐', p.x, p.y - r * 1.2); }
    }
    // the fox bounding on, a bound each SKY.hop s (crouched, up, stretched out, down: back_crouch_to_back_air +
    // back_air_to_back_crouch); at the end one more, a big one out off it, away and down into the cloud below
    const up = A.up || [], down = A.down || [], hops = [...up, ...down.slice(1, -1)];
    let z = 0, lift = 0, im;
    if (sky.intro < SKY.intro) { // up out of the cloud (from inside it, the road's top hiding its lower part), and down onto it
      const u = sky.intro / SKY.intro; lift = -1.2 * (1 - u) + 5.2 * u * (1 - u);
      im = u < 0.45 ? up[Math.min(up.length - 1, Math.floor(u / 0.45 * up.length))] : down[Math.min(down.length - 1, Math.floor((u - 0.45) / 0.55 * down.length))];
    } else if (sky.leap >= 0) {
      const L = sky.leap; z = L * SKY.speed / ZV * 0.7; lift = 3.4 * L - 6 * L * L; // (lane widths)
      im = L < 0.25 ? up[Math.min(up.length - 1, Math.floor(L / 0.25 * up.length))] : up.at(-1);
    } else {
      const u = (sky.t / SKY.hop) % 1;
      lift = Math.sin(Math.PI * u) * 0.45; im = hops[Math.floor(u * hops.length)];
    }
    const p = project(sky.x, z), size = H * 0.32 * p.s, rise = lift * LANE() * p.s;
    if (sky.pop < 1.4) smoke(project(0, -sky.z / ZV), sky.pop); // (a cartoon burst of smoke where it popped out)
    g.save(); if (lift < 0) { g.beginPath(); g.rect(0, 0, W, p.y + (sky.leap >= 0 ? LANE() * p.s * 0.9 : 0)); g.clip(); } // (what's inside the cloud, hidden: the road, or the sea below it)
    if (sky.leap < 0 && lift >= 0) { g.fillStyle = '#c9cdf266'; g.beginPath(); g.ellipse(p.x, p.y, size * 0.2 * (1 - lift * 0.4), size * 0.05, 0, 0, 7); g.fill(); }
    g.save(); g.translate(p.x, p.y - rise); g.rotate((sky.lane - sky.x) * -0.25); // (leaning into a lane change)
    if (sky.intro < SKY.intro) { const u = sky.intro / SKY.intro, k = u < 0.5 ? 0.25 * (1 - u * 2) : u > 0.85 ? -0.3 * Math.sin((u - 0.85) / 0.15 * Math.PI) : 0; g.scale(1 - k * 0.6, 1 + k); } // (stretched shooting up, squashed landing)
    if (S.ready) { // (a super bounce waiting: its glow)
      const rg = g.createRadialGradient(0, -size * 0.4, size * 0.1, 0, -size * 0.4, size * 0.6);
      rg.addColorStop(0, 'rgba(255, 225, 77, 0.6)'); rg.addColorStop(1, 'rgba(255, 225, 77, 0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, -size * 0.4, size * 0.6, 0, 7); g.fill();
    }
    if (im?.complete && im.naturalWidth) g.drawImage(im, -size / 2, -size * 449 / 480, size, size); // (feet at y 449 of 480 in its frames)
    else { g.font = `${Math.round(size * 0.5)}px sans-serif`; g.fillText('🦊', 0, -size * 0.3); }
    g.restore(); g.restore();
  }

  function offscreen(f, s) { // up out of sight: an arrow along the top where it is, and how high
    const top = toScreen(f.x, f.y + FOX_H * 0.8);
    if (S.phase !== 'fly' || top.y > H * 0.13) return;
    const x = Math.max(34, Math.min(W - 34, top.x)), y = 116, r = 24; // (below the counters)
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.moveTo(x, y - r - 14); g.lineTo(x - 10, y - r - 2); g.lineTo(x + 10, y - r - 2); g.fill(); // the arrow
    g.fillStyle = '#fffdf8'; g.strokeStyle = '#ff8a3d'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    const im = A.run?.[AIR];
    if (im?.complete && im.naturalWidth) g.drawImage(im, x - r * 1.1, y - r * 1.25, r * 2.2, r * 2.2);
    g.font = '900 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 4; g.strokeStyle = '#0006';
    const t = `${Math.round(f.y)} m`; g.strokeText(t, x, y + r + 4); g.fillStyle = '#fff'; g.fillText(t, x, y + r + 4);
  }
  function drawFriend(a, s) {
    const fr = FRIENDS[a.kind], p = toScreen(a.x, a.y), sz = s * fr.h * 1.15, t = a.t;
    g.save(); g.translate(p.x, p.y);
    if (a.kick) { g.translate(0, -sz * 0.4); g.rotate(t * 14); g.translate(0, sz * 0.4); } // (tumbling away)
    if (art(a.kind, 'idle')) { drawArt(a, s, t); g.restore(); return; } // (its own picture, once there)
    if (fr.draw) { fr.draw(a, s, t); g.restore(); return; } // (drawn, not an emoji)
    if (!a.used) g.scale(1, 1 + Math.sin(S.t * 3 + a.x) * 0.04);                   // breathing, waiting
    else if (t < 0.15) g.scale(1.35, 0.6);                                          // squashed as the fox lands
    else if (a.kind === 'mushroom') { const k = Math.sin(t * 22) * Math.exp(-t * 4) * 0.35; g.scale(1 - k, 1 + k); } // springing
    else if (a.kind === 'hedgehog') { const k = Math.exp(-t * 3); g.rotate(Math.sin(t * 40) * k * 0.15); g.scale(1 + k * 0.3, 1 + k * 0.3); } // bristling
    else if (a.kind === 'owl' && (a.carry || a.y > 0)) g.scale(1 + Math.sin(t * 18) * 0.12, 1 - Math.sin(t * 18) * 0.08); // flapping
    else if (a.kind === 'boar') g.translate(0, -Math.abs(Math.sin(t * 16)) * s * 0.12); // trotting
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.font = `${Math.round(sz)}px sans-serif`;
    if (a.kind === 'frog' || a.kind === 'boar' || a.kind === 'owl' || a.runTo) { if (a.used) g.scale(-1, 1); } // (turned to go right, as the fox)
    g.fillText(fr.e, 0, sz * 0.12);
    g.restore();
  }
  // the friends' own pictures (GPT grids F01–F03, docs/gpt_friends.md): assets/friends/<kind>_idle.png waiting,
  // _hit.png landed on (the owl flying, the boar running, the giraffe's neck swung), _alt.png the other frame of a
  // flap / a gallop / a hop; all facing left, feet at the bottom of a square. Moving is done here: squash, wobble,
  // flap and gallop by swapping hit/alt. Until a kind's idle is there, the emoji (or the drawn bear, giraffe) stands in.
  // ART_M: the square's side, metres
  const ART_M = { rabbit: 1.37, frog: 1.55, mushroom: 1.76, bear: 2.34, owl: 1.84, boar: 1.77, hedgehog: 1.31, giraffe: 3.66, squirrel: 1.39 };
  // where it's landed on, when its picture differs from the stand-in: x from its feet, height (the giraffe's head is out front)
  const ART_HIT = { giraffe: { cx: -1.2, h: 2.4 } };
  // where its feet are across the 512px square, when not in the middle (the giraffe's head swings the picture's centre about)
  const ART_FEET = { giraffe_idle: 330, giraffe_hit: 168 };
  const ART = {};
  (async () => { // (assets/friends/index.json: the names sliced so far, e.g. ["rabbit_idle", "rabbit_hit"])
    // (on Halloween, their costumes from <LOOK.friends>/ where there, over the everyday ones: the mushroom a pumpkin)
    for (const dir of ['assets/friends', LOOK.friends].filter(Boolean)) {
      const r = await fetch(`${dir}/index.json`).catch(() => null);
      const names = r?.ok ? await r.json() : [];
      await Promise.all(names.map(name => new Promise(done => {
        const [k, n] = name.split('_'), im = new Image();
        im.onload = () => { (ART[k] ||= {})[n] = im; done(); }; im.onerror = done; im.src = `${dir}/${name}.png`;
      })));
    }
  })();
  const art = (k, n) => ART[k]?.[n] || null;
  const box = a => (art(a.kind, 'idle') && ART_HIT[a.kind]) || { cx: 0, h: FRIENDS[a.kind].h }; // (where it's landed on)
  function drawArt(a, s, t) {
    const k = a.kind, side = s * (ART_M[k] || 1.2);
    const flip = t * 8 % 1 < 0.5, moving = (k === 'owl' || k === 'boar') && (a.carry || a.x !== a.x0); // (flapping / galloping)
    let n = 'idle';
    if (a.used) {
      if (art(k, 'hit')) n = 'hit';
      if (moving && !flip && art(k, 'alt')) n = 'alt';
      if ((k === 'frog' || k === 'rabbit' || k === 'squirrel') && a.y > 0.05 && art(k, 'alt')) n = 'alt'; // (up in a hop)
    }
    if (!a.used) g.scale(1, 1 + Math.sin(S.t * 3 + a.x) * 0.03);                    // breathing, waiting
    else if (t < 0.12 && !moving && k !== 'giraffe') g.scale(1.2, 0.8);                                // squashed as the fox lands
    else if (k === 'mushroom') { const q = Math.sin(t * 22) * Math.exp(-t * 4) * 0.3; g.scale(1 - q, 1 + q); } // springing
    else if (k === 'bear') { const q = Math.sin(t * 20) * Math.exp(-t * 4) * 0.12; g.scale(1 + q, 1 - q); }   // its belly bouncing back
    else if (k === 'hedgehog') g.rotate(Math.sin(t * 40) * Math.exp(-t * 3) * 0.12);   // shaking, bristled
    else if (k === 'giraffe') { // its head swung up and over (pivoting on its feet), then swaying back
      const A = art(k, 'hit') ? 0.12 : 0.35; // (less when its picture already has the neck flung)
      const sw = t < NECK.hold ? Math.sin(t / NECK.hold * Math.PI / 2) * A : A * Math.exp(-(t - NECK.hold) * 4) * Math.cos((t - NECK.hold) * 7);
      g.rotate(sw);
    }
    else if (k === 'boar' && moving) g.translate(0, -Math.abs(Math.sin(t * 16)) * s * 0.1);
    if (a.used && (k === 'frog' || k === 'boar' || k === 'owl' || a.runTo)) g.scale(-1, 1); // (turned to go right, as the fox)
    const im = art(k, n), feet = ((ART_FEET[k + '_' + n] ?? 256) - 256) / 512 * side;
    g.drawImage(im, -side / 2 - feet, -side, side, side);
  }
  // the big bear asleep on its back, its belly up (the fox bounces off it; it sleeps on)
  function drawBear(a, s, t) {
    const E = (x, y, rx, ry, c, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x * s, -y * s, rx * s, ry * s, rot, 0, Math.PI * 2); g.fill(); };
    const breath = Math.sin(S.t * 2 + a.x) * 0.03, k = a.used ? Math.sin(t * 20) * Math.exp(-t * 4) * 0.35 : 0; // (k: the belly squashed and bouncing back)
    const bry = (0.46 + breath) * (1 - k), BROWN = '#8b5a3c', CREAM = '#f1d7ae';
    E(1.0, 0.8, 0.2, 0.3, BROWN, 0.5); E(0.72, 0.95, 0.2, 0.3, BROWN, 0.3);      // its feet up
    E(1.02, 0.9, 0.11, 0.15, CREAM, 0.5); E(0.74, 1.06, 0.11, 0.15, CREAM, 0.3);
    E(0, 0.5, 1.15, 0.5, BROWN);                                                   // its body
    E(0.1, 0.6 + bry * 0.6, 0.85 * (1 + k * 0.4), bry, CREAM);                     // its belly
    E(-0.35, 0.95 + bry * 0.4, 0.28, 0.14, BROWN, -0.4);                           // a paw on it
    E(-1.35, 0.9, 0.16, 0.16, BROWN); E(-0.85, 0.95, 0.16, 0.16, BROWN);           // its head: ears,
    E(-1.1, 0.55, 0.45, 0.42, BROWN);                                              // head,
    E(-1.2, 0.42, 0.22, 0.15, CREAM); E(-1.28, 0.47, 0.07, 0.05, '#3a2a20');       // snout, nose
    g.strokeStyle = '#3a2a20'; g.lineWidth = Math.max(1.5, s * 0.05); g.lineCap = 'round';
    for (const ex of [-1.27, -0.97]) { g.beginPath(); g.arc(ex * s, -0.66 * s, 0.08 * s, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); } // eyes shut
    g.fillStyle = '#5a7dbf'; g.textAlign = 'center'; g.textBaseline = 'middle';    // z z z
    for (let i = 0; i < 3; i++) {
      const ph = (S.t * 0.5 + i / 3) % 1;
      g.globalAlpha = 1 - ph; g.font = `900 ${Math.round(s * (0.3 + ph * 0.25))}px sans-serif`;
      g.fillText('z', (-1.3 + ph * 0.6) * s, -(1.2 + ph * 1.1) * s);
    }
    g.globalAlpha = 1;
  }
  // the giraffe: its neck leans out to the fox coming; landed on, it swings it up and over and lets go at 45°
  const NECK = { base: [0.45, 1.65], len: 1.15, rest: -0.35, swing: 1.0, hold: 0.22 }; // (radians from upright, + forward)
  function neckAng(a) {
    if (!a.used) return NECK.rest + Math.sin(S.t * 1.5 + a.x) * 0.04;
    const t = a.t, d = NECK.swing - NECK.rest;
    if (t < NECK.hold) return NECK.rest + d * (1 - (1 - t / NECK.hold) ** 2);
    return NECK.rest + d * Math.exp(-(t - NECK.hold) * 4) * Math.cos((t - NECK.hold) * 7);
  }
  function headAt(a) {
    if (art('giraffe', 'idle')) { // (its picture: the fox carried from its head up and over, forwards)
      const q = Math.min(1, a.t / NECK.hold), e = 1 - (1 - q) ** 2, b = ART_HIT.giraffe;
      return { x: a.x + b.cx + 3.0 * e, y: b.h + 0.5 * Math.sin(e * Math.PI / 2) }; // (to where its head is flung, F02)
    }
    const n = neckAng(a); return { x: a.x + NECK.base[0] + NECK.len * Math.sin(n), y: NECK.base[1] + NECK.len * Math.cos(n) };
  }
  function drawGiraffe(a, s) {
    const Y = '#f2c14e', SPOT = '#c9852f', n = neckAng(a), [bx, by] = NECK.base;
    g.strokeStyle = Y; g.lineCap = 'round'; g.lineWidth = s * 0.13;
    for (const lx of [0.6, 0.8, 1.25, 1.45]) { g.beginPath(); g.moveTo(lx * s, -1.3 * s); g.lineTo(lx * s, 0); g.stroke(); } // legs
    g.lineWidth = s * 0.05; g.strokeStyle = SPOT; g.beginPath(); g.moveTo(1.6 * s, -1.5 * s); g.lineTo(1.85 * s, -1.05 * s); g.stroke(); // tail
    g.fillStyle = Y; g.beginPath(); g.ellipse(1.0 * s, -1.45 * s, 0.65 * s, 0.35 * s, 0, 0, Math.PI * 2); g.fill(); // body
    const hx = bx + NECK.len * Math.sin(n), hy = by + NECK.len * Math.cos(n);
    g.strokeStyle = Y; g.lineWidth = s * 0.26; g.beginPath(); g.moveTo(bx * s, -by * s); g.lineTo(hx * s, -hy * s); g.stroke(); // neck
    g.fillStyle = SPOT;
    for (const [x, y, r] of [[0.8, 1.5, 0.12], [1.15, 1.35, 0.1], [1.35, 1.55, 0.09], [0.95, 1.25, 0.08]]) { g.beginPath(); g.arc(x * s, -y * s, r * s, 0, Math.PI * 2); g.fill(); }
    for (const q of [0.3, 0.6]) { g.beginPath(); g.arc((bx + (hx - bx) * q) * s, -(by + (hy - by) * q) * s, 0.07 * s, 0, Math.PI * 2); g.fill(); }
    g.save(); g.translate(hx * s, -hy * s); g.rotate(n * 0.5);                    // head, facing the fox
    g.strokeStyle = SPOT; g.lineWidth = s * 0.05;
    for (const ox of [0.0, 0.1]) { g.beginPath(); g.moveTo(ox * s, -0.12 * s); g.lineTo(ox * s, -0.3 * s); g.stroke(); }
    g.fillStyle = SPOT; for (const ox of [0.0, 0.1]) { g.beginPath(); g.arc(ox * s, -0.32 * s, 0.045 * s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = Y; g.beginPath(); g.ellipse(-0.12 * s, 0, 0.3 * s, 0.17 * s, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0.17 * s, -0.08 * s, 0.1 * s, 0.05 * s, -0.4, 0, Math.PI * 2); g.fill(); // ear
    g.fillStyle = '#3a2a20'; g.beginPath(); g.arc(-0.12 * s, -0.05 * s, 0.04 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(-0.37 * s, 0.03 * s, 0.025 * s, 0, Math.PI * 2); g.fill(); // nostril
    g.restore();
  }
  function drawFox(f, s) {
    const p = toScreen(f.x, f.y), size = s * FOX_H * 1.25;
    const inAir = S.phase === 'fly' && f.y > 0.05;
    let img = null, rot = 0, front = false; // (front: a clip facing us — drawn upright, a little smaller)
    if (S.phase === 'aim' || S.phase === 'idle') img = A.pounce?.[Math.round(CROUCH[0] + (CROUCH[1] - CROUCH[0]) * S.power)] || A.run?.[0];
    else if (S.phase === 'done') { img = frameOf(S.newBest ? 'cheer' : 'happy', S.t); front = true; }
    else if (f.act && A[f.act.name]) {
      img = frameOf(f.act.name, f.act.t); front = f.act.name !== 'roll';
      if (f.act.name === 'roll') rot = f.spin * Math.PI * 2;
    } else if (f.dive && A.pounce) { img = A.pounce[DIVE]; rot = -Math.atan2(f.vy, Math.max(4, f.vx)) * 0.7; }
    else if (inAir && f.ride <= 0) { img = A.run?.[AIR]; rot = -Math.atan2(f.vy, Math.max(4, f.vx)) * 0.6 + f.spin * Math.PI * 2; }
    else img = A.run?.length ? (f.vx > 0.5 ? frameOf('run', S.t, 6 + f.vx) : A.run[0]) : null;
    g.save(); g.translate(p.x, p.y - size * 0.45); g.rotate(rot);
    if (S.ready && S.phase === 'fly') { // a golden glow while a super bounce is waiting
      const k = 0.5 + Math.sin(S.t * 10) * 0.5, rg = g.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.7);
      rg.addColorStop(0, `rgba(255, 225, 77, ${0.5 + k * 0.3})`); rg.addColorStop(1, 'rgba(255, 225, 77, 0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, size * 0.7, 0, Math.PI * 2); g.fill();
    }
    if (f.dash > 0 || f.rainbow > 0) { g.shadowColor = f.rainbow > 0 ? '#fff' : '#ffb347'; g.shadowBlur = 24; }
    const sz = front ? size * 0.9 : size;
    if (img?.complete && img.naturalWidth) g.drawImage(img, -sz / 2, -sz * 449 / 480 + size * 0.45, sz, sz); // (feet at y 449 of 480)
    else { g.font = `${Math.round(size * 0.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🦊', 0, 0); }
    g.restore();
  }
  // the background's strips (<dir>/index.json: those cut so far — clouds, far, trees, ground; .webp), tiled along the way
  const BG = {}, BG_LIP = LOOK.lip; // (BG_LIP: the ground strip's grassy top stands this much of its height over the ground line)
  (async () => {
    const r = await fetch(`${LOOK.dir}/index.json`).catch(() => null);
    for (const name of r?.ok ? await r.json() : []) { const im = new Image(); im.onload = () => { BG[name] = im; }; im.src = `${LOOK.dir}/${name}.webp`; }
  })();
  // on Halloween night the stars are sweets: a round one in its wrapper, twisted at both ends, in one of three colours
  const CANDY = [['#ff8a2a', '#ffd08a'], ['#9a5cff', '#d9c2ff'], ['#45c46a', '#b8f0c4']];
  function candy(x, y, r, seed) {
    const [c, l] = CANDY[Math.abs(Math.floor(seed * 7)) % 3];
    g.save(); g.translate(x, y); g.rotate(Math.sin(seed) * 0.5);
    g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, r * 0.12); g.strokeStyle = '#4a2a3a'; g.fillStyle = c;
    for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * r * 0.7, 0); g.lineTo(d * r * 1.7, -r * 0.6); g.lineTo(d * r * 1.55, 0); g.lineTo(d * r * 1.7, r * 0.6); g.closePath(); g.fill(); g.stroke(); }
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = l; g.lineWidth = r * 0.22; g.lineCap = 'round'; // (its stripes, and a shine)
    for (const o of [-0.4, 0.15]) { g.beginPath(); g.arc(0, 0, r * 0.62, Math.PI * (0.9 + o), Math.PI * (1.3 + o)); g.stroke(); }
    g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(-r * 0.35, -r * 0.4, r * 0.16, 0, 7); g.fill();
    g.restore();
  }
  // the night's moon, and its bats: a flock now and then, small and dark, flapping across far off
  const bats = []; let batWait = 3;
  function night(dt) {
    const mx = W * 0.8, my = H * 0.17, mr = H * 0.075;
    const glow = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
    glow.addColorStop(0, 'rgba(255, 240, 190, 0.35)'); glow.addColorStop(1, 'rgba(255, 240, 190, 0)');
    g.fillStyle = glow; g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = '#f0e2a8'; for (const [ox, oy, r] of [[-0.3, -0.2, 0.18], [0.25, 0.3, 0.13], [0.35, -0.3, 0.09]]) { g.beginPath(); g.arc(mx + ox * mr, my + oy * mr, r * mr, 0, 7); g.fill(); }
    if ((batWait -= dt) < 0) { // a flock off, from one side across to the other
      batWait = 7 + Math.random() * 9;
      const dir = Math.random() < 0.5 ? 1 : -1, y = H * (0.1 + Math.random() * 0.28), n = 5 + Math.floor(Math.random() * 6);
      bats.push({ dir, y, t: 0, speed: W * (0.12 + Math.random() * 0.06), one: Array.from({ length: n }, () => ({ dx: Math.random() * W * 0.18, dy: (Math.random() - 0.5) * H * 0.1, k: Math.random() * 7, size: H * (0.012 + Math.random() * 0.01) })) });
    }
    g.fillStyle = '#120c24';
    for (let i = bats.length - 1; i >= 0; i--) {
      const fl = bats[i]; fl.t += dt;
      const lead = fl.dir > 0 ? -W * 0.05 + fl.t * fl.speed : W * 1.05 - fl.t * fl.speed;
      if (fl.t * fl.speed > W * 1.4) { bats.splice(i, 1); continue; }
      for (const b of fl.one) {
        const x = lead - fl.dir * b.dx, y = fl.y + b.dy + Math.sin(fl.t * 2 + b.k) * H * 0.012, a = Math.sin(fl.t * 16 + b.k), z = b.size;
        g.beginPath(); // (wings up and down from the body)
        g.moveTo(x - z * 0.3, y);
        g.quadraticCurveTo(x - z * 1.2, y - z * 1.6 * a - z * 0.2, x - z * 2.2, y - z * 0.9 * a);
        g.quadraticCurveTo(x - z * 1.3, y - z * 0.2 * a + z * 0.3, x, y + z * 0.4);
        g.quadraticCurveTo(x + z * 1.3, y - z * 0.2 * a + z * 0.3, x + z * 2.2, y - z * 0.9 * a);
        g.quadraticCurveTo(x + z * 1.2, y - z * 1.6 * a - z * 0.2, x + z * 0.3, y);
        g.closePath(); g.fill();
        g.beginPath(); g.ellipse(x, y + z * 0.1, z * 0.45, z * 0.6, 0, 0, 7); g.fill();
      }
    }
  }
  function strip(im, par, y, h, drift = 0) { // tiled across, going by at par of the ground's pace (plus drift px)
    const w = im.naturalWidth * h / im.naturalHeight, off = (((S.cam.scroll * par + drift) % w) + w) % w;
    for (let x = -off; x < W; x += w) g.drawImage(im, x, y, w + 1, h);
  }
  // the little tree, GPT's (B02, docs/gpt_background.md): its roots and grass (the stump's top taken off) at the
  // bottom, its leafy crown at the top where the fox sits, and between them its trunk, bent here — the stump's own
  // bark (tree_trunk: a band of it straightened out, mirror-tiled up and down) laid along the bend in short slices,
  // tapering a little from the stump's width (TREE_AT.w of the roots' picture) to the crown, the stump's outline down its sides
  const TREE = {}, TREE_AT = { x: -0.5, base: 2.2, cx: 0.523, cut: 0.404, w: 0.282, crown: 1.6, tipW: 0.36, ...LOOK.tree }; // (m, and of the pictures; B04 for Halloween)
  for (const k of ['base', 'crown', 'trunk']) { const im = new Image(); im.onload = () => { TREE[k] = im; }; im.src = `${LOOK.dir}/tree_${k}.webp`; }
  function drawTree(tx, ty, s) {
    const A_ = TREE_AT, bw = A_.base, bh = bw * TREE.base.naturalHeight / TREE.base.naturalWidth;
    const b0 = toScreen(A_.x - bw / 2, bh - 0.1); // (its picture's top left; sunk a little into the ground)
    const sx = A_.x + (A_.cx - 0.5) * bw, sy = bh * (1 - A_.cut) - 0.1;   // where the trunk comes out of the roots
    const P = (u) => { // a point along the trunk (0 at the roots, 1 at the top), and its width
      const cx = sx, cy = sy + (ty - sy) * 0.55, q = 1 - u;
      return { x: q * q * sx + 2 * q * u * cx + u * u * tx, y: q * q * sy + 2 * q * u * cy + u * u * ty, w: A_.w * bw * q + A_.tipW * u };
    };
    const left = [], right = [];
    for (let k = 0; k <= 16; k++) {
      const u = k / 16, a = P(u), b = P(Math.min(1, u + 0.01)), c = P(Math.max(0, u - 0.01));
      const dx = b.x - c.x, dy = b.y - c.y, n = Math.hypot(dx, dy) || 1; // (across the trunk there)
      left.push(toScreen(a.x - dy / n * a.w / 2, a.y + dx / n * a.w / 2)); right.push(toScreen(a.x + dy / n * a.w / 2, a.y - dx / n * a.w / 2));
    }
    g.drawImage(TREE.base, b0.x, b0.y, bw * s, bh * s);
    const T = TREE.trunk;
    if (T) { // the bark, slice by slice up the bend
      const rep = A_.w * bw * T.naturalHeight / T.naturalWidth; let v = 0; // (m of trunk per run of the bark picture)
      for (let k = 0; k < 16; k++) {
        const a = P(k / 16), b = P((k + 1) / 16), m = toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
        const len = Math.hypot(b.x - a.x, b.y - a.y), w = (a.w + b.w) / 2;
        const row = (v / rep % 1) * T.naturalHeight, sh = Math.min(T.naturalHeight - row, len / rep * T.naturalHeight);
        g.save(); g.translate(m.x, m.y); g.rotate(Math.atan2(b.x - a.x, b.y - a.y));
        g.drawImage(T, 0, row, T.naturalWidth, Math.max(1, sh), -w * s / 2, -len * s / 2 - 1, w * s, len * s + 2);
        g.restore(); v += len;
      }
    } else {
      g.beginPath(); left.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); [...right].reverse().forEach(p => g.lineTo(p.x, p.y)); g.closePath();
      g.fillStyle = '#b3623b'; g.fill();
    }
    g.strokeStyle = '#3a291c'; g.lineWidth = Math.max(2, s * 0.045); g.lineJoin = g.lineCap = 'round';
    for (const side of [left, right]) { g.beginPath(); side.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
    const cw = A_.crown, ch = cw * TREE.crown.naturalHeight / TREE.crown.naturalWidth, c = toScreen(tx - 0.1, ty - 0.15);
    g.save(); g.translate(c.x, c.y); g.rotate((tx - PULL.rest[0]) * -0.12); // (leaning as it's pulled)
    g.drawImage(TREE.crown, -cw * s / 2, -ch * s * 0.62, cw * s, ch * s);
    g.restore();
  }
  function hills(par, col, amp, freq) {
    g.fillStyle = col; g.beginPath(); g.moveTo(-20, ground());
    for (let x = -20; x <= W + 20; x += 8) { const wx = x + S.cam.scroll * par; g.lineTo(x, ground() - amp * (0.6 + 0.4 * Math.sin(wx * freq) * Math.cos(wx * freq * 0.37))); }
    g.lineTo(W + 20, ground()); g.fill();
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, Math.max(0, w), h, r) : g.rect(x, y, w, h); }

  function hud() {
    $('dist').textContent = Math.max(0, Math.floor(S.fox.x));
    $('speed').textContent = S.phase === 'sky' ? Math.round(SKY.speed * 3.6) : S.phase === 'fly' ? Math.round(Math.hypot(S.fox.vx, S.fox.vy) * 3.6) : 0; // (how fast it flies, km/h)
    $('stars').textContent = S.got;
    $('meterBar').style.width = `${(S.ready ? 1 : S.meter / SUPER.stars) * 100}%`;
    $('starPill').classList.toggle('ready', S.ready);
    $('frogPill').hidden = !S.frog;
    const el = $('tails');
    if (el.children.length !== TAILS) el.innerHTML = '<i>🔥</i>'.repeat(TAILS);
    [...el.children].forEach((c, i) => c.classList.toggle('used', i >= S.tails));
  }

  function end() {
    S.phase = 'done'; S.t = 0;
    const d = Math.floor(S.fox.x), isBest = d > best;
    S.newBest = isBest;
    // home with it: its stars and its farthest — to the pet that opened it, else kept here
    if (opts.onEnd) opts.onEnd({ dist: d, stars: S.got, best: Math.max(best, d) });
    else try { localStorage.setItem('ipet-fling-best', Math.max(best, d)); } catch (e) {}
    $('final').textContent = d;
    $('endTitle').textContent = isBest ? '🎉 新紀錄！' : '飛好遠！';
    $('endNote').textContent = `撿到 ${STAR} ${S.got} 顆，帶回家給小狐` + (isBest || !best ? '' : `（最遠 ${best} m）`);
    best = Math.max(best, d);
    hud();
    setTimeout(() => { $('end').hidden = false; }, 1200); // (a moment to see it cheer first)
  }
  function start() {
    S = fresh(); spawn(); hud();
    $('end').hidden = true;
  }
  // before the fling: drag anywhere to pull the fox back, let go to fling it; after: a tap anywhere (but on the
  // cards and buttons) is the one control. Space too (on the tree: a fling pulled 3/4 back at 45°)
  layer.addEventListener('pointerdown', e => {
    if (e.target.closest?.('.fl-card, button') || !S) return;
    if (S.phase === 'aim') { S.drag = at(e); S.spring = null; }
    else if (S.phase === 'sky') steer(at(e).x < W / 2 ? -1 : 1); // (on the clouds: a lane to that side)
    else tap();
  });
  layer.addEventListener('pointermove', e => { if (S?.drag && S.phase === 'aim') pullTo(e); });
  const up = () => { if (S?.drag) { S.drag = null; if (S.phase === 'aim') letGo(); } };
  layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
  addEventListener('keydown', e => {
    if (layer.hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); steer(e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.code !== 'Space' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (S?.phase === 'aim') { const r = PULL.max * 0.75 / Math.SQRT2; S.pull = { x: -r, y: -r }; letGo(); } else tap();
  });
  $('again').addEventListener('click', start);
  $('home').addEventListener('click', close);
  $('close').addEventListener('click', close);
  $('close2').addEventListener('click', close);

  let raf = 0, last = 0;
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    if (S) { step(dt); draw(dt); }
    raf = requestAnimationFrame(loop);
  }
  // open: the layer over everything, landscape, a fresh run waiting on the start card.
  // o: { tails, best, onEnd({ dist, stars, best }), onClose() } — none of it when on its own page
  function open(o = {}) {
    opts = o;
    TAILS = Math.max(1, Math.min(9, +params.get('tails') || o.tails || 1));
    best = o.best ?? (() => { try { return +localStorage.getItem('ipet-fling-best') || 0; } catch (e) { return 0; } })();
    if (!layer.isConnected) document.body.appendChild(layer);
    layer.hidden = false;
    // fullscreen and locked to landscape where the phone allows it (from the tap that opened it); else it asks (CSS)
    const fs = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    Promise.resolve(fs).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}).finally(resize);
    resize();
    start(); // (straight onto the tree, to be pulled back)
    cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(loop);
  }
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    layer.hidden = true; S = null;
    try { screen.orientation?.unlock?.(); } catch (e) {}
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (opts.onClose) opts.onClose();
    else if (history.length > 1) history.back(); else location.href = 'index.html'; // (its own page: back where it came from)
  }
  window.Fling = { open, close };
  if (params.has('debug')) Fling.state = () => S; // (?debug: the run, to look at from the console)
})();

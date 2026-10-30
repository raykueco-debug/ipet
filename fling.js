/* 小狐飛多遠 — a launch-and-bounce game (a prototype).
   The fox is flung off a bent branch (tap when the swing is high: the harder, the farther) and flies to the right.
   On the ground lie forest friends, and landing on one throws it on its own way: a rabbit bounces it, a bear sends it
   high, a frog hops it along, an owl carries it, a boar runs it forward, a mushroom springs it up, a squirrel gives it a dash back —
   a hedgehog only slows it. Its tails are its dashes, one each: a tap while rising, off up and on at a slant; a tap while falling is a
   dive down at a slant (onto the next friend), free. It bounces on the plain ground less and less, rolls, and stops: that's how far.
   Stars in the air on the way (more the higher it flies) go home with it (with the farthest it has gone, kept in the pet's own save); every
   SUPER of them caught, the next friend it lands on is a super bounce, off far and high.
   World: x metres along, y metres up (the ground at 0), seen from the side. */
(function () {
  const params = new URLSearchParams(location.search);
  const KEY = 'ipet-fox-v1';
  const G = 20;                        // gravity, m/s²
  // the fling: the fox pulled back on the little tree's top (dragged from anywhere), let go to fly the other way —
  // how far it's pulled the speed (min..max m/s), the way it's pulled the angle (within deg, up and to the right)
  const PULL = { rest: [0, 1.4], max: 2.6, least: 0.35, deg: [5, 80] };
  const LAUNCH = { min: 12, max: 42 };
  const DASH = { up: [6, 8], down: [2, -16] };     // up: a tail's dash [vx +, vy +]; down: a dive, as many as it likes [vx + (once a dive), vy at least]
  const DIVE_BOOST = 1.3;                          // diving onto a friend: its throw this much stronger
  const GROUND = { keep: 0.42, drag: 0.72, roll: 9 }; // a plain bounce keeps this of vy, this of vx; rolling slows by roll m/s²
  const SUPER = { stars: 10, vx: 10, vy: 26 };     // stars for a super bounce; what it adds to vx (at least 18), vy
  const STARS = { step: 4, band: 2, top: 40 };     // stars: a column every step m, a chance in each band m up to top — more the higher
  const CAM = { least: 0.6 };                      // the camera draws smaller as the fox climbs, down to this of its size; above, an arrow
  const FOX_H = 1.7;                   // the fox's drawn height, m
  // a throw at an angle (the bear's belly, the owl's carry, the giraffe's neck): all as strong, only the angle theirs —
  // the fox's own speed, at least min, and add more
  const THROW = { min: 20, add: 4 };
  const throwAt = (f, deg) => {
    const v = Math.max(Math.hypot(f.vx, f.vy), THROW.min) + THROW.add, a = deg * Math.PI / 180;
    f.vx = v * Math.cos(a); f.vy = v * Math.sin(a);
  };
  // the friends — h: how high it stands, m; w: how often; hit: what it does to the fox (and the fox's pose after);
  // the same words go on the start card
  const FRIENDS = {
    rabbit:   { e: '🐰', h: 0.9, w: 30, say: '彈一下', hit: f => { f.vy = 10; f.vx = Math.max(f.vx, 8) + 1; return 'boing'; } },
    frog:     { e: '🐸', h: 0.7, w: 14, say: '連跳三下', hit: f => { f.vy = 7; f.vx += 1; f.hops = 3; return 'hop'; } },
    mushroom: { e: '🍄', h: 1.1, w: 10, say: '彈超高', hit: f => { f.vy = 19; f.vx += 2; return 'big'; } },
    bear:     { e: '🐻', h: 1.3, r: 1.1, w: 8, say: '挺著大肚子睡覺：65° 彈飛', draw: drawBear, hit: f => { throwAt(f, 65); return 'big'; } },
    owl:      { e: '🦉', h: 1.2, w: 8,  say: '抓著 25° 斜飛', hit: f => { throwAt(f, 25); f.glide = 1.2; return 'whoosh'; } },
    giraffe:  { e: '🦒', h: 2.7, w: 8,  say: '用脖子 45° 甩出去', draw: drawGiraffe, hit: f => { throwAt(f, 45); f.hold = NECK.hold; return 'fling'; } },
    boar:     { e: '🐗', h: 1.0, w: 10, say: '背著往前衝', hit: f => { f.vy = 0; f.vx = Math.max(f.vx, 16) + 3; f.ride = 1; return 'whoosh'; } },
    hedgehog: { e: '🦔', h: 0.7, w: 14, say: '哎唷！變慢', hit: f => { f.vx *= 0.55; f.vy = 5; return 'ouch'; } },
    squirrel: { e: '🐿️', h: 0.8, w: 9,  say: '彈一下＋補 1 次衝刺', hit: f => { f.vy = 10; f.vx = Math.max(f.vx, 8) + 1; return 'refill'; } },
  };
  const KINDS = Object.keys(FRIENDS), WSUM = KINDS.reduce((a, k) => a + FRIENDS[k].w, 0);
  const ONLY = FRIENDS[params.get('friend')] && params.get('friend'); // (?friend=squirrel: all of one kind, to try it)
  const pickKind = () => { if (ONLY) return ONLY; let r = Math.random() * WSUM; for (const k of KINDS) if ((r -= FRIENDS[k].w) < 0) return k; return 'rabbit'; };

  // the pet's save (the same one the home screen keeps): its tails, its farthest
  const pet = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  const TAILS = Math.max(1, Math.min(9, +params.get('tails') || pet.tailsOverride || pet.tails || 1));
  let best = pet.fling?.best || 0;

  const cv = document.getElementById('game'), g = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener('resize', resize); resize();

  // the fox's clips: run (facing right: on the ground, and its most stretched frame in the air), pounce (crouched
  // on the branch; stretched out diving), roll (tumbling off a friend), joy (flung high), ouch, cheer / happy (at the end)
  const CLIPS = { run: 'walk_r_loop_run', pounce: 'walk_r_to_pounce_r', roll: 'roll_loop', joy: 'jump_joy_loop',
    ouch: 'surprised_loop', cheer: 'cheer_loop', happy: 'happy_loop' };
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
    tails: TAILS, friends: [], stars: [], nextFriend: 8, nextStar: 4, got: 0, meter: 0, ready: params.has('ready'), // (?ready: a super bounce waiting from the start, to try it)
    fx: [], cam: { x: 0, s: 1 }, shake: 0, passedBest: !best, hint: '往後拉小狐，放開就彈出去！',
  });

  function spawn() { // keep the way ahead filled, a screen and more past the fox
    const ahead = S.fox.x + 60;
    while (S.nextFriend < ahead) {
      S.friends.push({ x: S.nextFriend, x0: S.nextFriend, y: 0, kind: pickKind(), used: false, t: 0, carry: false });
      S.nextFriend += 6 + Math.random() * 12 + Math.min(10, S.nextFriend / 80); // (thinning out farther on)
    }
    while (S.nextStar < ahead) { // few down low, thick up high
      for (let y = 2; y < STARS.top; y += STARS.band) {
        if (Math.random() < 0.015 + 0.12 * (y / STARS.top) ** 1.2)
          S.stars.push({ x: S.nextStar + Math.random() * STARS.step, y: y + Math.random() * STARS.band, got: false });
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
    const s = S.cam.s, dx = (e.clientX - S.drag.x) / s, dy = -(e.clientY - S.drag.y) / s, len = Math.hypot(dx, dy);
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
    S.phase = 'fly'; S.hint = S.ready ? '✨ 碰到下一隻動物 → SUPER BOUNCE！' : '往上飛時點：尾巴往上衝　往下掉時點：俯衝';
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
    S.tails--; if (!S.ready) S.hint = '';
    f.vx += DASH.up[0]; f.vy = Math.max(f.vy, 0) + DASH.up[1]; f.dive = false;
    f.glide = f.ride = 0; f.hops = 0; f.still = 0; f.dash = 0.5; f.act = null; f.spin = 0;
    SFX.dash(); hud();
  }

  function landOn(a) { // onto a friend: its own throw, or a super bounce when the stars are full
    const f = S.fox, fr = FRIENDS[a.kind];
    const dived = f.dive; // (diving onto it: a hedgehog knocked away, any other friend's throw the stronger)
    a.used = true; a.t = 0; f.y = box(a).h; f.hops = 0; f.glide = 0; f.ride = 0; f.dive = false; f.dash = 0;
    dust(a.x, 0.2, 5);
    if (dived && a.kind === 'hedgehog') {
      a.kick = true; a.vy = 9; f.vy = 9; f.vx = Math.max(f.vx, 8);
      SFX.boing(); f.spin = 1; act('roll', 0.5); S.shake = 0.2;
      pop('撲飛！', a.x, fr.h + 1.5, '#ffe14d');
      return;
    }
    if (S.ready) {
      f.vy = SUPER.vy; f.vx = Math.max(f.vx, 18) + SUPER.vx; f.rainbow = 2.2; f.spin = 0;
      S.ready = false; S.meter = 0; S.shake = 0.5; S.hint = '';
      act('joy', 1.2); SFX.super();
      pop('SUPER BOUNCE!', a.x, fr.h + 2.5, '#ffe14d', 1.3); confetti(a.x, fr.h + 1, 60);
      return;
    }
    const s = fr.hit(f); SFX[s]?.();
    if (dived && s !== 'ouch') { f.vx *= DIVE_BOOST; f.vy *= DIVE_BOOST; pop('強力！', a.x + 1, fr.h + 2.4, '#ffb347', 0.6); }
    if (s === 'refill') { // a tail's dash back (no more than it has tails)
      const back = S.tails < TAILS; if (back) S.tails++;
      pop(back ? '+1 🔥' : '彈！', a.x, fr.h + 1.5, '#ffb347'); f.spin = 1; act('roll', 0.5); hud();
      return;
    }
    a.carry = a.kind === 'owl' || a.kind === 'boar';
    if (f.hold > 0) S.holder = a; // (the giraffe's: held in its mouth through the swing)
    if (s === 'ouch') act('ouch', 0.7);
    else if (s === 'big') act('joy', 0.8);
    else if (s === 'fling') { f.spin = 1.5; act('roll', 0.75); }
    else if (!a.carry) { f.spin = 1; act('roll', 0.5); }
    pop({ boing: '彈！', hop: '呱呱！', big: '飛高高！', whoosh: '咻～', fling: '甩～！', ouch: '哎唷！' }[s], a.x, fr.h + 1.5, s === 'ouch' ? '#ff8a8a' : '#fff');
  }

  function step(dt) {
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
      f.y = 0; f.dive = false;
      if (f.vy < 0) {
        if (f.hops > 0) { f.hops--; f.vy = 7; f.vx *= 0.97; SFX.hop(); dust(f.x, 0); }
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
      a.got = true; S.got++; SFX.star(); pop('+1', a.x, a.y + 0.6, '#ffe14d', 0.5);
      if (!S.ready && ++S.meter >= SUPER.stars) {
        S.ready = true; SFX.ready();
        pop('SUPER BOUNCE 準備好！', f.x + 2, f.y + 3, '#ffe14d', 0.9);
        S.hint = '✨ 碰到下一隻動物 → SUPER BOUNCE！';
      }
    }
    // past the farthest
    if (!S.passedBest && f.x > best) { S.passedBest = true; SFX.best(); pop('新紀錄！', f.x, f.y + 3, '#ffe14d'); confetti(f.x, f.y + 2); }
    friends(dt);
    spawn(); hud();
  }
  function friends(dt) { // the friends after the fox lands on them: each its own way
    const f = S.fox;
    for (const a of S.friends) {
      if (!a.used) continue;
      a.t += dt;
      if (a.kick) { a.x += 12 * dt; a.vy -= G * dt; a.y = Math.max(0, a.y + a.vy * dt); }           // knocked away, tumbling
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
    const f = S.fox;
    // the camera: the fox a third along, drawn smaller as it goes higher (so it stays in sight)
    const base = H / 13, want = Math.max(base * CAM.least, Math.min(base, (ground() - H * 0.18) / Math.max(1, f.y + FOX_H + 1)));
    S.cam.s += (want - S.cam.s) * Math.min(1, dt * 4);
    S.cam.x = Math.max(0, f.x); // (still while it's pulled back)
    const s = S.cam.s;
    g.save();
    if (S.shake > 0) g.translate((Math.random() - 0.5) * S.shake * 24, (Math.random() - 0.5) * S.shake * 24);
    // sky, hills far and near (moving less than the ground)
    const sky = g.createLinearGradient(0, 0, 0, ground());
    sky.addColorStop(0, '#8fd0ff'); sky.addColorStop(1, '#e6f6ff');
    g.fillStyle = sky; g.fillRect(-20, -20, W + 40, H + 40);
    hills(0.15, '#bfe3c6', H * 0.18, 0.004);
    hills(0.35, '#9fd4a5', H * 0.12, 0.009);
    // trees along the back (at half the ground's pace)
    for (let k = Math.floor((S.cam.x * 0.5 - 40) / 7); k < (S.cam.x * 0.5 + 60) / 7; k++) {
      const tx = (k * 7 - S.cam.x * 0.5) * s + W * 0.3 + ((k * 37) % 11), ty = ground() - 2;
      const th = s * (3 + ((k * 13) % 5) * 0.6);
      g.fillStyle = '#7a5a3a'; g.fillRect(tx - s * 0.15, ty - th * 0.4, s * 0.3, th * 0.4);
      g.fillStyle = (k % 3) ? '#5fb36a' : '#4fa35d';
      g.beginPath(); g.ellipse(tx, ty - th * 0.6, th * 0.32, th * 0.42, 0, 0, Math.PI * 2); g.fill();
    }
    // ground
    g.fillStyle = '#7cc46a'; g.fillRect(-20, ground(), W + 40, H);
    g.fillStyle = '#6ab35a';
    for (let k = Math.floor((S.cam.x - 40) / 2); k < (S.cam.x + 80) / 2; k++) { const p = toScreen(k * 2, 0); if (k % 2) g.fillRect(p.x, ground(), 2 * s, H - ground()); }
    g.fillStyle = '#9b7653'; g.fillRect(-20, ground() + Math.max(14, s * 0.6), W + 40, H);
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
      const b = toScreen(-0.5, 0), tip = toScreen(tx, ty), mid = toScreen(-0.5, ty * 0.55);
      g.strokeStyle = '#7a5a3a'; g.lineCap = 'round'; g.lineWidth = s * 0.3;
      g.beginPath(); g.moveTo(b.x, b.y); g.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y); g.stroke();
      for (const [ox, oy, r, c] of [[-0.8, 0.2, 0.5, '#4fa35d'], [-0.35, 0.75, 0.6, '#5fb36a'], [0.3, 0.45, 0.45, '#4fa35d']]) {
        const q = toScreen(tx + ox, ty + oy); g.fillStyle = c; g.beginPath(); g.arc(q.x, q.y, r * s, 0, Math.PI * 2); g.fill();
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
      g.save(); g.translate(p.x, p.y); g.scale(k, k); g.fillText('⭐', 0, 0); g.restore();
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
    if (a.kind === 'frog' || a.kind === 'boar' || a.kind === 'owl') { if (a.used) g.scale(-1, 1); } // (turned to go right, as the fox)
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
    const r = await fetch('assets/friends/index.json').catch(() => null);
    const names = r?.ok ? await r.json() : [];
    for (const name of names) {
      const [k, n] = name.split('_'), im = new Image();
      im.onload = () => { (ART[k] ||= {})[n] = im; }; im.src = `assets/friends/${name}.png`;
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
    if (a.used && (k === 'frog' || k === 'boar' || k === 'owl')) g.scale(-1, 1);      // (turned to go right, as the fox)
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
  function hills(par, col, amp, freq) {
    g.fillStyle = col; g.beginPath(); g.moveTo(-20, ground());
    for (let x = -20; x <= W + 20; x += 8) { const wx = x + S.cam.x * S.cam.s * par; g.lineTo(x, ground() - amp * (0.6 + 0.4 * Math.sin(wx * freq) * Math.cos(wx * freq * 0.37))); }
    g.lineTo(W + 20, ground()); g.fill();
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, Math.max(0, w), h, r) : g.rect(x, y, w, h); }

  const $ = id => document.getElementById(id);
  function hud() {
    $('dist').textContent = Math.max(0, Math.floor(S.fox.x));
    $('stars').textContent = S.got;
    $('meterBar').style.width = `${(S.ready ? 1 : S.meter / SUPER.stars) * 100}%`;
    $('starPill').classList.toggle('ready', S.ready);
    const el = $('tails');
    if (el.children.length !== TAILS) el.innerHTML = '<i>🔥</i>'.repeat(TAILS);
    [...el.children].forEach((c, i) => c.classList.toggle('used', i >= S.tails));
    $('hint').textContent = S.hint;
  }

  function end() {
    S.phase = 'done'; S.t = 0;
    const d = Math.floor(S.fox.x), isBest = d > best;
    S.newBest = isBest; S.hint = '';
    // home with it: its stars, its farthest, a bit of fun
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) {
        s.stars = (s.stars || 0) + S.got;
        s.fling = { best: Math.max(best, d), plays: (s.fling?.plays || 0) + 1 };
        if (s.stats) s.stats.fun = Math.min(100, (s.stats.fun || 0) + 8);
        localStorage.setItem(KEY, JSON.stringify(s));
      }
    } catch (e) {}
    $('final').textContent = d;
    $('endTitle').textContent = isBest ? '🎉 新紀錄！' : '飛好遠！';
    $('endNote').textContent = `撿到 ⭐ ${S.got} 顆，帶回家給小狐` + (isBest || !best ? '' : `（最遠 ${best} m）`);
    best = Math.max(best, d);
    hud();
    setTimeout(() => { $('end').hidden = false; }, 1200); // (a moment to see it cheer first)
  }
  function start() {
    S = fresh(); spawn(); hud();
    $('start').hidden = $('end').hidden = true;
  }
  // the start card's list of friends, from FRIENDS
  $('friends').innerHTML = KINDS.map(k => `<li><b>${FRIENDS[k].e}</b>${FRIENDS[k].say}</li>`).join('');
  $('superN').textContent = SUPER.stars;
  // before the fling: drag anywhere to pull the fox back, let go to fling it; after: a tap anywhere (but on the
  // cards) is the one control. Space too (on the tree: a fling pulled 3/4 back at 45°)
  addEventListener('pointerdown', e => {
    if (e.target.closest?.('.card') || !S) return;
    if (S.phase === 'aim') { S.drag = { x: e.clientX, y: e.clientY }; S.spring = null; }
    else tap();
  });
  addEventListener('pointermove', e => { if (S?.drag && S.phase === 'aim') pullTo(e); });
  const up = () => { if (S?.drag) { S.drag = null; if (S.phase === 'aim') letGo(); } };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (S?.phase === 'aim') { const r = PULL.max * 0.75 / Math.SQRT2; S.pull = { x: -r, y: -r }; letGo(); } else tap();
  });
  $('go').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('home').addEventListener('click', () => { location.href = 'index.html'; });

  S = fresh(); spawn(); hud(); S.phase = 'idle';
  let last = 0;
  (function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    if (S) { step(dt); draw(dt); }
    requestAnimationFrame(loop);
  })(0);
})();

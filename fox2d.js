/* 2D animated fox: plays the Wan clips in assets/fox/clips/ and chains them seamlessly.

   The home pose ("normal", sitting) is its own looping clip, normal_loop. Everything else hangs off it:
     moods    normal_to_<m> → <m>_loop (loops on the mood's own picture) → <m>_to_normal   (tools/wan_clips.sh)
     actions  normal_to_<a> → hold on the action pose → <a>_to_normal                     (tools/wan_actions.sh)
     walking  normal_to_walk[_r] → walk[_r]_loop ⇄ walk[_r]_turn → walk[_r]_to_normal     (tools/wan_walk.sh)
              walk = side-on facing left, walk_r = facing right; every turn is an animated clip, never a flip
   Every clip starts and ends on a fixed picture on one shared canvas, and a clip is only left at its last
   frame, so each joint is the same picture on both sides. The next clip's first frame (the picture just shown)
   is skipped after a transition, and a 2-frame cross-fade covers Wan's tiny first/last-frame differences.
   With nothing else to do the fox loops at home and now and then plays an idle action. Clips that aren't
   generated yet are skipped. app.js drives it through window.Fox2D: set({ mood }), poke(), go(dir) / stop(). */
(function () {
  const ROOT = 'assets/fox/clips/';
  const FPS = 16, FADE = 2, FADE_JUMP = 4;
  const MOODS = ['happy', 'love', 'surprised', 'curious', 'sad', 'angry'];
  const ACTIONS = { look_around: 3, tilt_left: 2, tilt_right: 2, look_up: 2, yawn: 1.5, stretch: 1 }; // weights
  // app.js expressions → the clip moods we have
  const MAP = { happy: 'happy', play: 'happy', love: 'love', eat: 'love', talkA: 'normal', talkB: 'normal',
                sad: 'sad', tired: 'sad', sleep: 'sad', meh: 'curious', curious: 'curious',
                surprised: 'surprised', angry: 'angry' };

  const host = document.getElementById('fox');
  const canvas = document.createElement('canvas');
  canvas.className = 'fox2d';
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  host.appendChild(canvas);

  const clips = {};   // name → { name, frames } once loaded; null while loading / missing
  let want = 'normal';
  let cur = null, i = 0, hold = 0, fadeFrom = null, fadeLeft = 0, fadeLen = 0;
  let homeLoops = 0, nextIdle = 3, action = null; // idle actions at home

  async function load(name) {
    if (clips[name] !== undefined) return clips[name];
    clips[name] = null;
    try {
      const meta = await fetch(ROOT + name + '/meta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null));
      if (!meta) return null;
      const frames = meta.frames.map(f => { const im = new Image(); im.src = ROOT + name + '/' + f; return im; });
      // wait for the first frames (onload, not decode(): decode() can hang while the page is in the background)
      await Promise.all(frames.slice(0, 2).map(im => new Promise(ok => {
        if (im.complete) return ok();
        im.onload = im.onerror = ok;
        setTimeout(ok, 3000);
      })));
      clips[name] = { name, frames };
    } catch (e) { clips[name] = null; }
    return clips[name];
  }

  const endsOn = name => (name.endsWith('_loop') ? name.slice(0, -5)
    : name.endsWith('_turn') ? (name === 'walk_turn' ? 'walk_r' : 'walk') : name.split('_to_')[1]);
  const isAction = a => a in ACTIONS;
  const WALK = ['normal_to_walk', 'normal_to_walk_r', 'walk_loop', 'walk_r_loop', 'walk_turn', 'walk_r_turn',
                'walk_to_normal', 'walk_r_to_normal'];
  const isWalk = a => a === 'walk' || a === 'walk_r';
  let go = null; // 'walk' (to the left) / 'walk_r' (to the right) while app.js wants the fox walking

  let poked = false; // a tap asked for an action: play one as soon as the fox is home

  function pickAction() {
    let ready = Object.keys(ACTIONS).filter(a => clips[`normal_to_${a}`] && clips[`${a}_to_normal`]);
    if (ready.length > 1) ready = ready.filter(a => a !== action); // never the same one twice in a row
    if (!ready.length) return null;
    let r = Math.random() * ready.reduce((n, a) => n + ACTIONS[a], 0);
    return ready.find(a => (r -= ACTIONS[a]) < 0) || ready[0];
  }

  // the clip that follows the one that just ended, on the way to what we want
  function next(name) {
    const at = endsOn(name);
    if (go) { // walking: home first, stand up facing the way to go, turn round when it changes
      if (isWalk(at)) return at === go ? `${go}_loop` : `${at}_turn`;
      return at === 'normal' ? `normal_to_${go}` : `${at}_to_normal`;
    }
    if (isWalk(at)) return `${at}_to_normal`;                    // stopped: turn to us and sit down
    if (isAction(at)) return `${at}_to_normal`;                 // actions always go back home
    if (at === 'normal') {
      if (poked) { // tapped: an action first, whatever the mood
        poked = false;
        action = pickAction();
        if (action) return `normal_to_${action}`;
      }
      if (want !== 'normal') return `normal_to_${want}`;
      if (name === 'normal_loop' && ++homeLoops >= nextIdle) { // time for an idle action?
        homeLoops = 0;
        nextIdle = 2 + Math.floor(Math.random() * 3);
        action = pickAction();
        if (action) return `normal_to_${action}`;
      }
      return 'normal_loop';
    }
    return at === want && !poked ? `${want}_loop` : `${at}_to_normal`;
  }

  // skip: the next clip's first frame repeats the picture just shown — true after a transition (its last
  // frame IS the picture), false after a loop (loops already dropped their duplicate last frame)
  function switchTo(name, jump, skip = false) {
    const target = clips[name];
    if (!target) return false;
    fadeFrom = cur ? cur.frames[Math.min(i, cur.frames.length - 1)] : null;
    fadeLen = fadeLeft = fadeFrom ? (jump ? FADE_JUMP : FADE) : 0;
    cur = target;
    i = skip && target.frames.length > 1 ? 1 : 0;
    return true;
  }

  function advance() {
    if (!cur) return;
    if (i < cur.frames.length - 1) { i++; return; }
    if (hold > 0) { hold--; return; }
    const at = endsOn(cur.name);
    if (isAction(at) && !cur.held) { // pause on the action pose before going home
      cur.held = true;
      hold = 6 + Math.floor(Math.random() * 7);
      return;
    }
    cur.held = false;
    const name = next(cur.name);
    if (name === cur.name) { i = 0; return; } // keep looping
    if (switchTo(name, false, !cur.name.endsWith('_loop'))) return;
    // that clip isn't there yet: jump straight to a loop we have
    for (const alt of [`${want}_loop`, 'normal_loop']) if (switchTo(alt, true)) return;
    i = 0;
  }

  function draw() {
    if (!cur) return;
    const f = cur.frames[i];
    g.clearRect(0, 0, 512, 512);
    if (f.complete && f.naturalWidth) g.drawImage(f, 0, 0, 512, 512);
    if (fadeLeft > 0 && fadeFrom?.complete) {
      g.globalAlpha = fadeLeft / (fadeLen + 1);
      g.drawImage(fadeFrom, 0, 0, 512, 512);
      g.globalAlpha = 1;
      fadeLeft--;
    }
  }

  function tick() {
    advance();
    draw();
  }

  async function init() {
    await load('normal_loop');
    switchTo('normal_loop', true);
    setInterval(tick, 1000 / FPS); // a fixed clock (rAF stops while the page is hidden)
    // the rest in the background: idle actions first (they play right away), then moods
    for (const a of Object.keys(ACTIONS)) { await load(`normal_to_${a}`); await load(`${a}_to_normal`); }
    for (const c of WALK) await load(c);
    for (const m of MOODS) { await load(`${m}_loop`); await load(`normal_to_${m}`); await load(`${m}_to_normal`); }
  }

  window.Fox2D = {
    set({ mood }) {
      const m = MAP[mood] || 'normal';
      if (m === want) return;
      want = m;
      if (m !== 'normal') { load(`normal_to_${m}`); load(`${m}_loop`); load(`${m}_to_normal`); }
    },
    // a tap: play a random idle action next. From the home loop it leaves right away (a short cross-fade
    // instead of waiting for the loop to end); otherwise it plays once the fox is back home.
    poke() {
      poked = true; // in another mood the fox goes home first (next() routes there while poked)
      if (cur?.name === 'normal_loop') {
        const name = next('normal_loop');
        if (name !== 'normal_loop') switchTo(name, true);
      }
    },
    // walking: the fox leaves a loop (home or walking) at once, with a short cross-fade, so it answers a finger
    // quickly; any other clip is played to its end first. app.js moves it only while state.walking.
    go(dir) {
      if (dir === go) return;
      go = dir;
      if (cur && (cur.name === 'normal_loop' || (go && cur.name.startsWith('walk') && cur.name.endsWith('_loop'))))
        switchTo(next(cur.name), true);
    },
    stop() {
      if (!go) return;
      go = null;
      if (cur?.name.startsWith('walk') && cur.name.endsWith('_loop')) switchTo(next(cur.name), true);
    },
    get canWalk() { return WALK.every(c => clips[c]); },
    get state() { return { clip: cur?.name, frame: i, want, action, go, walking: !!go && cur?.name === `${go}_loop` }; },
    ready: init().then(() => true, () => false),
  };
})();

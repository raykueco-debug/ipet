/* 2D animated fox: plays the Wan clips in assets/fox/clips/ and chains them seamlessly.

   The home pose ("normal", sitting) is its own looping clip, normal_loop. Everything else hangs off it:
     moods    normal_to_<m> → <m>_loop (loops on the mood's own picture) → <m>_to_normal   (tools/wan_clips.sh)
     actions  normal_to_<a> → hold on the action pose → <a>_to_normal                     (tools/wan_actions.sh)
     petted   love_loop_rub, on the love picture, while a finger rubs the head            (tools/wan_rub.sh)
     walking  normal_to_walk[_r] → walk[_r]_loop[_<face>] ⇄ walk[_r]_turn → walk[_r]_to_normal (tools/wan_walk.sh)
              walk = side-on facing left, walk_r = facing right; every turn is an animated clip, never a flip
   Every clip starts and ends on a fixed picture on one shared canvas, so a joint is the same picture on both
   sides: clips are hard-cut there, no cross-fade (it ghosted). A loop is left at its end, or early at one of
   its "exits" — frames that match its own first picture, listed in meta.json by tools/clip_exits.py — so the
   fox answers quickly without a jump. Clips that aren't generated yet are skipped.
   app.js drives it through window.Fox2D: set({ mood }), poke(), rub(on), go(dir) / stop(). */
(function () {
  const ROOT = 'assets/fox/clips/';
  const FPS = 16;
  const MOODS = ['happy', 'love', 'surprised', 'curious', 'sad', 'angry'];
  const ACTIONS = { look_around: 3, tilt_left: 2, tilt_right: 2, look_up: 2, yawn: 1.5, stretch: 1 }; // weights
  const FACES = ['ahead', 'happy', 'up', 'back']; // walk loop variants; the plain loop plays most
  const WALK = ['normal_to_walk', 'normal_to_walk_r', 'walk_loop', 'walk_r_loop', 'walk_turn', 'walk_r_turn',
                'walk_to_normal', 'walk_r_to_normal'];
  // app.js expressions → the clip moods we have
  const MAP = { happy: 'happy', play: 'happy', love: 'love', eat: 'love', talkA: 'normal', talkB: 'normal',
                sad: 'sad', tired: 'sad', sleep: 'sad', meh: 'curious', curious: 'curious',
                surprised: 'surprised', angry: 'angry' };

  const host = document.getElementById('fox');
  const canvas = document.createElement('canvas');
  canvas.className = 'fox2d';
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  canvas.style.transformOrigin = '50% 92%'; // sways about the feet when the head is rubbed
  host.appendChild(canvas);

  const clips = {};   // name → { name, frames, exits } once loaded; null while loading / missing
  let want = 'normal';
  let cur = null, i = 0, hold = 0;
  let homeLoops = 0, nextIdle = 3, action = null; // idle actions at home
  let poked = false;  // a tap asked for an action: play one as soon as the fox is home
  let rubbing = false; // a finger is rubbing the head
  let eating = false;  // a bowl is in front of it: lean down and eat (tools/wan_eat.sh)
  let go = null;      // 'walk' (to the left) / 'walk_r' (to the right) while app.js wants the fox walking

  async function load(name) {
    if (clips[name] !== undefined) return clips[name];
    clips[name] = null;
    try {
      const meta = await fetch(ROOT + name + '/meta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null));
      if (!meta) return null;
      const v = meta.rev ? '?v=' + meta.rev : ''; // a new revision (tools/clip_fill.py) skips cached frames
      const frames = meta.frames.map(f => { const im = new Image(); im.src = ROOT + name + '/' + f + v; return im; });
      // wait for the first frames (onload, not decode(): decode() can hang while the page is in the background)
      await Promise.all(frames.slice(0, 2).map(im => new Promise(ok => {
        if (im.complete) return ok();
        im.onload = im.onerror = ok;
        setTimeout(ok, 3000);
      })));
      clips[name] = { name, frames, exits: meta.exits || [] };
    } catch (e) { clips[name] = null; }
    return clips[name];
  }

  const isLoop = name => name.includes('_loop');
  const endsOn = name => (isLoop(name) ? name.split('_loop')[0]
    : name.endsWith('_turn') ? (name === 'walk_turn' ? 'walk_r' : 'walk') : name.split('_to_')[1]);
  const isAction = a => a in ACTIONS;
  const isWalk = a => a === 'walk' || a === 'walk_r';
  const mood = () => (eating && clips.eat_loop ? 'eat' : rubbing ? 'love' : want);

  function pickAction() {
    let ready = Object.keys(ACTIONS).filter(a => clips[`normal_to_${a}`] && clips[`${a}_to_normal`]);
    if (ready.length > 1) ready = ready.filter(a => a !== action); // never the same one twice in a row
    if (!ready.length) return null;
    let r = Math.random() * ready.reduce((n, a) => n + ACTIONS[a], 0);
    return ready.find(a => (r -= ACTIONS[a]) < 0) || ready[0];
  }

  // which loop to play on picture `at` (walk loops: now and then one that does something with the face)
  function loopFor(at) {
    if (at === 'love' && rubbing && clips.love_loop_rub) return 'love_loop_rub';
    if (isWalk(at) && Math.random() < 0.4) {
      const faces = FACES.map(f => `${at}_loop_${f}`).filter(c => clips[c]);
      if (faces.length) return faces[Math.floor(Math.random() * faces.length)];
    }
    return `${at}_loop`;
  }

  // does the loop that is playing still fit what is wanted? (pure: no side effects)
  function stays(name) {
    const at = endsOn(name);
    if (go) return at === go;
    if (isWalk(at)) return false;
    if (at === 'normal') return !poked && mood() === 'normal';
    if (name === 'love_loop_rub') return rubbing;
    return !poked && at === mood() && !(at === 'love' && rubbing && clips.love_loop_rub);
  }

  // the clip that follows the one that just ended, on the way to what we want
  function next(name) {
    const at = endsOn(name);
    if (go) { // walking: home first, stand up facing the way to go, turn round when it changes
      if (isWalk(at)) return at === go ? loopFor(go) : `${at}_turn`;
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
      if (mood() !== 'normal') return `normal_to_${mood()}`;
      if (name === 'normal_loop' && ++homeLoops >= nextIdle) { // time for an idle action?
        homeLoops = 0;
        nextIdle = 2 + Math.floor(Math.random() * 3);
        action = pickAction();
        if (action) return `normal_to_${action}`;
      }
      return 'normal_loop';
    }
    return at === mood() && !poked ? loopFor(at) : `${at}_to_normal`;
  }

  // skip: the next clip's first frame repeats the picture just shown (after a transition, or at a loop exit)
  function switchTo(name, skip) {
    const target = clips[name];
    if (!target) return false;
    cur = target;
    i = skip && target.frames.length > 1 ? 1 : 0;
    return true;
  }

  function leave(skip) {
    const name = next(cur.name);
    if (name === cur.name) { i = 0; return; } // keep looping
    if (switchTo(name, skip)) return;
    // that clip isn't there yet: jump straight to a loop we have
    for (const alt of [`${mood()}_loop`, 'normal_loop']) if (switchTo(alt, false)) return;
    i = 0;
  }

  function advance() {
    if (!cur) return;
    if (i < cur.frames.length - 1) {
      // a loop that no longer fits leaves early at an exit frame (same picture as its start)
      if (isLoop(cur.name) && cur.exits.includes(i) && !stays(cur.name)) return leave(true);
      i++;
      return;
    }
    if (hold > 0) { hold--; return; }
    if (isAction(endsOn(cur.name)) && !cur.held) { // pause on the action pose before going home
      cur.held = true;
      hold = 6 + Math.floor(Math.random() * 7);
      return;
    }
    cur.held = false;
    leave(!isLoop(cur.name)); // a transition's last frame is the next clip's first; a loop already dropped it
  }

  function draw() {
    if (!cur) return;
    const f = cur.frames[i];
    if (!f.complete || !f.naturalWidth) return; // keep the last picture rather than a blank
    g.clearRect(0, 0, 512, 512);
    g.drawImage(f, 0, 0, 512, 512);
  }

  function tick() {
    advance();
    draw();
  }

  async function init() {
    await load('normal_loop');
    switchTo('normal_loop', false);
    setInterval(tick, 1000 / FPS); // a fixed clock (rAF stops while the page is hidden)
    // the rest in the background: what plays soonest first
    for (const a of Object.keys(ACTIONS)) { await load(`normal_to_${a}`); await load(`${a}_to_normal`); }
    for (const c of WALK) await load(c);
    for (const m of MOODS) { await load(`${m}_loop`); await load(`normal_to_${m}`); await load(`${m}_to_normal`); }
    await load('love_loop_rub');
    for (const c of ['normal_to_eat', 'eat_loop', 'eat_to_normal']) await load(c);
    for (const f of FACES) { await load(`walk_loop_${f}`); await load(`walk_r_loop_${f}`); }
  }

  window.Fox2D = {
    set({ mood: m }) {
      want = MAP[m] || 'normal';
      if (want !== 'normal') { load(`normal_to_${want}`); load(`${want}_loop`); load(`${want}_to_normal`); }
    },
    poke() { poked = true; },       // a tap: a random idle action next (from any mood: home first)
    rub(on) { rubbing = !!on; },    // finger rubbing the head: the petted loop until it stops
    // the head follows the rubbing finger a little (x, y: finger offset from the head, about -1…1);
    // nudge() with no arguments lets it settle back
    nudge(x, y) {
      const on = x != null;
      canvas.style.transition = `transform ${on ? 0.12 : 0.35}s ease-out`;
      canvas.style.transform = on ? `translate(${x * 4}px, ${y * 3}px) rotate(${x * 3}deg)` : '';
    },
    eat(on) { eating = !!on; },     // bowl in front: eat until it's taken away
    go(dir) { go = dir; },          // start walking / turn round ('walk' left, 'walk_r' right)
    stop() { go = null; },          // stop, turn to us and sit
    get canWalk() { return WALK.every(c => clips[c]); },
    get canEat() { return ['normal_to_eat', 'eat_loop', 'eat_to_normal'].every(c => clips[c]); },
    get state() {
      return { clip: cur?.name, frame: i, want, action, go, rubbing, eating: cur?.name === 'eat_loop',
               walking: !!go && !!cur && cur.name.startsWith(`${go}_loop`) };
    },
    ready: init().then(() => true, () => false),
  };
})();

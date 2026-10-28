/* 2D animated fox: plays the Wan clips in assets/fox/clips/ and chains them seamlessly.

   The home pose ("normal", sitting) is its own looping clip, normal_loop. Everything else hangs off it:
     moods    normal_to_<m> → <m>_loop (loops on the mood's own picture) → <m>_to_normal   (tools/wan_clips.sh)
     actions  normal_to_<a> → hold on the action pose → <a>_to_normal                     (tools/wan_actions.sh)
     petted   love_loop_rub, on the love picture, while a finger rubs the head            (tools/wan_rub.sh)
     sleep    normal_to_drowsy → drowsy_loop → drowsy_to_sleep → sleep_loop[_dream] → sleep_to_normal (tools/wan_sleep.sh)
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
  const ACTIONS = { look_around: 3, tilt_left: 2, tilt_right: 2, look_up: 2, yawn: 1.5, stretch: 1,
                    lick: 1.5, scratch: 2, chase_tail: 1.5, belly: 1, sneeze: 1, play_bow: 1.5, sniff: 1.5,
                    jump_joy: 1, think: 1, bored: 1, hug_tail: 1.5, shy: 1,
                    clap: 1, peekaboo: 1.5, blow_kiss: 1, dance: 1, beg: 1, roll: 1.5,
                    sit_back: 1.5, rest: 1, look_back: 1, stretch_up: 1, look_down_l: 1.5, look_down_r: 1.5,
                    giggle: 1, wink: 1, sing: 1,
                    paw: 0, wave: 0, nod: 0, shake_no: 0, shake_dry: 0, hungry: 0, shiver: 0, proud: 0,
                    present_l: 0, present_r: 0, cheer: 0, cover_ears: 0, sorry: 0, delight: 0 }; // weights (0: only on cue, Fox2D.play)
  const FACES = ['ahead', 'happy', 'up', 'back']; // walk loop variants; the plain loop plays most
  const WALK = ['normal_to_walk', 'normal_to_walk_r', 'walk_loop', 'walk_r_loop', 'walk_turn', 'walk_r_turn',
                'walk_to_normal', 'walk_r_to_normal'];
  // app.js expressions → the clip moods we have
  const MAP = { happy: 'happy', play: 'happy', love: 'love', eat: 'love', talkA: 'normal', talkB: 'normal',
                sad: 'sad', tired: 'drowsy', sleep: 'sleep', meh: 'curious', curious: 'curious',
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
  let cue = null;     // that action, when it was named (play())
  let rubbing = false; // a finger is rubbing the head
  let eating = false;  // a bowl is in front of it: lean down and eat (tools/wan_eat.sh)
  let talking = false; // its speech bubble is up: the home loop with the mouth moving
  let drinking = false; // at the water bowl: the eating picture, lapping (eat_loop_drink)
  let holdLoops = 0;   // an action's own loop (<action>_loop): rounds left before it goes home
  let go = null;      // 'walk' (to the left) / 'walk_r' (to the right) while app.js wants the fox walking
  let push = false;   // standing at the ball: nudge it with the nose next (walk[_r]_loop_push)

  async function load(name, wait = false) { // wait: until its first frames are in (the first clip only)
    if (clips[name] !== undefined) return clips[name];
    clips[name] = null;
    try {
      const meta = await fetch(ROOT + name + '/meta.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null));
      if (!meta) return null;
      const v = meta.rev ? '?v=' + meta.rev : ''; // a new revision (tools/clip_fill.py) skips cached frames
      // pictures are fetched only when the clip is needed (fetch()): ~150 clips × ~20 frames at once jammed the
      // server and would cost a tablet some 60 MB up front
      const frames = meta.frames.map(f => { const im = new Image(); im.dataset.src = ROOT + name + '/' + f + v; return im; });
      clips[name] = { name, frames, exits: meta.exits || [] };
      if (wait) await fetchFrames(clips[name], 2);
    } catch (e) { clips[name] = null; }
    return clips[name];
  }

  // start downloading a clip's pictures; resolves once the first `upTo` (all by default) are in
  function fetchFrames(clip, upTo = Infinity) {
    const ims = clip.frames.map(im => {
      if (!im.src) im.src = im.dataset.src;
      return im;
    }).slice(0, upTo);
    // onload, not decode(): decode() can hang while the page is in the background
    return Promise.all(ims.map(im => new Promise(ok => {
      if (im.complete) return ok();
      im.addEventListener('load', ok); im.addEventListener('error', ok);
      setTimeout(ok, 8000);
    })));
  }

  const isLoop = name => name.includes('_loop');
  const endsOn = name => (isLoop(name) ? name.split('_loop')[0]
    : name.endsWith('_turn') ? (name === 'walk_turn' ? 'walk_r' : 'walk') : name.split('_to_')[1]);
  const isAction = a => a in ACTIONS;
  const VIEWS = ['walk', 'walk_r', 'walk_front', 'walk_back']; // side-on left / right, toward the viewer, away
  const isWalk = a => VIEWS.includes(a);
  const mood = () => ((eating || drinking) && clips.eat_loop ? 'eat' : rubbing ? 'love' : want);

  function pickAction() {
    let ready = Object.keys(ACTIONS).filter(a => ACTIONS[a] && clips[`normal_to_${a}`] && clips[`${a}_to_normal`]);
    if (ready.length > 1) ready = ready.filter(a => a !== action); // never the same one twice in a row
    if (!ready.length) return null;
    let r = Math.random() * ready.reduce((n, a) => n + ACTIONS[a], 0);
    return ready.find(a => (r -= ACTIONS[a]) < 0) || ready[0];
  }

  // which loop to play on picture `at` (walk loops: now and then one that does something with the face)
  function loopFor(at) {
    if (at === 'love' && rubbing && clips.love_loop_rub) return 'love_loop_rub';
    if (at === 'eat' && drinking && clips.eat_loop_drink) return 'eat_loop_drink';
    if (at === 'normal' && talking && clips.normal_loop_talk) return 'normal_loop_talk';
    if (at === 'normal' && !talking && Math.random() < 0.35) { // now and then another way of sitting there
      const ways = ['listen', 'ears', 'tail', 'blink', 'sway'].map(v => `normal_loop_${v}`).filter(c => clips[c]);
      if (ways.length) return ways[Math.floor(Math.random() * ways.length)];
    }
    if (at === 'sleep' && clips.sleep_to_sleep_belly && clips.sleep_belly_to_sleep && Math.random() < 0.12) return 'sleep_to_sleep_belly';
    if (at === 'sleep_belly') return clips.sleep_belly_loop && Math.random() < 0.75 ? 'sleep_belly_loop' : 'sleep_belly_to_sleep';
    if (at === 'sleep' && clips.sleep_loop_dream && Math.random() < 0.3) return 'sleep_loop_dream';
    if (isWalk(at) && Math.random() < 0.4) {
      const faces = FACES.map(f => `${at}_loop_${f}`).filter(c => clips[c]);
      if (faces.length) return faces[Math.floor(Math.random() * faces.length)];
    }
    if (MOODS.includes(at) && clips[`${at}_loop_2`] && Math.random() < 0.4) return `${at}_loop_2`; // a mood's other loop
    return `${at}_loop`;
  }

  // does the loop that is playing still fit what is wanted? (pure: no side effects)
  function stays(name) {
    const at = endsOn(name);
    if (go) return at === go && !(push && clips[`${go}_loop_push`]);
    if (isWalk(at)) return false;
    if (at === 'normal') return !poked && mood() === 'normal' && (name === 'normal_loop_talk') === (talking && !!clips.normal_loop_talk);
    if (name === 'love_loop_rub') return rubbing;
    if (name === 'eat_loop_drink') return drinking;
    if (isAction(at)) return !poked && holdLoops > 0; // an action's loop: its rounds (leaves early when tapped)
    return !poked && at === mood() && !(at === 'love' && rubbing && clips.love_loop_rub);
  }

  // the clip that follows the one that just ended, on the way to what we want
  function next(name) {
    const at = endsOn(name);
    if (go) { // walking: home first, stand up facing the way to go, turn round when it changes
      if (isWalk(at) && at === go && push && clips[`${go}_loop_push`]) { push = false; return `${go}_loop_push`; }
      if (isWalk(at)) { // facing the wrong way: turn round (a clip from this view to that one, or by sitting down)
        if (at === go) return loopFor(go);
        if (clips[`${at}_to_${go}`]) return `${at}_to_${go}`;
        if (clips[`${at}_turn`] && endsOn(`${at}_turn`) === go) return `${at}_turn`;
        return `${at}_to_normal`;
      }
      return at === 'normal' ? `normal_to_${go}` : `${at}_to_normal`;
    }
    if (isWalk(at)) return `${at}_to_normal`;                    // stopped: turn to us and sit down
    if (isAction(at)) return `${at}_to_normal`;                 // actions always go back home
    if (at === 'normal') {
      if (poked) { // tapped (or cued): an action first, whatever the mood
        poked = false;
        action = cue && clips[`normal_to_${cue}`] && clips[`${cue}_to_normal`] ? cue : pickAction();
        cue = null;
        if (action) return `normal_to_${action}`;
      }
      if (mood() === 'sleep') return 'normal_to_drowsy'; // to sleep by way of dozing off
      if (mood() !== 'normal') return `normal_to_${mood()}`;
      if (name === 'normal_loop' && ++homeLoops >= nextIdle) { // time for an idle action?
        homeLoops = 0;
        nextIdle = 2 + Math.floor(Math.random() * 3);
        action = pickAction();
        if (action) return `normal_to_${action}`;
      }
      return loopFor('normal');
    }
    if (at === 'sleep_belly') return mood() === 'sleep' ? loopFor('sleep_belly') : 'sleep_belly_to_sleep'; // roll back first
    if (at === 'drowsy' && mood() === 'sleep' && !poked) return 'drowsy_to_sleep';
    return at === mood() && !poked ? loopFor(at) : `${at}_to_normal`;
  }

  // skip: the next clip's first frame repeats the picture just shown (after a transition, or at a loop exit)
  function switchTo(name, skip) {
    const target = clips[name];
    if (!target) return false;
    fetchFrames(target); // (already there, mostly: see init's prefetch)
    cur = target;
    i = skip && target.frames.length > 1 ? 1 : 0;
    return true;
  }

  function leave(skip) {
    const name = next(cur.name);
    if (name === cur.name) { i = 0; return; } // keep looping
    if (switchTo(name, skip)) return;
    // that clip isn't there yet: keep looping where the fox is (no jump) until it is; else back home
    for (const alt of [`${endsOn(cur.name)}_loop`, 'normal_loop']) if (switchTo(alt, false)) return;
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
    const act = endsOn(cur.name);
    if (isAction(act) && !go) { // at an action's pose: its own loop a round or two, if it has one
      if (!isLoop(cur.name) && clips[`${act}_loop`]) { holdLoops = 1 + (Math.random() < 0.5 ? 1 : 0); switchTo(`${act}_loop`, true); return; }
      if (isLoop(cur.name) && --holdLoops > 0 && !poked) { i = 0; return; }
    }
    if (isAction(endsOn(cur.name)) && !isLoop(cur.name) && !cur.held) { // pause on the action pose before going home
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
    await load('normal_loop', true);
    switchTo('normal_loop', false);
    setInterval(tick, 1000 / FPS); // a fixed clock (rAF stops while the page is hidden)
    // the rest in the background: their frame lists six at a time (small), then their pictures one clip at a
    // time; a clip needed before its pictures are in fetches them at once, and draw() keeps the last picture
    const names = [
      ...Object.keys(ACTIONS).flatMap(a => [`normal_to_${a}`, `${a}_to_normal`]),
      ...WALK,
      ...MOODS.flatMap(m => [`${m}_loop`, `normal_to_${m}`, `${m}_to_normal`, `${m}_loop_2`]),
      'love_loop_rub', 'normal_to_eat', 'eat_loop', 'eat_to_normal', 'eat_loop_drink',
      ...Object.keys(ACTIONS).map(a => `${a}_loop`), // poses with a loop of their own (the rest just 404)
      'normal_to_drowsy', 'drowsy_loop', 'drowsy_to_normal', 'drowsy_to_sleep', 'sleep_loop', 'sleep_loop_dream',
      'sleep_to_normal', 'sleep_to_sleep_belly', 'sleep_belly_loop', 'sleep_belly_to_sleep', 'normal_loop_talk', 'normal_loop_listen', 'normal_loop_ears', 'normal_loop_tail', 'normal_loop_blink', 'normal_loop_sway',
      ...[...FACES, 'push'].flatMap(f => [`walk_loop_${f}`, `walk_r_loop_${f}`]),
      ...['walk_front', 'walk_back'].flatMap(v => [`${v}_loop`, `normal_to_${v}`, `${v}_to_normal`,
        `walk_to_${v}`, `${v}_to_walk`, `walk_r_to_${v}`, `${v}_to_walk_r`]),
      'walk_front_to_walk_back', 'walk_back_to_walk_front',
    ];
    let next = 0;
    const worker = async () => { while (next < names.length) await load(names[next++]); };
    await Promise.all(Array.from({ length: 6 }, worker));
    // then their pictures, one clip at a time, in the same order (what plays soonest first) — not waited for
    (async () => { for (const n of names) if (clips[n]) await fetchFrames(clips[n]); })();
  }

  window.Fox2D = {
    set({ mood: m }) {
      want = MAP[m] || 'normal';
      if (want !== 'normal') { load(`normal_to_${want}`); load(`${want}_loop`); load(`${want}_to_normal`); }
    },
    poke() { poked = true; },       // a tap: a random idle action next (from any mood: home first)
    play(a) { cue = a; poked = true; }, // that action next (e.g. 'paw' to bat the ball)
    get canPlay() { return !!(clips.normal_to_paw && clips.paw_to_normal); },
    nudge_ball() { push = true; },  // standing at the ball (walking, not moving): push it with the nose next
    get canPush() { return !!(clips.walk_loop_push && clips.walk_r_loop_push); },
    rub(on) { rubbing = !!on; },    // finger rubbing the head: the petted loop until it stops
    talk(on) { talking = !!on; },   // speech bubble up / down
    // the head follows the rubbing finger a little (x, y: finger offset from the head, about -1…1);
    // nudge() with no arguments lets it settle back
    nudge(x, y) {
      const on = x != null;
      canvas.style.transition = `transform ${on ? 0.12 : 0.35}s ease-out`;
      canvas.style.transform = on ? `translate(${x * 4}px, ${y * 3}px) rotate(${x * 3}deg)` : '';
    },
    eat(on) { eating = !!on; },     // bowl in front: eat until it's taken away
    drink(on) { drinking = !!on; }, // at the water bowl: lap until it's had enough
    go(dir) { go = dir; },          // start walking / turn round ('walk' left, 'walk_r' right)
    stop() { go = null; },          // stop, turn to us and sit
    get canWalk() { return WALK.every(c => clips[c]); },
    // toward / away from the viewer: walk loops, ways in and out, and turns to and from side-on
    get canWalkDepth() {
      return ['walk_front', 'walk_back'].every(v => clips[`${v}_loop`] && clips[`normal_to_${v}`] && clips[`${v}_to_normal`] &&
        clips[`walk_to_${v}`] && clips[`${v}_to_walk`] && clips[`walk_r_to_${v}`] && clips[`${v}_to_walk_r`]);
    },
    get canEat() { return ['normal_to_eat', 'eat_loop', 'eat_to_normal'].every(c => clips[c]); },
    get state() {
      return { clip: cur?.name, frame: i, want, action, go, rubbing, eating: cur?.name === 'eat_loop',
               walking: !!go && !!cur && cur.name.startsWith(`${go}_loop`) && !cur.name.endsWith('_push'),
               pushing: !!cur && cur.name.endsWith('_loop_push') };
    },
    ready: init().then(() => true, () => false),
  };
})();

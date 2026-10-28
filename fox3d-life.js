/* Liveliness layer for the 3D fox (fox3d.js): the things that make a 2D sprite feel alive, done in 3D.
   - springs: ears and tails lag behind the body and settle with a wobble
   - gaze: head and eyes follow the finger / mouse; idle glances when nobody points
   - acting: short performances per expression (anticipation → overshoot → settle, squash & stretch)
   - manga marks (漫符): 💢 ✨ 💕 ❗ ❓ 💧 💤 and blush, popping in beside the head
   fox3d.js calls life.update() every frame after the clip, then applies life.pose to the fox object. */

// ---------------------------------------------------------------- small helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const bump = (t, a, b) => (t < a || t > b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)));
const wobble = (t, start, freq, decay) => (t < start ? 0 : Math.exp(-decay * (t - start)) * Math.cos(freq * (t - start)));
const backOut = x => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

class Spring { // damped spring on one value
  constructor(k = 140, c = 9) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(dt, target = 0, push = 0) {
    if (!(dt > 0)) return this.x;
    this.v += (-this.k * (this.x - target) - this.c * clamp(this.v, -40, 40) + clamp(push, -400, 400)) * dt;
    this.x += this.v * dt;
    if (!Number.isFinite(this.x) || !Number.isFinite(this.v)) { this.x = target; this.v = 0; } // never stay broken
    this.x = clamp(this.x, target - 0.8, target + 0.8);
    return this.x;
  }
}

// ---------------------------------------------------------------- performances (per expression)
// f(t) → pose offsets: y (hop), sy / sxz (squash & stretch), x (shake), rz (body roll), pitch (+ head down),
// roll (head tilt), ears (-1 back … 1 perked), wag (tail speed ×), look (0..1 how much the gaze may wander),
// eyes / mouth (face overrides), kick ([side, amount] one ear flick). clip: a skeleton clip played for dur.
// After a one-shot act the mood's calm pose (CALM) holds — no endless bouncing.
const ACTS = {
  happy: { dur: 1.0, clip: 'Hop', marks: [['✨', 0.05], ['✨', 0.55]], blush: 1,
           f: t => ({ roll: 0.12 * Math.sin(2 * Math.PI * t), pitch: -0.05, ears: 0.5, wag: 3.2 }) },
  play: { dur: 1.0, clip: 'Jump', marks: [['✨', 0.4]], blush: 1, f: () => ({ ears: 0.6, wag: 3.5, look: 0 }) },
  love: {
    dur: 1.6, loop: true, marks: [['💕', 0.1]], blush: 1,
    f(t) {
      const s = Math.sin(2 * Math.PI * t / 1.6);
      return { roll: 0.2 + 0.04 * s, pitch: 0.06, ears: -0.2, wag: 2.2 };
    },
  },
  surprised: {
    dur: 1.1, marks: [['❗', 0.1]],
    f(t) {
      const crouch = smooth(0, 0.08, t) * (1 - smooth(0.08, 0.14, t));      // anticipation
      const jump = bump(t, 0.08, 0.42);                                       // spring up and back
      return { y: 0.08 * jump, sy: 1 - 0.1 * crouch + 0.12 * jump + 0.06 * wobble(t, 0.42, 26, 7),
               sxz: 1 + 0.06 * crouch - 0.05 * jump, pitch: -0.28 * smooth(0.08, 0.2, t) * (1 - 0.5 * smooth(0.5, 1.1, t)),
               ears: 1, wag: 0.4, look: 0 };
    },
  },
  angry: {
    dur: 1.3, marks: [['💢', 0.18], ['💢', 0.7]],
    f(t) {
      const lean = smooth(0, 0.15, t) * (1 - smooth(0.15, 0.25, t));        // rear back…
      const puff = smooth(0.15, 0.3, t);                                      // …then puff up, head down
      return { sy: 1 + 0.07 * puff - 0.03 * lean, sxz: 1 + 0.07 * puff, pitch: -0.12 * lean + 0.22 * puff,
               x: 0.009 * Math.sin(t * 70) * Math.exp(-2.2 * Math.max(0, t - 0.3)) * puff,
               ears: -1, wag: 0.3, look: 0.3 };
    },
  },
  curious: { dur: 1.4, marks: [['❓', 0.15]], f: t => ({ roll: -0.28 * smooth(0, 0.3, t), pitch: 0.05, ears: 0.6, look: 1 }) },
  sad: { dur: 2.4, loop: true, marks: [['💧', 0.3]], f: () => ({ sy: 0.97, pitch: 0.25, ears: -1, wag: 0.3, look: 0.2 }) },
  sleep: { dur: 3.0, loop: true, marks: [['💤', 0.2]], f: () => ({ look: 0 }) },

  // ---- idle actions: picked now and then when nothing else is going on
  yawn: {
    dur: 2.4,
    f(t) {
      const open = bump(t, 0.3, 1.9);
      return { pitch: -0.3 * open, ears: -0.4 * open, eyes: t > 0.45 && t < 1.7 ? 'closed' : t > 0.3 && t < 1.9 ? 'half' : null,
               mouth: { Open: open ** 1.5 }, look: 0, sy: 1 + 0.03 * open };
    },
  },
  sniff: {
    dur: 1.8,
    f(t) {
      const down = smooth(0, 0.3, t) * (1 - smooth(1.4, 1.8, t));
      return { pitch: 0.38 * down + 0.05 * down * Math.sin(t * 32), ears: 0.5 * down, look: 0.2 };
    },
  },
  flick: { dur: 0.6, f: t => (t < 0.05 ? { kick: [Math.random() < 0.5 ? -1 : 1, 18] } : {}) },
  shake: {
    dur: 1.1,
    f(t) {
      const s = Math.sin(2 * Math.PI * 7 * t) * Math.exp(-3 * t) * smooth(0, 0.05, t);
      return { rz: 0.22 * s, eyes: t < 0.8 ? 'closed' : null, look: 0, sy: 1 + 0.02 * Math.abs(s) };
    },
  },
  wag: { dur: 2.2, f: t => ({ wag: 3.6, eyes: 'smile', mouth: { Smile: 1 }, roll: 0.08 * Math.sin(t * 4), ears: 0.3 }) },
  look: {
    dur: 2.6,
    f(t) {
      const side = t < 1.1 ? -1 : t < 2.2 ? 1 : 0;
      return { gaze: [side * 0.95, 0.1], ears: 0.4 };
    },
  },
};
const IDLE = [['look', 3], ['flick', 3], ['sniff', 2], ['yawn', 1.5], ['wag', 2], ['shake', 1]];
// calm pose a mood keeps after its one-shot act (or while nothing plays)
const CALM = {
  happy: t => ({ roll: 0.05 * Math.sin(t * 1.6), wag: 1.8, ears: 0.3, mouth: { Smile: 1 } }),
  play: t => ({ roll: 0.05 * Math.sin(t * 1.6), wag: 2.2, ears: 0.4 }),
};
const MOOD_ACT = { happy: 'happy', play: 'play', love: 'love', surprised: 'surprised', angry: 'angry',
                   curious: 'curious', meh: 'curious', sad: 'sad', sleep: 'sleep' };
const BREATH = { sleep: 5.0, tired: 4.4, sad: 4.0, happy: 2.5, play: 2.2, angry: 2.3 }; // seconds per breath

// ---------------------------------------------------------------- manga marks
function markTexture(THREE, ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blushTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 32, 4, 64, 32, 60);
  grad.addColorStop(0, 'rgba(255,120,140,0.85)');
  grad.addColorStop(1, 'rgba(255,120,140,0)');
  g.fillStyle = grad;
  g.scale(1, 0.5);
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- the life layer
export function createLife({ THREE, fox, ears, host }) {
  // 'head' (simple rig) or Rigify-wolf-style 'spine.011' (glTF names lose the dot)
  const head = fox.getObjectByName('head') || fox.getObjectByName('spine011') || fox.getObjectByName('spine.011');
  const headRest = head.quaternion.clone(); // clips may not key the head: start from rest every frame
  // breathing lives in the chest bone (Rigify-style 'spine.008', or the simple rig's 'body')
  const chest = fox.getObjectByName('spine008') || fox.getObjectByName('spine.008') || fox.getObjectByName('body');
  const chestRest = chest ? chest.scale.clone() : null;
  const nose = fox.getObjectByName('Nose');
  fox.updateMatrixWorld(true);

  // head-local anchor points, measured once in the rest pose
  const box = new THREE.Box3().setFromObject(fox);
  const toHead = p => head.worldToLocal(p.clone());
  const markAt = toHead(new THREE.Vector3(box.max.x * 0.75, box.max.y * 0.92, 0.05));
  const nosePos = nose ? nose.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, box.max.y * 0.5, box.max.z);
  const cheeks = [-1, 1].map(s => toHead(nosePos.clone().add(new THREE.Vector3(0.13 * s, 0.04, -0.07))));

  const noOutline = m => { m.userData.outlineParameters = { visible: false }; return m; };
  const blushTex = blushTexture(THREE);
  const blush = cheeks.map(p => {
    const s = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: blushTex, transparent: true, depthWrite: false, opacity: 0 })));
    s.scale.set(0.11, 0.055, 1);
    s.position.copy(p);
    s.renderOrder = 3;
    head.add(s);
    return s;
  });
  const markTex = {};
  const marks = []; // live sprites { sprite, born, life }

  function pop(ch) {
    markTex[ch] = markTex[ch] || markTexture(THREE, ch);
    const s = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: markTex[ch], transparent: true, depthTest: false, depthWrite: false })));
    s.renderOrder = 10;
    s.position.copy(markAt).add(new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.05, 0));
    head.add(s);
    marks.push({ sprite: s, born: clockT, life: ch === '💤' ? 2.4 : 1.2, base: s.position.clone() });
  }

  // gaze: pointer anywhere on the page, relative to the fox on screen
  const gaze = { x: 0, y: 0, tx: 0, ty: 0, lastMove: -10, idleAt: 0 };
  addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.3;
    gaze.tx = clamp((e.clientX - cx) / (r.width * 1.2), -1, 1);
    gaze.ty = clamp((cy - e.clientY) / (r.height * 1.2), -1, 1);
    gaze.lastMove = clockT;
  });

  const earSprings = ears.map(() => ({ x: new Spring(160, 8), z: new Spring(160, 8) }));
  const tailSpring = { z: new Spring(60, 5), x: new Spring(60, 5) };
  const prevHead = new THREE.Quaternion().copy(head.getWorldQuaternion(new THREE.Quaternion()));
  let prevY = 0, prevVy = 0, prevHostX = null;
  let act = null, moodAct = undefined, actStart = 0, firedMarks = new Set();
  let nextIdle = 6, breath = 0, prevRz = 0;
  let clockT = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

  const life = {
    pose: { x: 0, y: 0, sy: 1, sxz: 1, rz: 0 },
    wag: 1,
    clip: null, // a skeleton clip the current act wants played (fox3d.js plays it instead of the mood's)
    face: { eyes: null, mouth: null }, // eyes cell / mouth shape weights the current act wants
    tail: { z: 0, x: 0 },
    eyeShift: { x: 0, y: 0 },
    // call before the animation mixer: the clip (if it keys the head) then overrides this rest pose
    beforeClip() { head.quaternion.copy(headRest); },
    perform(name) {
      act = ACTS[name] || null;
      actStart = clockT;
      firedMarks = new Set();
    },
    update(dt, t, mood, ctx = {}) {
      clockT = t;
      // start the mood's performance when the mood changes
      const want = MOOD_ACT[mood] || null;
      if (want !== moodAct) { moodAct = want; this.perform(want); }
      // nothing going on for a while → a small idle action (look around, flick an ear, sniff, yawn …)
      if (!act && !want && !ctx.walking && !ctx.talking && t > nextIdle && t - gaze.lastMove > 3) {
        let r = Math.random() * IDLE.reduce((n, [, w]) => n + w, 0);
        this.perform(IDLE.find(([, w]) => (r -= w) < 0)[0]);
        nextIdle = t + 5 + Math.random() * 5;
      }
      if (act || ctx.walking) nextIdle = Math.max(nextIdle, t + 4);
      let p = {};
      if (act) {
        let at = t - actStart;
        if (act.loop) {
          at %= act.dur;
          if (at < dt) firedMarks = new Set(); // marks repeat each loop
        }
        if (!act.loop && at > act.dur) { act = null; } else {
          p = act.f(at);
          if (p.kick) { // flick one ear
            const i = ears.findIndex(e => e.side === p.kick[0]);
            if (i >= 0) earSprings[i].x.v -= p.kick[1];
          }
          (act.marks || []).forEach(([ch, when], i) => {
            if (at >= when && !firedMarks.has(i)) { firedMarks.add(i); pop(ch); }
          });
        }
      }

      if (!act) p = CALM[mood]?.(t) || {};
      this.clip = act?.clip || null;
      this.face.eyes = p.eyes || null;
      this.face.mouth = p.mouth || null;

      // breathing: chest swells a little, head rides it; the rhythm drifts so it never looks metronomic
      const period = BREATH[mood] || 3.4;
      breath += dt * (2 * Math.PI / period) * (1 + 0.15 * Math.sin(t * 0.13));
      const b = Math.sin(breath) + 0.25 * Math.sin(breath * 2.3);
      if (chest) chest.scale.set(chestRest.x * (1 + 0.025 * b), chestRest.y, chestRest.z * (1 + 0.025 * b));
      p.pitch = (p.pitch || 0) + 0.012 * b;

      // gaze target: the act's, the pointer while it moves, otherwise an occasional glance around
      if (p.gaze) { [gaze.tx, gaze.ty] = p.gaze; gaze.idleAt = t + 1; } else if (t - gaze.lastMove > 2.5 && t > gaze.idleAt) {
        gaze.tx = (Math.random() - 0.5) * 1.2;
        gaze.ty = (Math.random() - 0.3) * 0.6;
        gaze.idleAt = t + 1.5 + Math.random() * 3;
      }
      const lookAmount = p.look ?? 1;
      const kg = 1 - Math.exp(-dt * 8);
      gaze.x += (gaze.tx * lookAmount - gaze.x) * kg;
      gaze.y += (gaze.ty * lookAmount - gaze.y) * kg;

      // head: performance pitch / roll + looking toward the pointer
      head.quaternion.multiply(q.setFromAxisAngle(Y, gaze.x * 0.35));
      head.quaternion.multiply(q.setFromAxisAngle(X, (p.pitch || 0) - gaze.y * 0.22));
      head.quaternion.multiply(q.setFromAxisAngle(Z, -(p.roll || 0)));
      this.eyeShift.x = -gaze.x * 0.010;
      this.eyeShift.y = gaze.y * 0.008;

      // body motion → springs (head turning, hops, being led across the stage)
      fox.updateMatrixWorld(true);
      const hq = head.getWorldQuaternion(q.clone());
      const dq = hq.clone().multiply(prevHead.clone().invert());
      prevHead.copy(hq);
      e.setFromQuaternion(dq);
      const h = Math.max(dt, 1 / 120); // the first frame can have dt = 0: never divide by it
      const rz = p.rz || 0; // whole-body roll (shake) swings the ears too
      const w = { x: e.x / h, y: e.y / h, z: e.z / h + (rz - prevRz) / h * 1.5 }; // head angular velocity
      prevRz = rz;
      const y = p.y || 0;
      const vy = (y - prevY) / h;
      const ay = (vy - prevVy) / h;
      prevY = y;
      prevVy = vy;
      const r = host.getBoundingClientRect();
      const hostVx = prevHostX === null ? 0 : (r.left - prevHostX) / h / Math.max(r.width, 1);
      prevHostX = r.left;

      ears.forEach(({ bone, side }, i) => {
        const s = earSprings[i];
        const pose = p.ears || 0;
        const ax = s.x.step(dt, pose < 0 ? -pose * 0.4 : -pose * 0.12, -w.x * 2 - ay * 0.04);
        const az = s.z.step(dt, side * (pose < 0 ? -pose * 0.25 : 0), -w.z * 2 - side * w.y * 1.5);
        bone.quaternion.multiply(q.setFromAxisAngle(X, ax));
        bone.quaternion.multiply(q.setFromAxisAngle(Z, az));
      });
      this.tail.z = tailSpring.z.step(dt, 0, -hostVx * 30 - w.y * 3);
      this.tail.x = tailSpring.x.step(dt, 0, -ay * 0.05);
      this.wag = p.wag ?? 1;

      // blush fades with the act
      const blushTo = act?.blush || 0;
      blush.forEach(s => { s.material.opacity += (blushTo - s.material.opacity) * (1 - Math.exp(-dt * 6)); });

      // marks: pop in with overshoot, float up, fade out
      for (let i = marks.length - 1; i >= 0; i--) {
        const mk = marks[i], age = t - mk.born, k = age / mk.life;
        if (k >= 1) { mk.sprite.removeFromParent(); marks.splice(i, 1); continue; }
        const sc = 0.13 * backOut(clamp(age / 0.22, 0, 1));
        mk.sprite.scale.set(sc, sc, 1);
        mk.sprite.position.copy(mk.base).add(new THREE.Vector3(0, 0.05 * k, 0));
        mk.sprite.material.opacity = 1 - smooth(0.7, 1, k);
      }

      Object.assign(this.pose, { x: p.x || 0, y, sy: p.sy || 1, sxz: p.sxz || 1, rz });
    },
  };
  return life;
}

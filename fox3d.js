/* 3D fox renderer (prototype). Loaded by app.js unless the 2D sprites are picked (?r=2d).
   Model: assets/fox3d/<model>/fox_toon.glb (tools/blender/toon_fox.py) — flat colour regions + 2D decal
   layers for the face and the (animated) eyes, cells of face_atlas.png / eyes_atlas.png (tools/face_atlas.py).
   app.js drives it through window.Fox3D.set({ mood, tails, scale }); Fox3D.recolor({ Fur: '#fff' }) swaps colours.
   ?m=standing (default, four-legged, from the standing turnaround) or ?m=sitting (assets/fox3d/ itself).
   Drag the fox sideways to turn it. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createLife } from './fox3d-life.js';

const host = document.getElementById('fox');
const param = new URLSearchParams(location.search).get('m');
const MODEL = param && /^[a-z0-9_-]+$/.test(param) ? param : 'standing';
const DIR = MODEL === 'sitting' ? '' : MODEL; // the seated prototype lives in assets/fox3d/ itself
const BASE = 'assets/fox3d/' + (DIR ? DIR + '/' : '');
const STANDING = MODEL === 'standing';
const EDIT = { on: !!window.FOX3D_EDIT, frozen: false }; // set by tools/rig_editor.html

// mood (app.js expressions) → clip, face/eyes cell, ears (-1 back … 1 perked),
// 3D mouth: weights of the Mouth shape keys (Open, Happy, Smile, Sad, O, Angry); none = shut (hidden)
const MOODS = {
  normal:    { anim: 'Idle', face: 'normal', mouth: { Smile: 0.7 } },
  happy:     { anim: 'Idle', face: 'happy', ears: 0.4, mouth: { Happy: 1 } },   // hops come from the act, once
  love:      { anim: 'Idle', face: 'smile', mouth: { Smile: 1 } },
  eat:       { anim: 'Eat', face: 'smile', chew: true, mouth: { Smile: 0.6 } },
  play:      { anim: 'Idle', face: 'happy', ears: 0.5, mouth: { Happy: 1 } },   // one jump from the act
  sad:       { anim: 'Idle', face: 'normal', ears: -1, slow: true, mouth: { Sad: 1 } },
  sleep:     { anim: 'Sleep', face: 'blink', ears: -0.6, slow: true, mouth: {} },
  meh:       { anim: 'Tilt', face: 'normal', mouth: { Sad: 0.5 } },
  curious:   { anim: 'Tilt', face: 'surprised', ears: 0.6, mouth: { O: 0.6 } },
  surprised: { anim: 'Idle', face: 'surprised', ears: 1, mouth: { O: 1 } },
  angry:     { anim: 'Idle', face: 'angry', ears: -1, mouth: { Angry: 1 } },
  tired:     { anim: 'Idle', face: 'blink', ears: -0.4, slow: true, yawn: true, mouth: {} },
};
const MOUTH_PARTS = /^(Nose|MouthLine|MouthIn)/; // small 3D parts: no ink line around them
MOODS.talkA = MOODS.talkB = MOODS.normal;

const state = { mood: 'normal', tails: 1, scale: 1 };
let fox, mixer, clips = {}, current, tailTemplate, anchor, tails = [], ears = [], faceTex, eyesTex, faceInfo, blinkAt = 0, yaw = 0;
const regions = {}; // material name → toon material, for recolouring
let life = null, baseScale = 1; // fox3d-life.js: springs, gaze, acting, manga marks
const mouth = { mesh: null, keys: {}, w: {} }; // 3D mouth: shape key name → morph index, smoothed weights

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.className = 'fox3d';
const outline = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0.31, 0.2, 0.16] });

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd9c7a8, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1.2, 2.5, 3);
scene.add(sun);

// the canvas is 150% of the .fox box (tails fan wider than the old sprite); the box spans ~1.1 units
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
camera.position.set(0, 0.75, 2.25);
camera.lookAt(0, 0.5, 0);

function resize() {
  const w = host.clientWidth * 1.5;
  if (!w) return;
  renderer.setSize(w, w, false);
}
new ResizeObserver(resize).observe(host);

function toonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([185, 185, 185, 255, 235, 235, 235, 255, 255, 255, 255, 255]), 3, 1);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function toonify(root) {
  const grad = toonGradient();
  root.traverse(o => {
    if (!o.isMesh) return;
    const conv = m => {
      if (/^(Face|Eyes)/.test(o.name)) { // decal layers: no ink line, drawn over the body
        const t = new THREE.MeshToonMaterial({ map: m.map, gradientMap: grad, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        t.userData.outlineParameters = { visible: false };
        return t;
      }
      // share one material per colour region so recolour() reaches the body and every tail
      if (!regions[m.name]) {
        regions[m.name] = new THREE.MeshToonMaterial({ color: m.color, gradientMap: grad });
        if (MOUTH_PARTS.test(m.name)) regions[m.name].userData.outlineParameters = { visible: false };
      }
      return regions[m.name];
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    if (o.name.startsWith('Face')) { faceTex = o.material.map; o.renderOrder = 1; }
    if (o.name.startsWith('Eyes')) { eyesTex = o.material.map; o.renderOrder = 2; }
  });
}

// move a layer's texture so its UVs (laid out on the "normal" cell) show another cell of the same grid
function showCell(tex, grid, name) {
  if (!tex || !grid) return;
  const k = grid.cells[name] ?? grid.cells.normal;
  const n0 = grid.cells.normal;
  tex.offset.set((k % grid.cols - n0 % grid.cols) / grid.cols,
    (Math.floor(k / grid.cols) - Math.floor(n0 / grid.cols)) / grid.rows);
}

// face = brows/nose/mouth; with a separate eyes layer the eyes follow the mood unless blinking
function showFace(name, eyes = name) {
  if (faceInfo?.eyes) {
    showCell(faceTex, faceInfo, name === 'blink' ? 'normal' : name);
    showCell(eyesTex, faceInfo.eyes, eyes === 'blink' ? 'closed' : eyes);
  } else {
    showCell(faceTex, faceInfo, name);
  }
}

// blink frames over ~0.2 s: half-shut → shut → half-shut (older single-layer faces just flash 'blink')
const BLINK = [[0.05, 'half'], [0.13, 'closed'], [0.19, 'half']];
function blinkFrame(since) {
  if (!faceInfo?.eyes) return since < 0.15 ? 'blink' : null;
  const f = BLINK.find(([until]) => since < until);
  return f ? f[1] : null;
}

// Tail attachment. Defaults per pose; tools/rig_editor.html saves overrides to <model>/rig.json:
//   anchor / anchorRot: where the tails' root (B end) sits, in the TailAnchor's parent (body bone) space
//   back: tilt back(-)/forward(+), twist, spread / step: fan width, size, lean: a single tail's sideways curl
// a seated fox's tails sit low around it; a standing fox's rise from the rump, up and back, clear of the legs
const RIG = STANDING ? { spread: 120, step: 22, size: 1.1, back: -0.7, twist: 0, lean: 35 }
  : { spread: 170, step: 30, size: 1.45, back: -0.1, twist: 0, lean: 35 };

// The editor saves the joint in the fox's own space (anchorModel / anchorQuatModel), so it stays put when the
// model is regenerated and its bones move. Converted once, in the bind pose, into the anchor's parent bone.
// (Older rig.json files carry anchor / anchorRot in that bone's space directly.)
function resolveAnchor() {
  if (!RIG.anchorModel) return;
  fox.updateMatrixWorld(true);
  const parent = anchor.parent;
  RIG.anchor = parent.worldToLocal(fox.localToWorld(new THREE.Vector3().fromArray(RIG.anchorModel))).toArray();
  const q = fox.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(RIG.anchorQuatModel || [0, 0, 0, 1]));
  q.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  RIG.anchorRot = new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3);
}

function applyAnchor() {
  if (RIG.anchor) anchor.position.fromArray(RIG.anchor);
  if (RIG.anchorRot) anchor.rotation.fromArray(RIG.anchorRot);
}

function setTails(n) {
  tails.forEach(t => t.removeFromParent());
  tails = [];
  applyAnchor();
  const spread = n === 1 ? 0 : Math.min(RIG.spread, RIG.step * (n - 1));
  const s = RIG.size * Math.pow(0.9, Math.floor((n - 1) / 3)); // shrink a little as the fan fills up
  const lean = RIG.lean * (1 - (n - 1) / 8); // a single tail curls out to the side; nine fan symmetrically
  for (let i = 0; i < n; i++) {
    const a = lean + (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1));
    const t = SkeletonUtils.clone(tailTemplate);
    t.rotation.set(RIG.back - Math.abs(a) * 0.002, RIG.twist, THREE.MathUtils.degToRad(a), 'ZXY');
    t.position.set(0, 0, -0.012 * Math.abs(a) / 30);
    t.scale.setScalar(s);
    t.userData.phase = i * 0.9;
    t.userData.bones = [];
    t.traverse(o => { if (o.isBone) t.userData.bones.push(o); });
    t.userData.bones.sort((x, y) => x.name.localeCompare(y.name));
    anchor.add(t);
    tails.push(t);
  }
}

function play(name) {
  if (current?.name === name) return;
  const next = clips[name];
  if (!next) return;
  next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
  if (current) current.action.fadeOut(0.3);
  current = { name, action: next };
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  if (!fox) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  const m = MOODS[state.mood] || MOODS.normal;
  const talking = host.classList.contains('talking');
  const walking = host.closest('#petWrap')?.classList.contains('walking');
  if (EDIT.frozen) { outline.render(scene, camera); return; } // rig editor: rest pose, no motion
  play(walking ? 'Walk' : life.clip || m.anim);
  mixer.timeScale = m.slow ? 0.6 : 1;
  ears.forEach(e => e.bone.quaternion.copy(e.rest)); // clips may not key the ears; never accumulate
  life.beforeClip();
  mixer.update(dt);

  // life: acting for the mood, idle actions, breathing, ears on springs, gaze, manga marks
  life.update(dt, t, talking ? 'normal' : state.mood, { walking, talking });

  // face: mood cell, talking flips between closed and open mouth, an occasional blink
  if (t > blinkAt + 0.25 && Math.random() < dt / 3.5) blinkAt = t;
  let face = m.face, eyes = m.face;
  if (talking) face = Math.sin(t * 16) > 0 ? 'surprised' : 'normal';
  else if (m.chew) face = Math.sin(t * 12) > 0 ? 'happy' : 'smile';
  const blink = blinkFrame(t - blinkAt);
  if (blink && ['normal', 'surprised', 'angry'].includes(eyes)) eyes = blink; // ^^ and shut eyes don't blink
  if (talking) eyes = m.face;
  if (life.face.eyes) eyes = life.face.eyes; // e.g. shut while yawning or shaking
  showFace(face, eyes);

  // 3D mouth: the mood's shape; talking / chewing / yawning open and close it smoothly (Open over it)
  const want = { ...(life.face.mouth || m.mouth || {}) };
  if (talking) want.Open = 0.15 + 0.6 * Math.abs(Math.sin(t * 9));
  else if (m.chew) want.Open = 0.45 * Math.max(0, Math.sin(t * Math.PI * 4));
  else if (m.yawn) want.Open = Math.max(0, Math.sin(t * 0.8)) ** 3;
  if (want.Open) for (const k in want) if (k !== 'Open') want[k] *= 1 - want.Open;
  const km = 1 - Math.exp(-dt * (talking || m.chew ? 30 : 10));
  let total = 0;
  for (const [name, i] of Object.entries(mouth.keys)) {
    mouth.w[name] = THREE.MathUtils.lerp(mouth.w[name] || 0, want[name] || 0, km);
    mouth.mesh.morphTargetInfluences[i] = mouth.w[name];
    total += mouth.w[name];
  }
  if (mouth.mesh) mouth.mesh.visible = total > 0.06; // shut = no mouth at all

  if (eyesTex) { eyesTex.offset.x += life.eyeShift.x; eyesTex.offset.y += life.eyeShift.y; }

  // tails sway, each a little out of phase; the spring makes them trail the body's moves
  const speed = (m.slow ? 0.9 : m.anim === 'Jump' ? 4 : 2.2) * life.wag;
  tails.forEach(tl => tl.userData.bones.forEach((b, i, all) => {
    const lag = (i + 1) / all.length;
    b.rotation.z = Math.sin(t * speed + tl.userData.phase - i * 0.6) * (0.07 + i * 0.035) + life.tail.z * lag * 0.6;
    b.rotation.x = Math.sin(t * speed * 0.7 + tl.userData.phase - i * 0.5) * 0.05 + life.tail.x * lag * 0.6;
  }));

  // turn toward the walking direction instead of the 2D mirror flip
  const k = 1 - Math.exp(-dt * 6);
  const target = walking ? (host.classList.contains('flip') ? -0.7 : 0.7) : EDIT.on ? 0 : 0.25;
  yaw = THREE.MathUtils.lerp(yaw, target, k);
  if (walking) spin.yaw = THREE.MathUtils.lerp(spin.yaw, 0, k); // walking faces where it goes
  fox.rotation.y = yaw + spin.yaw;
  baseScale = THREE.MathUtils.lerp(baseScale, state.scale, k);
  const P = life.pose; // hop, shake, squash & stretch from the current act (feet stay on the ground)
  fox.position.set(P.x, P.y, 0);
  fox.rotation.z = P.rz;
  fox.scale.set(baseScale * P.sxz, baseScale * P.sy, baseScale * P.sxz);
  outline.render(scene, camera);
}

async function init() {
  const [gltf, info, rig] = await Promise.all([
    // FOX3D_FILE: e.g. an embedded .gltf.json copy where .glb files can't be served
    new GLTFLoader().loadAsync(BASE + (window.FOX3D_FILE || 'fox_toon.glb')),
    fetch(BASE + 'face.json').then(r => r.json()),
    fetch(BASE + 'rig.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  Object.assign(RIG, rig);
  faceInfo = info;
  fox = gltf.scene;
  tailTemplate = fox.getObjectByName('Tail');
  tailTemplate.removeFromParent();
  tailTemplate.position.set(0, 0, 0);
  anchor = fox.getObjectByName('TailAnchor');
  resolveAnchor();
  toonify(fox);
  toonify(tailTemplate);
  ears = [['earL', 1], ['earR', -1], ['ear.L', 1], ['ear.R', -1]]
    .map(([n, side]) => ({ bone: fox.getObjectByName(n), side })).filter(e => e.bone?.isBone);
  ears.forEach(e => { e.rest = e.bone.quaternion.clone(); });
  life = createLife({ THREE, fox, ears, host });
  fox.traverse(o => {
    if (o.morphTargetDictionary && 'Open' in o.morphTargetDictionary) {
      mouth.mesh = o;
      mouth.keys = o.morphTargetDictionary;
    }
  });
  scene.add(fox);
  mixer = new THREE.AnimationMixer(fox);
  for (const c of gltf.animations) clips[c.name] = mixer.clipAction(c);
  setTails(state.tails);
  host.appendChild(renderer.domElement);
  resize();
  frame();
  bindSpin();
}

// drag the fox sideways to turn it; a drag is not a tap (the app pets the fox on click)
const spin = { yaw: 0, x: null, moved: 0 };
function bindSpin() {
  if (EDIT.on) return; // the rig editor has its own camera controls
  host.addEventListener('pointerdown', e => {
    spin.x = e.clientX;
    spin.moved = 0;
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointermove', e => {
    if (spin.x === null) return;
    const dx = e.clientX - spin.x;
    spin.x = e.clientX;
    spin.moved += Math.abs(dx);
    spin.yaw += dx * 0.015;
  });
  const end = () => {
    if (spin.x !== null && spin.moved > 6) {
      host.addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true });
    }
    spin.x = null;
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}

window.Fox3D = {
  set({ mood, tails: n, scale }) {
    if (mood) state.mood = mood;
    if (scale) state.scale = scale;
    if (n && n !== state.tails) {
      state.tails = n;
      if (tailTemplate) setTails(n);
    }
  },
  // e.g. Fox3D.recolor({ Fur: '#f4f1ec', Dark: '#7a8590' }) → arctic fox
  recolor(colors) {
    for (const [name, c] of Object.entries(colors)) regions[name]?.color.set(c);
  },
  // for tools/rig_editor.html
  edit: EDIT,
  rig: RIG,
  ready: null,
  // play one of the acts in fox3d-life.js now (happy / surprised / angry / love / curious / sad / sleep)
  perform(name) { life?.perform(name); },
  get parts() { return { THREE, scene, camera, renderer, fox, anchor, tails, model: DIR }; }, // DIR: rig.json folder
  rebuildTails() { setTails(state.tails); },
  restPose() {
    mixer.stopAllAction();
    current = null;
    fox.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    fox.rotation.set(0, 0, 0);
    tails.forEach(tl => tl.userData.bones.forEach(b => b.rotation.set(0, 0, 0)));
    showFace('normal');
  },
};

window.Fox3D.ready = init().then(
  () => typeof render === 'function' && render(),
  e => { console.warn('3D fox failed, using sprites', e); host.classList.remove('three'); },
);

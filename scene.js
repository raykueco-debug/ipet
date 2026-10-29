/* 2.5D scene behind the fox: flat cartoon layers at different depths that slide a little against each other
   as the fox moves (and as a tablet tilts), so the room has depth.

     sky (the stage's own gradient, sun, clouds) · far · mid · ground · props · front
   Each layer is assets/scene/<scene>/<layer>.png when that picture exists (cartoon art, transparent, 2:1),
   a simple drawn stand-in until then. Layers are wider than the stage so they can slide. */
(function () {
  const SCENE = 'forest';
  const SHIFT = { sky: 0.02, far: 0.04, mid: 0.1, ground: 0, props: 0.02, front: 0 }; // × the fox's offset (px per %)
  const OUT = '#4a3a2a';
  // a tiny seeded random, so the drawn scene is the same every time
  let seed = 7;
  const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
  const svg = (body, defs = '') => `<svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice"><defs>${defs}</defs>${body}</svg>`;
  const grad = (id, top, bottom) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

  const roundTree = (x, y, s, leaf, light, dark) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-12 0 Q-10 -40 -8 -70 L8 -70 Q10 -40 12 0 Q16 6 22 8 L-22 8 Q-16 6 -12 0Z" fill="#9b6a43" stroke="${OUT}" stroke-width="3"/>
      <path d="M-2 -20 q2 -14 0 -30 M5 -40 q-2 -10 2 -22" stroke="#7a4f30" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M-62 -78 a34 34 0 0 1 20 -54 a42 42 0 0 1 80 -10 a34 34 0 0 1 22 58 a28 28 0 0 1 -30 30 h-64 a28 28 0 0 1 -28 -24Z" fill="${leaf}" stroke="${OUT}" stroke-width="3"/>
      <path d="M-40 -120 a30 30 0 0 1 40 -16" stroke="${light}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
      <circle cx="18" cy="-118" r="7" fill="${light}" opacity=".8"/>
      <path d="M-56 -64 q40 20 108 0 a28 28 0 0 1 -26 18 h-56 a28 28 0 0 1 -26 -18Z" fill="${dark}" opacity=".35"/></g>`;
  const pine = (x, y, s, c, light) => `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-5" y="-16" width="10" height="18" fill="#8a5c3a"/>
      <path d="M0 -150 Q12 -120 34 -96 Q20 -98 40 -64 Q24 -66 46 -24 Q0 -14 -46 -24 Q-24 -66 -40 -64 Q-20 -98 -34 -96 Q-12 -120 0 -150Z" fill="${c}"/>
      <path d="M0 -150 Q-12 -120 -34 -96 Q-20 -98 -40 -64 Q-24 -66 -46 -24 Q-26 -20 -10 -18 Q-20 -60 0 -150Z" fill="${light}" opacity=".35"/></g>`;
  const bush = (x, y, s, c, light, berries) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-52 0 a22 22 0 0 1 8 -36 a28 28 0 0 1 44 -14 a26 26 0 0 1 44 16 a20 20 0 0 1 8 34Z" fill="${c}" stroke="${OUT}" stroke-width="3"/>
      <path d="M-30 -34 a20 20 0 0 1 22 -10" stroke="${light}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>
      ${berries ? [[-20, -18], [8, -26], [26, -12], [-4, -8]].map(([bx, by]) => `<circle cx="${bx}" cy="${by}" r="5" fill="#e8574a" stroke="${OUT}" stroke-width="1.5"/>`).join('') : ''}</g>`;
  const cloud = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff">
      <path d="M-60 0 a24 24 0 0 1 14 -34 a32 32 0 0 1 56 -12 a26 26 0 0 1 46 22 a20 20 0 0 1 4 24Z"/>
      <path d="M-60 0 h120" stroke="#dbeefa" stroke-width="6" stroke-linecap="round"/></g>`;
  const flower = (x, y, c, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 0 q-2 -10 0 -18" stroke="#3f8f3a" stroke-width="3" fill="none"/>
      <path d="M0 -8 q-8 -2 -10 4" stroke="#3f8f3a" stroke-width="2.5" fill="#5aa84a"/>
      ${[0, 72, 144, 216, 288].map(a => `<circle cx="${(6 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(-22 + 6 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="5" fill="${c}" stroke="${OUT}" stroke-width="1"/>`).join('')}
      <circle cx="0" cy="-22" r="3.5" fill="#f2a33a"/></g>`;
  const blades = (n, y0, y1, c) => Array.from({ length: n }, () => {
    const x = rnd(0, 1200), y = rnd(y0, y1), h = rnd(6, 14);
    return `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q2 ${(-h / 2).toFixed(1)} ${rnd(-3, 3).toFixed(1)} ${(-h).toFixed(1)}" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  }).join('');
  const mushroom = (x, y, k, cap) => `<g transform="translate(${x} ${y}) scale(${k})"><rect x="-6" y="-24" width="12" height="26" rx="4" fill="#fff4e0"/>
      <path d="M-26 -22 a26 22 0 0 1 52 0Z" fill="${cap}"/><circle cx="-10" cy="-32" r="4" fill="#fff" stroke="none"/>
      <circle cx="8" cy="-36" r="5" fill="#fff" stroke="none"/><circle cx="14" cy="-27" r="3" fill="#fff" stroke="none"/></g>`;

  const DRAWN = {
    sky: () => svg(`<circle cx="1010" cy="110" r="64" fill="#fff3b0" opacity=".35"/><circle cx="1010" cy="110" r="46" fill="#fff3b0"/>
      ${cloud(220, 120, 1)}${cloud(620, 80, 0.75)}${cloud(860, 170, 0.6)}`),
    far: () => svg(`<path d="M0 330 Q150 250 330 300 T700 280 T1200 300 V600 H0Z" fill="url(#h1)"/>
      ${Array.from({ length: 16 }, (_, k) => pine(40 + k * 75 + rnd(-15, 15), 312 + rnd(-14, 10), rnd(0.55, 0.75), '#9ccb8f', '#cfe9c5')).join('')}
      <path d="M0 370 Q260 320 560 352 T1200 350 V600 H0Z" fill="url(#h2)"/>
      ${Array.from({ length: 12 }, (_, k) => roundTree(60 + k * 100 + rnd(-20, 20), 372 + rnd(-6, 8), rnd(0.42, 0.55), '#8cc977', '#c3e6b0', '#4f8f45')).join('')}
      <path d="M0 405 Q300 380 640 398 T1200 396 V600 H0Z" fill="#9fd486"/>`,
      grad('h1', '#c9e7c0', '#b3dba5') + grad('h2', '#acd99b', '#9bd189')),
    mid: () => svg(`${roundTree(90, 432, 1.25, '#5fb54d', '#a6dd8a', '#2f7a3a')}${roundTree(1110, 428, 1.35, '#62b850', '#a6dd8a', '#2f7a3a')}
      ${roundTree(230, 412, 0.85, '#73c45e', '#b4e59a', '#2f7a3a')}${roundTree(975, 408, 0.8, '#73c45e', '#b4e59a', '#2f7a3a')}
      ${pine(330, 410, 0.7, '#4f9e48', '#8cc977')}${pine(870, 406, 0.65, '#4f9e48', '#8cc977')}
      ${bush(380, 430, 0.95, '#5aae4a', '#9ad67e', true)}${bush(820, 428, 0.9, '#5aae4a', '#9ad67e', false)}
      ${bush(160, 446, 0.8, '#53a744', '#93d276', false)}${bush(1040, 446, 0.85, '#53a744', '#93d276', true)}`),
    ground: () => svg(`<path d="M0 410 Q600 385 1200 410 V600 H0Z" fill="url(#g1)"/>
      <path d="M520 600 Q560 520 600 470 Q640 430 700 414 Q660 440 650 470 Q640 520 690 600Z" fill="#e9d29c" opacity=".9"/>
      <path d="M560 600 Q590 530 620 485" stroke="#d8bd82" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="300" cy="520" rx="170" ry="26" fill="#8ccf6c" opacity=".6"/><ellipse cx="930" cy="540" rx="190" ry="30" fill="#8ccf6c" opacity=".6"/>
      ${blades(90, 425, 600, '#6fbb55')}${blades(40, 440, 600, '#b8e69b')}`,
      grad('g1', '#a6dc84', '#86c867')),
    props: () => svg(`<g stroke="${OUT}" stroke-width="3">
        <path d="M120 505 q-10 4 -6 10 h140 q4 -6 -8 -10Z" fill="#7a5233" stroke="none"/>
        <path d="M140 505 q0 -36 4 -46 h92 q4 10 4 46Z" fill="#a8744a"/>
        <path d="M150 470 v30 M175 468 v34 M205 468 v34 M228 470 v30" stroke="#8a5c3a" stroke-width="2.5"/>
        <ellipse cx="190" cy="460" rx="48" ry="14" fill="#e3b98a"/>
        <ellipse cx="190" cy="460" rx="30" ry="8" fill="none" stroke="#c99566" stroke-width="2.5"/><ellipse cx="190" cy="460" rx="14" ry="4" fill="none" stroke="#c99566" stroke-width="2.5"/>
        <path d="M282 520 h86 a12 12 0 0 1 0 24 h-86Z" fill="#b07a4c"/><circle cx="282" cy="532" r="12" fill="#e3b98a"/>
        <circle cx="282" cy="532" r="5" fill="none" stroke="#c99566" stroke-width="2"/>
        ${mushroom(985, 500, 1, '#e8574a')}${mushroom(1022, 506, 0.65, '#f08a4b')}
        <path d="M1050 528 q4 -30 40 -32 q34 2 38 32Z" fill="#b9b6ad"/><path d="M1060 506 q16 -12 34 -8 q-14 4 -22 14Z" fill="#7dbb5e" stroke="none"/>
        <path d="M1066 514 q10 -6 20 -4" stroke="#d6d3cb" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      ${[[300, 560, '#ffd84d'], [330, 575, '#ff8fb1'], [356, 560, '#ffffff'], [860, 568, '#ffd84d'], [890, 582, '#b99cff'],
         [915, 562, '#ff8fb1'], [470, 480, '#ffffff', 0.7], [740, 476, '#ffd84d', 0.7], [600, 446, '#ff8fb1', 0.55]].map(([x, y, c, k]) => flower(x, y, c, k)).join('')}`),
    // a low fringe of grass along the whole front edge (slice: always the full width), short enough to hide nothing
    front: () => svg(`<path d="M-60 610 V596 ${Array.from({ length: 30 }, (_, k) => {
        const x = -60 + k * 46, r = rnd(14, 22);
        return `Q${x + 23} ${(596 - r * 1.6).toFixed(0)} ${x + 46} 596`;
      }).join(' ')} V610Z" fill="#78c25a"/>
      <path d="M-60 610 V602 ${Array.from({ length: 40 }, (_, k) => {
        const x = -60 + k * 34;
        return `Q${x + 17} ${(602 - rnd(12, 20)).toFixed(0)} ${x + 34} 602`;
      }).join(' ')} V610Z" fill="#8fd36e"/>
      ${blades(36, 584, 604, '#5fae4b')}`),
  };

  const stage = document.getElementById('stage');
  const back = document.createElement('div'), front = document.createElement('div');
  back.className = 'scene';
  front.className = 'scene scene-front';
  const layers = {};
  for (const name of Object.keys(SHIFT)) {
    const d = document.createElement('div');
    d.className = 'layer layer-' + name;
    d.innerHTML = DRAWN[name]();
    (name === 'front' ? front : back).appendChild(d);
    layers[name] = d;
    const im = new Image(); // the real picture, when it has been drawn
    im.onload = () => { d.innerHTML = ''; d.appendChild(im); };
    im.src = `assets/scene/${SCENE}/${name}.png`;
  }
  stage.prepend(back);
  stage.appendChild(front);
  stage.querySelector('.hill')?.remove();

  // props on the 2.5D ground (art: assets/scene/props/, the GPT sheet assets/source/gpt/props_01.png): each stands
  // at a depth, so it hides and is hidden by the fox and the ball like they hide each other (app.js groundAt /
  // sizeAt / layerAt). Beyond z 1 is behind where the fox can go. Once they load, they replace the drawn
  // mid and props layers.
  const PROPS = [ // picture, x %, depth, width as a share of the stage width (at depth 0)
    ['pine', 20, 1.25, 0.26], ['pine', 80, 1.3, 0.24], ['tree', 6, 1.12, 0.46], ['tree', 95, 1.08, 0.5],
    ['bush', 32, 1.05, 0.22], ['bush', 68, 1.06, 0.2],
    // decoration stays at the back and the far sides: the ground in front, where the fox and the ball go, is clear
    ['mushrooms', 58, 1.02, 0.1], ['flowers', 44, 1.0, 0.11], ['stump', 90, 0.95, 0.15], ['rock', 76, 1.0, 0.12],
    ['bed', BED.x, BED.z + 0.04, 0.34], // (its water comes in a bowl when it is given a drink: app.js drink)
  ];
  Promise.all([...new Set(PROPS.map(p => p[0]))].map(n => new Promise((ok, no) => {
    const im = new Image(); im.onload = () => ok(); im.onerror = no; im.src = `assets/scene/props/${n}.png`;
  }))).then(() => {
    const els = PROPS.map(([n, x, z, w]) => {
      const d = document.createElement('img');
      d.className = 'prop';
      d.src = `assets/scene/props/${n}.png`;
      d.alt = '';
      stage.appendChild(d);
      return [d, x, z, w];
    });
    const place = () => els.forEach(([d, x, z, w], k) => {
      const n = PROPS[k][0];
      d.style.left = x + '%';
      d.style.bottom = groundAt(z) - 1.5 + '%';
      d.style.width = stage.clientWidth * w * sizeAt(z) + 'px';
      // past the back of the ground still above the drawn layers; the bed lies flat on the ground: under the fox and
      // the ball always, they go over it
      d.style.zIndex = n === 'bed' ? 9 : Math.max(1, layerAt(z));
    });
    place();
    addEventListener('resize', place);
    layers.mid.style.display = layers.props.style.display = 'none';
    // the bed is soft: a weight on it (app.js pressed: the fox, the ball) squashes it where it presses, and it
    // springs back up when the weight goes — a little past, then settles
    const bedEl = els[PROPS.findIndex(p => p[0] === 'bed')]?.[0], bed = THINGS.find(t => t.name === 'bed');
    let give = 0, speed = 0;
    if (bedEl && bed) setInterval(() => {
      const want = Math.min(1, Math.max(pressed.fox, pressed.ball * 0.6) / 1.6);
      speed = (speed + (want - give) * 0.3) * 0.72;
      give += speed;
      const at = pressed.fox ? foxX : (window.Ball?.state.x ?? bed.x); // where it presses (% of the bed's width)
      bedEl.style.transformOrigin = `${50 + Math.max(-40, Math.min(40, ((at - bed.x) / bed.rx) * 40))}% 100%`;
      bedEl.style.transform = `translateX(-50%) scale(${1 + 0.04 * give}, ${1 - 0.12 * give})`;
    }, 1000 / 30);
  }, () => {});

  // slide the layers against each other: with the fox's position, and with the tablet's tilt
  const wrap = document.getElementById('petWrap');
  let tilt = 0;
  addEventListener('deviceorientation', e => { if (e.gamma != null) tilt = Math.max(-20, Math.min(20, e.gamma)) / 20; });
  (function loop() {
    const fx = (parseFloat(getComputedStyle(wrap).left) / stage.clientWidth) * 100 - 50; // −50…50 while it walks
    const off = fx + tilt * 25;
    for (const [name, k] of Object.entries(SHIFT)) layers[name].style.transform = `translateX(${(-off * k * stage.clientWidth) / 100}px)`;
    requestAnimationFrame(loop);
  })();
})();

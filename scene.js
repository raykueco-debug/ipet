/* 2.5D scene behind the fox: flat cartoon layers at different depths that slide a little against each other
   as the fox moves (and as a tablet tilts), so the room has depth.

     sky (the stage's own gradient) · far · mid · ground · props · front
   Each layer is assets/scene/<scene>/<layer>.png when that picture exists (cartoon art, transparent, 2:1),
   a simple drawn stand-in until then. Layers are wider than the stage so they can slide. */
(function () {
  const SCENE = 'forest';
  const SHIFT = { far: 0.04, mid: 0.1, ground: 0, props: 0.02, front: -0.22 }; // × the fox's offset (px per %)
  const OUT = '#4a3a2a';
  const tree = (x, y, s, leaf, dark) => `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-9" y="-60" width="18" height="62" rx="6" fill="#9b6a43" stroke="${OUT}" stroke-width="3"/>
      <circle cx="0" cy="-92" r="46" fill="${leaf}" stroke="${OUT}" stroke-width="3"/>
      <circle cx="-30" cy="-70" r="30" fill="${leaf}" stroke="${OUT}" stroke-width="3"/>
      <circle cx="30" cy="-70" r="30" fill="${leaf}" stroke="${OUT}" stroke-width="3"/>
      <path d="M-30 -70 a30 30 0 0 0 60 0" fill="${dark}" opacity=".35"/></g>`;
  const pine = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-6" y="-20" width="12" height="22" fill="#8a5c3a"/>
      <path d="M0 -130 L42 -20 L-42 -20 Z" fill="${c}"/><path d="M0 -150 L32 -70 L-32 -70 Z" fill="${c}"/></g>`;
  const bush = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" stroke="${OUT}" stroke-width="3">
      <circle cx="-26" cy="-18" r="22" fill="${c}"/><circle cx="26" cy="-18" r="22" fill="${c}"/>
      <circle cx="0" cy="-30" r="28" fill="${c}"/><rect x="-46" y="-18" width="92" height="18" fill="${c}" stroke="none"/></g>`;
  const svg = body => `<svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax meet">${body}</svg>`;
  const DRAWN = {
    far: () => svg(`<path d="M0 360 Q200 260 420 330 T820 310 T1200 340 V600 H0Z" fill="#b9dca6"/>
      ${[80, 190, 300, 860, 980, 1100].map((x, k) => pine(x, 350 - (k % 2) * 12, 0.9, '#9cc98d')).join('')}
      <path d="M0 400 Q300 340 600 380 T1200 390 V600 H0Z" fill="#a6d391"/>`),
    mid: () => svg(`${tree(110, 420, 1.15, '#6fbf5a', '#2f7a3a')}${tree(1080, 410, 1.25, '#73c45e', '#2f7a3a')}
      ${tree(250, 400, 0.8, '#82cc69', '#2f7a3a')}${tree(950, 395, 0.75, '#82cc69', '#2f7a3a')}
      ${bush(330, 420, 0.9, '#5fb24f')}${bush(880, 418, 0.85, '#5fb24f')}`),
    ground: () => svg(`<path d="M0 400 Q600 370 1200 400 V600 H0Z" fill="#8fd16f"/>
      <ellipse cx="600" cy="520" rx="420" ry="70" fill="#a3dc80"/>`),
    props: () => svg(`<g stroke="${OUT}" stroke-width="3">
        <ellipse cx="190" cy="500" rx="46" ry="14" fill="#c99566"/><rect x="144" y="462" width="92" height="38" fill="#a8744a"/>
        <ellipse cx="190" cy="462" rx="46" ry="14" fill="#e3b98a"/>
        <rect x="984" y="470" width="10" height="22" fill="#fff4e0"/><path d="M968 472 a21 18 0 0 1 42 0Z" fill="#e8574a"/>
        <circle cx="980" cy="462" r="3" fill="#fff" stroke="none"/><circle cx="995" cy="466" r="3" fill="#fff" stroke="none"/>
        <ellipse cx="1060" cy="505" rx="34" ry="20" fill="#b9b6ad"/></g>
      ${[[300, 540, '#ffd84d'], [350, 560, '#ff8fb1'], [860, 550, '#ffffff'], [905, 535, '#ffd84d']].map(([x, y, c]) =>
        `<g transform="translate(${x} ${y})"><path d="M0 0 V-16" stroke="#3f8f3a" stroke-width="3"/>
         ${[0, 72, 144, 216, 288].map(a => `<circle cx="${6 * Math.cos(a * Math.PI / 180)}" cy="${-20 + 6 * Math.sin(a * Math.PI / 180)}" r="5" fill="${c}"/>`).join('')}
         <circle cx="0" cy="-20" r="3.5" fill="#f2a33a"/></g>`).join('')}`),
    front: () => svg(`${[[20, 600], [90, 610], [1130, 600], [1185, 612]].map(([x, y]) =>
        `<path d="M${x - 40} ${y} q20 -70 30 -90 q4 50 12 60 q8 -60 26 -80 q-2 60 8 80 q14 -40 34 -50 q-14 50 -10 80Z" fill="#5aa84a" stroke="${OUT}" stroke-width="3"/>`).join('')}`),
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

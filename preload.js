/* The loading screen (#splash in index.html): the pet's and the fling game's pictures and music fetched first, with
   how far along it is, then "tap to go in" — that tap also wakes the sound and, where the phone lets it, goes
   fullscreen (app.js's own first-touch listeners), and the splash is gone, the pet underneath it.

   The addresses are just as fox2d.js / fling.js / sound.js ask for them (with their ?v=), so those find them cached. */
(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const bar = splash.querySelector('.splash-bar i'), pct = splash.querySelector('.splash-pct'), go = splash.querySelector('.splash-go');
  const json = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);

  // the pet's clips played most (the rest it fetches itself as it goes), the fling's, and the fling's in its cape
  const PET = ['normal_loop', 'normal_loop_blink', 'normal_loop_ears', 'normal_loop_listen', 'normal_loop_sway', 'normal_loop_tail', 'normal_loop_talk',
    'normal_to_walk', 'normal_to_walk_r', 'walk_loop', 'walk_r_loop', 'walk_turn', 'walk_r_turn', 'walk_to_normal', 'walk_r_to_normal',
    'normal_to_eat', 'eat_loop', 'eat_to_normal', 'normal_to_happy', 'happy_loop', 'happy_to_normal', 'normal_to_drowsy', 'drowsy_loop', 'sleep_loop'];
  const FLING = ['walk_r_loop_run', 'walk_r_to_pounce_r', 'roll_loop', 'jump_joy_loop', 'surprised_loop', 'cheer_loop', 'happy_loop', 'back_crouch_to_back_air', 'back_air_to_back_crouch'];
  const CAPED = ['cheer_loop', 'happy_loop', 'back_crouch_to_back_air', 'back_air_to_back_crouch'];
  const MUSIC = ['PerituneMaterial_Laid_Back3_loop.m4a', 'PerituneMaterial_Battle_Fun_loop.m4a', 'Peritune_Magic_Skirmish_loop.m4a'].map(f => 'assets/music/' + f);

  async function list() {
    const urls = [...MUSIC];
    const clip = async (dir, name, fling) => {
      const m = await json(`assets/fox/${dir}/${name}/meta.json`); if (!m) return;
      const v = fling ? `?v=${m.rev || 1}` : m.rev ? `?v=${m.rev}` : ''; // (fling.js always adds one, fox2d.js only for a revision)
      for (const f of m.frames) urls.push(`assets/fox/${dir}/${name}/${f}${v}`);
    };
    await Promise.all([
      ...PET.map(n => clip('clips', n, false)), ...FLING.map(n => clip('clips', n, true)), ...CAPED.map(n => clip('clips_halloween', n, true)),
      ...['assets/bg', 'assets/bg/halloween'].map(async d => { for (const n of (await json(`${d}/index.json`)) || []) urls.push(`${d}/${n}.webp`); for (const k of ['base', 'crown', 'trunk']) urls.push(`${d}/tree_${k}.webp`); }),
      ...['assets/friends', 'assets/friends/halloween'].map(async d => { for (const n of (await json(`${d}/index.json`)) || []) urls.push(`${d}/${n}.png`); }),
    ]);
    return [...new Set(urls)];
  }

  function ready() {
    splash.classList.add('ready'); go.hidden = false;
    splash.addEventListener('click', () => { splash.classList.add('gone'); setTimeout(() => splash.remove(), 400); }, { once: true });
  }

  list().then(async urls => {
    let done = 0, next = 0;
    const show = () => { const p = Math.round(done / urls.length * 100); bar.style.width = p + '%'; pct.textContent = p + '%'; };
    const worker = async () => { while (next < urls.length) { await fetch(urls[next++]).then(r => r.blob()).catch(() => {}); done++; show(); } };
    show();
    await Promise.all(Array.from({ length: 6 }, worker));
    ready();
  }).catch(ready);
})();

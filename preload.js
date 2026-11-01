/* The loading screen (#splash in index.html): only what the pet shows first (its sitting clips, ~1.7 MB) fetched
   with how far along it is, then "tap to go in" — that tap also wakes the sound and, where the phone lets it, goes
   fullscreen (app.js's own first-touch listeners), and the splash is gone, the pet underneath it. The rest (its other
   clips, the music, the fling game's pictures) comes on its own afterwards, as it's needed.

   Never stuck: each file given FILE_S seconds at most, and after MOST_S seconds it can be tapped in whatever's left
   (the phone stuck at 3% for minutes on one request that never answered). The addresses are just as fox2d.js asks
   for them (with its ?v=), so it finds them cached. */
(() => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const bar = splash.querySelector('.splash-bar i'), pct = splash.querySelector('.splash-pct'), go = splash.querySelector('.splash-go');
  const FILE_S = 8, MOST_S = 12;
  const PET = ['normal_loop', 'normal_loop_blink', 'normal_loop_tail'];

  const timed = (u, s) => { // a fetch given s seconds at most
    const c = window.AbortController ? new AbortController() : null, t = setTimeout(() => c?.abort(), s * 1000);
    return fetch(u, c ? { signal: c.signal } : {}).then(r => (r.ok ? r : null)).catch(() => null).finally(() => clearTimeout(t));
  };

  let open = false;
  function ready() {
    if (open) return; open = true;
    splash.classList.add('ready'); go.hidden = false;
    splash.addEventListener('click', () => {
      splash.classList.add('gone'); setTimeout(() => splash.remove(), 400);
      dispatchEvent(new Event('ipet-in')); // (fling.js: its own pictures a little after)
    }, { once: true });
  }
  setTimeout(ready, MOST_S * 1000);

  (async () => {
    const urls = [];
    for (const n of PET) {
      const r = await timed(`assets/fox/clips/${n}/meta.json`, FILE_S), m = r && await r.json().catch(() => null);
      if (m) for (const f of m.frames) urls.push(`assets/fox/clips/${n}/${f}${m.rev ? '?v=' + m.rev : ''}`); // (as fox2d.js: ?v= only for a revision)
    }
    let done = 0, next = 0;
    const show = () => { const p = urls.length ? Math.round(done / urls.length * 100) : 100; bar.style.width = p + '%'; pct.textContent = p + '%'; };
    const worker = async () => { while (next < urls.length) { const r = await timed(urls[next++], FILE_S); await r?.blob().catch(() => {}); done++; show(); } };
    show();
    await Promise.all(Array.from({ length: 4 }, worker));
    ready();
  })().catch(ready);
})();

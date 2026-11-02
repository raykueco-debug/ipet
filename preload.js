/* The loading screen (.splash): what's needed next fetched with how far along it is, then "tap to go in" — that tap
   also wakes the sound and, where the phone lets it, goes fullscreen (app.js's and fling.js's own on a touch).
   On opening the page (#splash in index.html: the pet's sitting clips, ~1.7 MB), and on going between the pet and
   the fling game either way (app.js: Preload.run).

   Never stuck: each file given FILE_S seconds at most, and after MOST_S seconds it can be tapped in whatever's left
   (a phone sat at 3% for minutes on a request that never answered). The addresses are just as fox2d.js asks for them
   (with its ?v=), so it finds them cached. */
(() => {
  const FILE_S = 8, MOST_S = 12;
  const PET = ['normal_loop', 'normal_loop_blink', 'normal_loop_tail'];

  const timed = (u, s) => { // a fetch given s seconds at most
    const c = window.AbortController ? new AbortController() : null, t = setTimeout(() => c?.abort(), s * 1000);
    return fetch(u, c ? { signal: c.signal } : {}).then(r => (r.ok ? r : null)).catch(() => null).finally(() => clearTimeout(t));
  };
  async function petUrls() { // (the pet's sitting clips' frames, as fox2d.js asks for them: ?v= only for a revision)
    const urls = [];
    for (const n of PET) {
      const r = await timed(`assets/fox/clips/${n}/meta.json`, FILE_S), m = r && await r.json().catch(() => null);
      if (m) for (const f of m.frames) urls.push(`assets/fox/clips/${n}/${f}${m.rev ? '?v=' + m.rev : ''}`);
    }
    return urls;
  }
  async function fetchAll(urls, progress) {
    let done = 0, next = 0;
    const worker = async () => { while (next < urls.length) { const r = await timed(urls[next++], FILE_S); await r?.blob().catch(() => {}); progress(++done / urls.length); } };
    progress(urls.length ? 0 : 1);
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  // o: { title, load(progress) (else the pet's sitting clips), go() once tapped in }; el: the screen there already
  function run(o = {}, el = null) {
    if (!el) {
      el = document.createElement('div'); el.className = 'splash';
      el.innerHTML = '<img src="icons/icon-512.png" alt=""><div class="splash-title"></div><div class="splash-bar"><i></i></div><div class="splash-pct">0%</div><button class="splash-go" hidden>點一下進入</button>';
      document.body.appendChild(el);
    }
    if (o.title) el.querySelector('.splash-title').textContent = o.title;
    const bar = el.querySelector('.splash-bar i'), pct = el.querySelector('.splash-pct'), go = el.querySelector('.splash-go');
    const show = f => { const p = Math.round(Math.min(1, f) * 100); bar.style.width = p + '%'; pct.textContent = p + '%'; };
    let open = false;
    const ready = () => {
      if (open) return; open = true; show(1);
      el.classList.add('ready'); go.hidden = false;
      el.addEventListener('click', () => { el.classList.add('gone'); setTimeout(() => el.remove(), 400); o.go?.(); }, { once: true });
    };
    setTimeout(ready, MOST_S * 1000);
    Promise.resolve(o.load ? o.load(show) : petUrls().then(urls => fetchAll(urls, show))).then(ready, ready);
  }

  window.Preload = { run };
  const first = document.getElementById('splash');
  if (first) run({ go: () => dispatchEvent(new Event('ipet-in')) }, first); // (fling.js: its own pictures a little after)
})();

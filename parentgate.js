/* The parent's side, kept from the child: a 4-digit parent PIN, and a camera to scan a child's QR code inside the
   app (on an iPhone / iPad an app on the home screen keeps its own storage: the Camera app opens a scanned link in
   Safari instead, paired there and not here). Used by the pet (index.html: settings → 我是家長) and parent.html.
   PIN: set the first time (twice), kept on this device as a salted hash (ipet-parent-pin); asked again once per
   session (sessionStorage). Forgotten: a sum only a grown-up does, and it's set again.
   Gate.pin() → Promise<boolean>; Gate.scan() → Promise<pairing code | null> (jsqr.js, fetched when first needed). */
window.Gate = (() => {
  const KEY = 'ipet-parent-pin', OK = 'ipet-parent-ok';
  const zh = (document.documentElement.lang || 'zh').startsWith('zh') && (window.I18N?.lang || 'zh') === 'zh';
  const T = zh ? {
    set: '設定 4 位數家長密碼', again: '再輸入一次確認', enter: '輸入家長密碼', wrong: '密碼不對', mismatch: '兩次不一樣，重新設定',
    forgot: '忘記密碼？', cancel: '取消', sum: '請回答（重設密碼）：', scan: '對準孩子小狐設定裡的 QR 碼', noCam: '這裡開不了即時相機，請用「拍照掃描」或輸入配對碼', notOurs: '這不是小狐的配對 QR 碼',
    photo: '拍照掃描', code: '或輸入配對碼', ok: '確定', badCode: '配對碼是 10 碼英文和數字', noQr: '照片裡找不到 QR 碼，再拍近一點',
  } : {
    set: 'Set a 4-digit parent PIN', again: 'Enter it again', enter: 'Enter the parent PIN', wrong: 'Wrong PIN', mismatch: "They didn't match — set it again",
    forgot: 'Forgot it?', cancel: 'Cancel', sum: 'Answer to reset the PIN: ', scan: "Point at the QR code in your child's Foxy settings", noCam: 'No live camera here — take a photo or type the code', notOurs: "That's not a Foxy pairing code",
    photo: 'Take a photo', code: 'or type the code', ok: 'OK', badCode: 'The code is 10 letters and digits', noQr: 'No QR code in that photo — try closer',
  };
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const hash = async (pin, salt) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin))), b => b.toString(16).padStart(2, '0')).join('');

  const css = document.createElement('style');
  css.textContent = `
  .gate { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: #2b1d14cc; padding: 16px; font-family: inherit; }
  .gate-card { background: #fff; color: #3b2f2a; border-radius: 24px; padding: 20px; width: min(320px, 100%); text-align: center; box-shadow: 0 10px 40px #0005; }
  .gate-card h3 { margin: 4px 0 12px; font-size: 18px; }
  .gate-dots { display: flex; gap: 12px; justify-content: center; margin: 8px 0 6px; }
  .gate-dots i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #e8743b; }
  .gate-dots i.on { background: #e8743b; }
  .gate-msg { min-height: 20px; color: #c0392b; font-size: 14px; }
  .gate-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
  .gate-pad button, .gate-row button { border: 0; border-radius: 16px; padding: 14px 0; font: inherit; font-size: 22px; font-weight: 700; background: #f6efe8; color: #3b2f2a; }
  .gate-pad button:active { background: #f0d9c6; }
  .gate-row { display: flex; gap: 10px; justify-content: space-between; }
  .gate-row button { font-size: 14px; padding: 10px 14px; background: transparent; color: #8a776a; }
  .gate-cam { position: relative; width: min(86vw, 420px); aspect-ratio: 1; border-radius: 22px; overflow: hidden; background: #000; }
  .gate-cam video { width: 100%; height: 100%; object-fit: cover; }
  .gate-cam::after { content: ''; position: absolute; inset: 14%; border: 4px solid #fff9; border-radius: 18px; }
  .gate-scan { display: flex; flex-direction: column; gap: 12px; align-items: center; color: #fff; text-align: center; }
  .gate-cam[hidden] { display: none; }
  .gate-photo { border-radius: 999px; padding: 12px 22px; font-weight: 800; background: #e8743b; color: #fff; cursor: pointer; }
  .gate-type { display: flex; gap: 8px; }
  .gate-type input { width: 9em; font: inherit; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; border: 0; border-radius: 12px; padding: 10px 12px; }
  .gate-scan button { border: 0; border-radius: 999px; padding: 12px 26px; font: inherit; font-weight: 800; background: #fff; color: #3b2f2a; }`;
  document.head.appendChild(css);

  // the PIN pad: resolves to the 4 digits, or null (cancelled)
  function pad(title, opts = {}) {
    return new Promise(done => {
      const d = document.createElement('div'); d.className = 'gate';
      d.innerHTML = `<div class="gate-card"><h3>🔒 ${title}</h3><div class="gate-dots">${'<i></i>'.repeat(4)}</div><div class="gate-msg">${opts.msg || ''}</div>
        <div class="gate-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<span></span><button data-n="0">0</button><button data-n="del">⌫</button></div>
        <div class="gate-row"><button data-n="cancel">${T.cancel}</button>${opts.forgot ? `<button data-n="forgot">${T.forgot}</button>` : ''}</div></div>`;
      document.body.appendChild(d);
      let v = '';
      const show = () => d.querySelectorAll('.gate-dots i').forEach((i, k) => i.classList.toggle('on', k < v.length));
      const end = r => { d.remove(); done(r); };
      d.addEventListener('click', e => {
        const n = e.target.closest('button')?.dataset.n; if (!n) return;
        if (n === 'cancel') return end(null);
        if (n === 'forgot') return end('forgot');
        if (n === 'del') v = v.slice(0, -1); else if (v.length < 4) v += n;
        show();
        if (v.length === 4) setTimeout(() => end(v), 120);
      });
    });
  }
  async function pin() { // true once the parent's PIN is in (set first, if there's none)
    try { if (sessionStorage.getItem(OK) === '1') return true; } catch (e) {}
    const saved = get(KEY);
    if (!saved) { // first time: set it, twice
      for (let msg = ''; ;) {
        const a = await pad(T.set, { msg }); if (a == null) return false;
        const b = await pad(T.again); if (b == null) return false;
        if (a !== b) { msg = T.mismatch; continue; }
        const salt = Math.random().toString(36).slice(2, 10);
        put(KEY, salt + ':' + await hash(a, salt)); break;
      }
    } else {
      const [salt, h] = saved.split(':');
      for (let msg = ''; ;) {
        const a = await pad(T.enter, { msg, forgot: true }); if (a == null) return false;
        if (a === 'forgot') { if (await grownUp()) { put(KEY, null); return pin(); } continue; }
        if (await hash(a, salt) === h) break;
        msg = T.wrong;
      }
    }
    try { sessionStorage.setItem(OK, '1'); } catch (e) {}
    return true;
  }
  async function grownUp() { // a sum a young child won't do: then the PIN may be set again
    const x = 12 + Math.floor(Math.random() * 8), y = 6 + Math.floor(Math.random() * 4);
    const a = prompt(`${T.sum}${x} × ${y} = ?`);
    return a != null && Number(a.trim()) === x * y;
  }

  // a pairing QR code (parent.html?family=CODE, or the code itself)
  let lib = null;
  const loadLib = () => lib ||= new Promise((ok, no) => { if (window.jsQR) return ok(); const s = document.createElement('script'); s.src = 'jsqr.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const codeIn = text => {
    let c = '';
    try { c = new URL(text, location.href).searchParams.get('family') || ''; } catch (e) {}
    if (!c && /^[A-Za-z0-9]{8,12}$/.test(text.trim())) c = text.trim();
    c = c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    return c.length >= 8 ? c : '';
  };
  // the camera on the QR code — and, where that won't open (some iPhones / iPads in a home-screen app), a photo of
  // it taken with the camera instead, or the code typed in
  function decode(src) { // a picture → the pairing code in its QR code, or ''
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    for (const size of [640, 1000, 400]) { // (a photo: tried at a few sizes)
      const k = Math.min(1, size / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k);
      g.drawImage(src, 0, 0, c.width, c.height);
      const q = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      if (q?.data) return codeIn(q.data) || '-';
      if (src.videoWidth) break; // (live: one size, again in a moment)
    }
    return '';
  }
  function scan() {
    return new Promise(async done => {
      const d = document.createElement('div'); d.className = 'gate';
      d.innerHTML = `<div class="gate-scan"><div class="gate-cam"><video playsinline muted autoplay></video></div>
        <div class="gate-msg" style="color:#fff">${T.scan}</div>
        <label class="gate-photo">📸 ${T.photo}<input type="file" accept="image/*" capture="environment" hidden></label>
        <div class="gate-type"><input inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="12" placeholder="${T.code}"><button data-k="ok">${T.ok}</button></div>
        <button data-k="cancel">${T.cancel}</button></div>`;
      document.body.appendChild(d);
      const video = d.querySelector('video'), msg = d.querySelector('.gate-msg'), typed = d.querySelector('.gate-type input');
      let stream = null, live = true;
      const end = r => { live = false; stream?.getTracks().forEach(t => t.stop()); d.remove(); done(r); };
      d.querySelector('[data-k=cancel]').onclick = () => end(null);
      const ok = () => { const c = codeIn(typed.value); if (c) end(c); else msg.textContent = T.badCode; };
      d.querySelector('[data-k=ok]').onclick = ok;
      typed.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      d.querySelector('input[type=file]').addEventListener('change', async e => { // a photo of it
        const file = e.target.files?.[0]; if (!file) return;
        msg.textContent = '…';
        try {
          await loadLib();
          const im = new Image(); im.src = URL.createObjectURL(file); await im.decode();
          const code = decode(im); URL.revokeObjectURL(im.src);
          if (code && code !== '-') return end(code);
          msg.textContent = code ? T.notOurs : T.noQr;
        } catch (err) { msg.textContent = T.noQr; }
      });
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
        [stream] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }), loadLib()]);
      } catch (e) { // (no live camera here: the photo or the code, then)
        d.querySelector('.gate-cam').hidden = true;
        msg.textContent = `${T.noCam}（${e?.name || e?.message || e}）`;
        loadLib().catch(() => {});
        return;
      }
      if (!live) return stream.getTracks().forEach(t => t.stop());
      video.srcObject = stream; await video.play().catch(() => {});
      const look = () => {
        if (!live) return;
        if (video.videoWidth) { const code = decode(video); if (code && code !== '-') { navigator.vibrate?.(80); return end(code); } if (code) msg.textContent = T.notOurs; }
        setTimeout(look, 150);
      };
      look();
    });
  }
  return { pin, scan, get hasPin() { return !!get(KEY); } };
})();

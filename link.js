/* The parent ↔ child link through Supabase (docs/supabase.sql, docs/supabase.md): the parent page sends food to a
   pairing code, the pet asks every few seconds whether there's anything new for its own; and rooms (Realtime
   broadcast) for what goes at once — the invite to fly together, and the flight itself. Only through the two
   functions there — the table itself is closed — so it takes knowing the code to read or write.

   Not filled in (URL / KEY empty): Link.on is false and both pages fall back to server.py's /api (on the LAN). */
window.Link = (() => {
  const URL = 'https://reupwsabpzlipktkrpom.supabase.co'; // the project (Supabase: ipet, raykueco-debug's Org)
  const KEY = 'sb_publishable_qZZKlQG8CErs8Kb5OjtpHA_TZJb01Q4'; // its publishable key (meant to be in the page: what it may do is only what the SQL grants)
  const on = !!(URL && KEY);
  const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
  const rpc = (fn, body) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
    .then(r => (r.ok ? r.text().then(s => (s ? JSON.parse(s) : null)) : Promise.reject(new Error(`${fn}: ${r.status}`)))); // (a void one: nothing back)

  // push (Web Push): this device told when the other side challenges — sw.js shows it, supabase/functions/notify
  // sends it. On an iPhone / iPad only from the home screen (added to it, opened from its icon), iOS 16.4 on.
  const FN = `${URL}/functions/v1/notify`;
  // (the push key's public half, from the function, which made the pair itself and keeps the private one)
  const vapid = () => fetch(FN, { headers }).then(r => r.json()).then(j => j.publicKey);
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  const key = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  async function subscription(ask) {
    if (!canPush || !on) return null;
    // (asked first, straight from the tap: iOS only asks from a tap, not after waiting on something else)
    const asked = ask && Notification.permission === 'default' ? Notification.requestPermission() : null;
    const reg = await navigator.serviceWorker.register('sw.js');
    if (asked && (await asked) !== 'granted') return null;
    if (Notification.permission !== 'granted') return null;
    await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) || (ask ? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(await vapid()) }) : null);
  }
  const push = {
    // 'on' | 'off' (not asked yet) | 'denied' | 'home' (an iPhone / iPad, not from the home screen: add it there first) | 'no'
    get state() {
      if (!on) return 'no';
      if (!canPush) return ios && !standalone ? 'home' : 'no';
      return Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off';
    },
    // this device told for these pairing codes, as the child or a parent (ask: from a tap, the permission asked for)
    async enable(families, role, device = '', ask = false) {
      const s = await subscription(ask).catch(() => null); if (!s) return false;
      const sub = s.toJSON();
      await Promise.all(families.filter(Boolean).map(f => rpc('save_push', { p_family: f, p_role: role, p_device: device, p_sub: sub }))).catch(() => {});
      return true;
    },
    async drop(family) { // not told for that code any more (unbound)
      const s = await subscription(false).catch(() => null);
      if (s) await rpc('drop_push', { p_endpoint: s.endpoint, p_family: family ?? null }).catch(() => {});
    },
    // the other side's devices told: { family, to: 'kid' | 'parent', title, body, url, tag }
    send: m => fetch(FN, { method: 'POST', headers, body: JSON.stringify(m) }).then(r => r.json()).catch(() => null),
  };
  // a room to talk in at once, through Supabase Realtime's broadcast (nothing stored, no table: what's sent goes to whoever
  // is in the room right then) — the invite to fly together (room family:<code>), the two foxes' flights (battle:<id>).
  // room(name) → { send(event, payload), on(event, fn), close() }; joined (and joined again if it drops) by itself
  function room(name) {
    const topic = `realtime:ipet-${name}`, fns = {}, out = [];
    let ws = null, ref = 0, joined = false, beat = 0, closed = false;
    const put = m => ws?.readyState === 1 && ws.send(JSON.stringify({ ...m, ref: String(++ref) }));
    function open() {
      if (closed) return;
      ws = new WebSocket(`${URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
      ws.onopen = () => {
        put({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } } });
        clearInterval(beat); beat = setInterval(() => put({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
      };
      ws.onmessage = m => {
        const d = JSON.parse(m.data);
        if (d.event === 'phx_reply' && d.topic === topic && d.payload?.status === 'ok' && !joined) { joined = true; while (out.length) put(out.shift()); }
        if (d.event === 'broadcast') (fns[d.payload?.event] || []).forEach(fn => fn(d.payload.payload || {}));
      };
      ws.onclose = () => { joined = false; clearInterval(beat); if (!closed) setTimeout(open, 1500); };
    }
    open();
    return {
      send(event, payload = {}) { const m = { topic, event: 'broadcast', payload: { type: 'broadcast', event, payload } }; if (joined) put(m); else if (out.length < 20) out.push(m); },
      on(event, fn) { (fns[event] ||= []).push(fn); return this; },
      close() { closed = true; clearInterval(beat); try { ws?.close(); } catch (e) {} },
    };
  }
  return {
    on,
    sendGift: (family, item, from) => rpc('send_gift', { p_family: family, p_item: item, p_from: from || '' }),
    inbox: (family, after) => rpc('pet_inbox', { p_family: family, p_after: after ?? null }), // (null: just the latest, to start from)
    room: name => (on ? room(name) : null),
    push,
  };
})();

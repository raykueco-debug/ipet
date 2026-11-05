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
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${fn}: ${r.status}`))));
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
  };
})();

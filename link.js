/* The parent ↔ child link through Supabase (docs/supabase.sql, docs/supabase.md): the parent page sends food to a
   pairing code, the pet asks every few seconds whether there's anything new for its own. Only through the two
   functions there — the table itself is closed — so it takes knowing the code to read or write.

   Not filled in (URL / KEY empty): Link.on is false and both pages fall back to server.py's /api (on the LAN). */
window.Link = (() => {
  const URL = 'https://reupwsabpzlipktkrpom.supabase.co'; // the project (Supabase: ipet, raykueco-debug's Org)
  const KEY = 'sb_publishable_qZZKlQG8CErs8Kb5OjtpHA_TZJb01Q4'; // its publishable key (meant to be in the page: what it may do is only what the SQL grants)
  const on = !!(URL && KEY);
  const headers = { apikey: KEY, 'Content-Type': 'application/json', ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
  const rpc = (fn, body) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${fn}: ${r.status}`))));
  return {
    on,
    sendGift: (family, item, from) => rpc('send_gift', { p_family: family, p_item: item, p_from: from || '' }),
    inbox: (family, after) => rpc('pet_inbox', { p_family: family, p_after: after ?? null }), // (null: just the latest, to start from)
  };
})();

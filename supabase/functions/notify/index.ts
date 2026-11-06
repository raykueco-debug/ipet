// notify: a push to the other side's phones / tablets (a challenge to fly together) — docs/supabase.md.
// GET → { publicKey } (what a page subscribes with). POST { family, to: 'kid' | 'parent', title, body, url, tag } →
// sent to every device that turned on notifications for that pairing code in that role (table push_subs, written
// only through save_push / drop_push). Its VAPID keys it makes itself the first time and keeps in push_keys: no one
// handles the private one. Called with the project's publishable key (as apikey; the gateway takes it), and
// knowing the pairing code is what it takes, as everywhere else.
import webpush from 'npm:web-push@3.6.7';

const URL = Deno.env.get('SUPABASE_URL')!;
// (the service role: the legacy JWT, or the new secret key where the project has those)
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (() => { try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] as string; } catch { return ''; } })();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const db = (path: string, init: RequestInit = {}) => fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });

let keys: { public_key: string; private_key: string } | null = null;
async function vapid() { // (made once, the first time: kept in push_keys, the same from then on)
  if (keys) return keys;
  const read = async () => {
    const r = await db('push_keys?id=eq.1&select=public_key,private_key');
    if (!r.ok) throw new Error(`push_keys ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json())[0] || null;
  };
  keys = await read();
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    await db('push_keys', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: 1, public_key: k.publicKey, private_key: k.privateKey }) });
    keys = await read(); // (two at once: whichever got there first)
  }
  webpush.setVapidDetails('https://github.com/raykueco-debug/ipet', keys!.public_key, keys!.private_key);
  return keys!;
}
const last = new Map<string, number>(); // (a pairing code and role: not more than once in 10 s)

Deno.serve(req => serve(req).catch(e => json({ error: String(e?.message || e) }, 500))); // (what went wrong, said)
async function serve(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ publicKey: (await vapid()).public_key });
  if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
  let m: Record<string, unknown>;
  try { m = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const family = String(m.family || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32), to = m.to === 'parent' ? 'parent' : 'kid';
  if (family.length < 8) return json({ error: 'family' }, 400);
  const key = family + ':' + to, now = Date.now();
  if (now - (last.get(key) || 0) < 10000) return json({ sent: 0, skipped: 'too soon' });
  last.set(key, now);
  await vapid();
  const payload = JSON.stringify({
    title: String(m.title || '小狐').slice(0, 60), body: String(m.body || '').slice(0, 140),
    url: String(m.url || './').slice(0, 300), tag: String(m.tag || 'ipet').slice(0, 40),
  });
  const r = await db(`push_subs?family=eq.${family}&role=eq.${to}&select=endpoint,sub`);
  if (!r.ok) return json({ error: 'db', status: r.status }, 500);
  const subs: { endpoint: string; sub: webpush.PushSubscription }[] = await r.json();
  let sent = 0;
  const errors: number[] = [];
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 300, urgency: 'high' }); sent++; }
    catch (e) { // gone (unsubscribed, app removed): forgotten
      const code = (e as { statusCode?: number }).statusCode || 0;
      errors.push(code);
      if (code === 404 || code === 410) await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
    }
  }));
  return json({ sent, of: subs.length, errors });
}

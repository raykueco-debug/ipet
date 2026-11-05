'use strict';
/* Parent side (prototype). Coins, ads and purchases are UI placeholders only. */

const $ = s => document.querySelector(s);
const GIFTS = [ // (what the pet eats: its meals, and a drink — app.js receiveGift)
  { e: '🍖', item: 'meat', key: 'g_meat', cost: 5 }, { e: '🥕', item: 'veg', key: 'g_veg', cost: 5 }, { e: '💧', item: 'water', key: 'g_water', cost: 2 },
];
const KIND_ICON = { line: '💬', tts: '⌨️', voice: '🎤' };

const st = {
  family: (localStorage.getItem('ipet-parent-family') || '').replace(/^demo$/, ''), // (the child's pairing code: scanned, or typed in)
  coins: Number(localStorage.getItem('ipet-parent-coins') || 50),
  mode: 'line', lineId: PetVoice.LINES[0].id,
  speakLang: PetVoice.SPOKEN.includes(localStorage.getItem('ipet-speak-lang')) ? localStorage.getItem('ipet-speak-lang') : 'en',
  rec: null, recUrl: null, recBlob: null, provider: null,
};
const api = (path, opts) => fetch(`api/${path}${path.includes('?') ? '&' : '?'}family=${st.family}`, opts);
const postJSON = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function setCoins(n) {
  st.coins = n;
  $('#coins').textContent = n;
  localStorage.setItem('ipet-parent-coins', n);
  document.querySelectorAll('.gifts button').forEach(b => (b.disabled = st.coins < Number(b.dataset.cost)));
}

/* ---------- gifts ---------- */
function renderGifts() {
  $('#gifts').innerHTML = GIFTS.map(g => `<button data-e="${g.e}" data-item="${g.item}" data-cost="${g.cost}"><span>${g.e}</span>${t(g.key)}<small>🪙${g.cost}</small></button>`).join('');
  setCoins(st.coins);
}
$('#gifts').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b || st.coins < Number(b.dataset.cost)) return;
  if (!st.family) { flash(t('p_needCode')); $('#family').focus(); return; }
  b.disabled = true;
  const r = window.Link?.on // (Supabase, link.js; else server.py on the LAN)
    ? await Link.sendGift(st.family, b.dataset.item, t('parents')).then(() => ({ ok: true }), () => null)
    : await postJSON('gift', { item: b.dataset.item, from: t('parents') }).catch(() => null);
  if (r && r.ok) { setCoins(st.coins - Number(b.dataset.cost)); flash(t('p_giftSent', { e: b.dataset.e })); }
  else flash(t('p_fail'));
  b.disabled = st.coins < Number(b.dataset.cost);
});

/* ---------- speech: a) fixed lines, in the language Foxy should speak ---------- */
function renderLines() {
  let html = '', cat = '';
  for (const l of PetVoice.LINES) {
    if (l.cat !== cat) { cat = l.cat; html += `<div class="cat">${PetVoice.CATS[cat][I18N.lang]}</div>`; }
    html += `<button data-id="${l.id}" class="${l.id === st.lineId ? 'on' : ''}">${l[st.speakLang]}</button>`;
  }
  $('#lines').innerHTML = html;
  document.querySelectorAll('[data-slang]').forEach(b => b.classList.toggle('on', b.dataset.slang === st.speakLang));
}
$('#lines').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  st.lineId = b.dataset.id;
  renderLines();
});
document.querySelectorAll('[data-slang]').forEach(b => b.addEventListener('click', () => {
  st.speakLang = b.dataset.slang;
  localStorage.setItem('ipet-speak-lang', st.speakLang);
  renderLines();
}));

/* ---------- b) TTS (language detected from the text) ---------- */
$('#ttsText').addEventListener('input', () => { $('#ttsCount').textContent = $('#ttsText').value.length; });

/* ---------- c) record + voice change ---------- */
$('#recBtn').addEventListener('click', async () => {
  if (st.rec) { st.rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { $('#recState').textContent = t('p_noRec'); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(x => x.stop());
      st.recBlob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (st.recUrl) URL.revokeObjectURL(st.recUrl);
      st.recUrl = URL.createObjectURL(st.recBlob);
      st.rec = null;
      $('#recBtn').classList.remove('live');
      $('#recBtn').textContent = t('p_recAgain');
      $('#recState').textContent = t('p_recDone', { kb: (st.recBlob.size / 1024).toFixed(0) });
    };
    rec.start();
    st.rec = rec;
    $('#recBtn').classList.add('live');
    $('#recBtn').textContent = t('p_recLive');
    setTimeout(() => { if (st.rec === rec) rec.stop(); }, 10000);
  } catch (e) {
    $('#recState').textContent = t('p_noMic');
  }
});

/* ---------- mode tabs ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  st.mode = b.dataset.mode;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => (p.hidden = p.dataset.pane !== st.mode));
}));

function currentSpeech() {
  if (st.mode === 'line') {
    const l = PetVoice.LINES.find(x => x.id === st.lineId);
    return { kind: 'line', text: l[st.speakLang], lineId: l.id };
  }
  if (st.mode === 'tts') {
    const text = $('#ttsText').value.trim();
    if (text && PetVoice.hasCJK(text) && !PetVoice.SPOKEN.includes('zh')) return { error: t('p_enOnly') };
    return text ? { kind: 'tts', text } : null;
  }
  return st.recBlob ? { kind: 'voice', text: '' } : null;
}

$('#previewBtn').addEventListener('click', () => {
  const s = currentSpeech();
  if (!s) return flash(st.mode === 'tts' ? t('p_needText') : t('p_needRec'));
  if (s.error) return flash(s.error);
  if (s.kind === 'voice') PetVoice.playRecording(st.recUrl);
  else PetVoice.speakText(s.text);
});

function nextAt() {
  if (document.querySelector('input[name="when"]:checked').value === 'now') return Date.now();
  const [h, m] = ($('#atTime').value || '').split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // time already passed today → tomorrow
  return d.getTime();
}

$('#sendBtn').addEventListener('click', async () => {
  const s = currentSpeech();
  if (!s) return flash(st.mode === 'tts' ? t('p_needText') : t('p_needRec'));
  if (s.error) return flash(s.error);
  const at = nextAt();
  if (!at) return flash(t('p_needTime'));
  $('#sendBtn').disabled = true;
  try {
    if (s.kind === 'voice') {
      const up = await api('audio', { method: 'POST', headers: { 'Content-Type': st.recBlob.type }, body: st.recBlob }).then(r => r.json());
      s.audioId = up.audioId;
    }
    const r = await postJSON('schedule', { ...s, at, repeat: $('#daily').checked ? 'daily' : 'once' });
    if (!r.ok) throw new Error();
    flash(at - Date.now() < 5000 ? t('p_sentNow') : t('p_sentLater'));
    loadSchedule();
  } catch (e) {
    flash(t('p_fail'));
  }
  $('#sendBtn').disabled = false;
});

/* ---------- schedule list ---------- */
async function loadSchedule() {
  try {
    const list = await api('schedule').then(r => r.json());
    $('#schedule').innerHTML = list.length
      ? list.map(s => `<li><span class="k">${KIND_ICON[s.kind]}</span><span class="t">${s.text || t('p_voiceMsg')}</span>
          <span class="when">${s.label}${s.repeat === 'daily' ? ' ' + t('p_everyday') : ''}</span>
          <button data-del="${s.id}" class="ghost">${t('p_delete')}</button></li>`).join('')
      : `<li class="empty">${t('p_empty')}</li>`;
  } catch (e) {
    $('#schedule').innerHTML = `<li class="empty">${t('p_offline')}</li>`;
  }
}
$('#schedule').addEventListener('click', async e => {
  const id = e.target.dataset.del;
  if (!id) return;
  await postJSON('schedule/delete', { id });
  loadSchedule();
});

let flashTimer = 0;
function flash(msg) {
  $('#sendState').textContent = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => ($('#sendState').textContent = ''), 3500);
}

/* ---------- coins (placeholders) ---------- */
$('#adBtn').addEventListener('click', () => { setCoins(st.coins + 10); flash(t('p_adDone')); });
$('#buyBtn').addEventListener('click', () => flash(t('p_buyNote')));

/* ---------- the children: more than one, each with its own code; the one picked is the one sent to ---------- */
const clean = c => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
st.kids = (() => { try { return JSON.parse(localStorage.getItem('ipet-parent-kids')) || []; } catch (e) { return []; } })();
if (!st.kids.length && st.family) st.kids = [{ code: st.family, name: t('p_kidN', { n: 1 }) }]; // (the one paired before: kept)
const saveKids = () => localStorage.setItem('ipet-parent-kids', JSON.stringify(st.kids));
function addKid(code, name) {
  code = clean(code); if (code.length < 8) return false;
  const had = st.kids.find(k => k.code === code);
  if (had) { if (name) had.name = name; } else st.kids.push({ code, name: name || t('p_kidN', { n: st.kids.length + 1 }) });
  saveKids(); pickKid(code); return true;
}
function pickKid(code) {
  st.family = code; localStorage.setItem('ipet-parent-family', code); $('#family').value = code;
  renderKids(); loadSchedule();
}
function renderKids() {
  $('#kids').innerHTML = st.kids.map(k => `<div class="kid${k.code === st.family ? ' on' : ''}" data-code="${k.code}">`
    + `<button class="kid-pick">${k.name.replace(/</g, '&lt;')}<small>${k.code}</small></button>`
    + `<button class="kid-fly">${t('p_flyTogether')}</button><button class="kid-x" title="${t('p_removeKid')}">✕</button></div>`).join('')
    || `<p class="hint">${t('p_needCode')}</p>`;
}
$('#kids').addEventListener('click', e => {
  const row = e.target.closest('.kid'); if (!row) return;
  const code = row.dataset.code;
  if (e.target.closest('.kid-x')) { st.kids = st.kids.filter(k => k.code !== code); saveKids(); if (st.family === code) pickKid(st.kids[0]?.code || ''); else renderKids(); return; }
  if (e.target.closest('.kid-fly')) return flyWith(code);
  pickKid(code);
});
$('#addKid').addEventListener('click', () => {
  if (!addKid($('#kidCode').value, $('#kidName').value.trim())) { flash(t('p_needCode')); $('#kidCode').focus(); return; }
  $('#kidCode').value = $('#kidName').value = '';
  flash(t('p_paired', { code: st.family }));
});
// flying together (fling.js battle, through link.js's rooms): to the game, the child's pet rung from there
$('#myName').value = localStorage.getItem('ipet-parent-name') || t('parents');
$('#myName').addEventListener('change', () => localStorage.setItem('ipet-parent-name', $('#myName').value.trim() || t('parents')));
function flyWith(code) {
  if (!window.Link?.on) { flash(t('p_fail')); return; }
  const room = Math.random().toString(36).slice(2, 10), name = ($('#myName').value.trim() || t('parents')).slice(0, 8);
  location.href = `fling.html?battle=${room}&invite=${code}&name=${encodeURIComponent(name)}`;
}

// opened from the child's QR code / link (parent.html?family=CODE): that child added (or picked), and the code taken off the address
const linked = clean(new URLSearchParams(location.search).get('family'));
if (linked) {
  addKid(linked);
  history.replaceState(null, '', location.pathname);
  setTimeout(() => flash(t('p_paired', { code: linked })), 0);
}
$('#family').value = st.family;
if (!st.family) setTimeout(() => flash(t('p_needCode')), 0);
$('#family').addEventListener('change', () => {
  st.family = $('#family').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  localStorage.setItem('ipet-parent-family', st.family);
  if (st.family.length >= 8) addKid(st.family); // (a code typed in: one of the children too)
  loadSchedule();
});
const d = new Date(Date.now() + 5 * 60000);
$('#atTime').value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function renderEngine() {
  $('#engine').textContent = st.provider
    ? t('p_engineNeural', { p: { local: t('p_localModel'), azure: 'Azure', openai: 'OpenAI' }[st.provider] || st.provider })
    : t('p_engineDevice');
}
fetch('api/tts/status').then(r => r.json()).then(j => { st.provider = j.provider; renderEngine(); }).catch(() => {});

function renderAll() {
  I18N.apply();
  renderKids();
  renderGifts();
  renderLines();
  renderEngine();
  loadSchedule();
}
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { I18N.set(b.dataset.lang); renderAll(); }));

renderAll();
setInterval(loadSchedule, 15000);

'use strict';
/* Learn English with Foxy (child side): word of the day, listen & pick, say it.
   Uses the pet's voice (PetVoice, English) and rewards the pet when the child learns. */
const Learn = (() => {
  const STORE = 'ipet-learn-v1';
  const ROUNDS = 5;
  let st = load();
  let mode = 'word';
  let quiz = null;
  let rec = null;
  const body = () => $('#learnBody');

  function load() {
    try { return Object.assign({ learned: [], day: null }, JSON.parse(localStorage.getItem(STORE))); } catch (e) { return { learned: [], day: null }; }
  }
  function store() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) {} }
  const speakEn = text => PetVoice.speakText(text, 'en');
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const zhMeaning = w => (I18N.lang === 'zh' ? `<div class="word-zh">${w.zh}</div>` : '');

  function todayWord() {
    const date = new Date().toDateString();
    if (!st.day || st.day.date !== date) {
      const fresh = WORDS.filter(x => !st.learned.includes(x.w));
      st.day = { date, w: pick(fresh.length ? fresh : WORDS).w };
      store();
    }
    return WORDS.find(x => x.w === st.day.w);
  }

  function reward(big) {
    S.stats.fun = clamp(S.stats.fun + (big ? 15 : 6));
    addBond(big ? 5 : 2);
    setExpr('happy', 2500);
    if (big) window.Fox2D?.play(Math.random() < 0.5 ? 'cheer' : 'jump_joy');
    save();
    render();
  }

  function progress() { $('#learnProgress').textContent = t('progress', { n: st.learned.length }); }

  /* ---------- word of the day ---------- */
  function showWord() {
    const w = todayWord();
    const done = st.learned.includes(w.w);
    body().innerHTML = `
      <p class="learn-msg">${t('wordOfDay')}</p>
      <div class="word-pic">${w.e}</div>
      <div class="word-en">${w.w}</div>${zhMeaning(w)}
      <button class="word-ex" id="exBtn">🔊 ${w.ex}</button>
      <button id="listenBtn">${t('listen')}</button>
      <button id="learnedBtn" class="primary" ${done ? 'disabled' : ''}>${done ? t('learnedAlready') : t('learned')}</button>`;
    $('#listenBtn').onclick = () => speakEn(w.w);
    $('#exBtn').onclick = () => speakEn(w.ex);
    $('#learnedBtn').onclick = () => {
      st.learned.push(w.w);
      store();
      reward(true);
      speakEn(`Yay! You learned ${w.w}!`);
      showWord();
      progress();
    };
    speakEn(w.w).then(() => speakEn(w.ex));
  }

  /* ---------- listen & pick ---------- */
  function newQuiz() {
    // mix today's word and learned words with a few new ones
    const pool = shuffle(WORDS.filter(x => st.learned.includes(x.w) || x.w === todayWord().w)).concat(shuffle(WORDS));
    const seen = new Set();
    const targets = pool.filter(x => !seen.has(x.w) && seen.add(x.w)).slice(0, ROUNDS);
    quiz = { targets, i: 0, score: 0, tries: 0 };
  }

  function showQuiz() {
    if (!quiz || quiz.i >= ROUNDS) newQuiz();
    const w = quiz.targets[quiz.i];
    const options = shuffle([w, ...shuffle(WORDS.filter(x => x.w !== w.w)).slice(0, 3)]);
    body().innerHTML = `
      <p class="learn-msg" id="quizMsg">${t('quizAsk')}</p>
      <button id="listenBtn">${t('listen')}</button>
      <div class="quiz-grid">${options.map(o => `<button data-w="${o.w}">${o.e}</button>`).join('')}</div>
      <p class="learn-progress">${t('quizScore', { n: quiz.score, m: ROUNDS })}</p>`;
    $('#listenBtn').onclick = () => speakEn(w.w);
    quiz.tries = 0;
    body().querySelector('.quiz-grid').onclick = e => {
      const b = e.target.closest('button');
      if (!b || b.classList.contains('right')) return;
      if (b.dataset.w === w.w) {
        b.classList.add('right');
        if (quiz.tries === 0) quiz.score++;
        $('#quizMsg').textContent = t('quizRight');
        window.Fox2D?.play('nod'); // the 2D fox nods: yes!
        reward(false);
        speakEn(`Yes! ${w.w}!`).then(() => {
          quiz.i++;
          if (quiz.i >= ROUNDS) finishQuiz();
          else showQuiz();
        });
      } else {
        quiz.tries++;
        b.classList.remove('wrong');
        void b.offsetWidth;
        b.classList.add('wrong');
        $('#quizMsg').textContent = t('quizWrong');
        window.Fox2D?.play('shake_no');
        speakEn(w.w);
      }
    };
    speakEn(w.w);
  }

  function finishQuiz() {
    body().innerHTML = `
      <div class="word-pic">🦊</div>
      <p class="learn-msg">${t('quizDone')}</p>
      <div class="stars-row">${'⭐'.repeat(quiz.score)}${'☆'.repeat(ROUNDS - quiz.score)}</div>
      <button id="againBtn" class="primary">${t('quizNext')}</button>`;
    reward(true);
    speakEn(quiz.score >= 4 ? 'Amazing! You are a superstar!' : 'Good job! Let\'s play again!');
    $('#againBtn').onclick = () => { quiz = null; showQuiz(); };
  }

  /* ---------- say it (speech recognition) ---------- */
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function judge(target, heardList) {
    // best of the recognizer's alternatives: exact word → 3 stars, close → 2, otherwise 1
    let best = 1, heard = heardList[0] || '';
    for (const h of heardList) {
      const words = h.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
      for (const x of words) {
        const dist = editDistance(x, target);
        const stars = dist === 0 ? 3 : dist <= Math.max(1, Math.floor(target.length / 4)) ? 2 : 1;
        if (stars > best) { best = stars; heard = h; }
      }
    }
    return { stars: best, heard };
  }

  function showSpeak() {
    const w = todayWord();
    body().innerHTML = `
      <p class="learn-msg" id="speakMsg">${t('speakAsk')}</p>
      <div class="word-pic">${w.e}</div>
      <div class="word-en">${w.w}</div>${zhMeaning(w)}
      <button id="listenBtn">${t('listen')}</button>
      <button id="micBtn" class="primary">${t('speakBtn')}</button>
      <div class="stars-row" id="speakStars"></div>
      <p class="learn-progress" id="heard"></p>`;
    $('#listenBtn').onclick = () => speakEn(w.w);
    $('#micBtn').onclick = () => listen(w);
    speakEn(w.w);
  }

  function listen(w) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $('#speakMsg').textContent = t('speakNoMic'); return; }
    if (rec) { rec.abort(); return; }
    rec = new SR();
    rec.lang = 'en-US';
    rec.maxAlternatives = 5;
    rec.interimResults = false;
    $('#micBtn').classList.add('mic-live');
    $('#micBtn').textContent = t('speakListening');
    rec.onresult = e => {
      const alts = Array.from(e.results[0]).map(a => a.transcript);
      const { stars, heard } = judge(w.w, alts);
      $('#speakStars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
      $('#heard').textContent = t('speakHeard', { w: heard });
      if (stars === 3) {
        $('#speakMsg').textContent = t('speakGood');
        reward(true);
        speakEn(`Great! ${w.w}!`);
        if (!st.learned.includes(w.w)) { st.learned.push(w.w); store(); progress(); }
      } else {
        $('#speakMsg').textContent = t('speakTry');
        speakEn(w.w);
      }
    };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') $('#speakMsg').textContent = t('speakNoPerm'); };
    rec.onend = () => {
      rec = null;
      $('#micBtn').classList.remove('mic-live');
      $('#micBtn').textContent = t('speakBtn');
    };
    try { rec.start(); } catch (e) { rec = null; $('#speakMsg').textContent = t('speakNoMic'); }
  }

  /* ---------- panel ---------- */
  function show(m) {
    mode = m;
    document.querySelectorAll('[data-lmode]').forEach(b => b.classList.toggle('on', b.dataset.lmode === m));
    if (rec) rec.abort();
    ({ word: showWord, quiz: showQuiz, speak: showSpeak })[m]();
    progress();
  }

  function open() {
    if (S.sleeping) { say(t('dontWake')); return; }
    PetVoice.unlock();
    $('#learn').classList.remove('hidden');
    show(mode);
  }

  function close() {
    if (rec) rec.abort();
    if (window.speechSynthesis) speechSynthesis.cancel();
    $('#learn').classList.add('hidden');
    say(t('learnReward'));
  }

  document.querySelectorAll('[data-lmode]').forEach(b => (b.onclick = () => show(b.dataset.lmode)));
  $('#learnClose').onclick = close;
  return { open };
})();

actions.learn = () => Learn.open();

'use strict';
/* Pet voice, shared by the child and parent pages.
   a) fixed lines  – a curated list; in the real app each line ships as a recorded audio file,
                     here they fall back to TTS so the prototype works without recordings
   b) TTS          – parent's typed text spoken on the child device (pitch raised = "fox voice")
   c) voice change – parent recording played back pitched up                                  */

const PetVoice = (() => {
  // fixed lines, bilingual; the parent picks which language the pet speaks
  const LINES = [
    { id: 'morning', cat: 'greet', zh: '早安！今天也要開開心心喔！', en: "Good morning! Have a happy day!" },
    { id: 'night', cat: 'greet', zh: '晚安～做個好夢，明天見！', en: "Good night! Sweet dreams, see you tomorrow!" },
    { id: 'home', cat: 'greet', zh: '你回來啦！我好想你喔！', en: "You're home! I missed you so much!" },
    { id: 'eat', cat: 'remind', zh: '吃飯時間到囉，要把飯吃光光！', en: "It's time to eat! Finish your food!" },
    { id: 'water', cat: 'remind', zh: '記得喝水喔！', en: "Remember to drink some water!" },
    { id: 'teeth', cat: 'remind', zh: '刷牙時間到了，牙齒刷亮亮！', en: "Time to brush your teeth! Make them shine!" },
    { id: 'homework', cat: 'remind', zh: '先把功課寫完，再來陪我玩好不好？', en: "Finish your homework first, then come play with me!" },
    { id: 'bath', cat: 'remind', zh: '洗澎澎時間到了！', en: "Bath time! Splash splash!" },
    { id: 'sleep', cat: 'remind', zh: '很晚了，該上床睡覺囉！', en: "It's late. Time for bed!" },
    { id: 'tidy', cat: 'remind', zh: '我們一起把玩具收好吧！', en: "Let's put the toys away together!" },
    { id: 'great', cat: 'cheer', zh: '你今天好棒棒！', en: "You did a great job today!" },
    { id: 'tryagain', cat: 'cheer', zh: '沒關係，我們再試一次！', en: "It's okay, let's try again!" },
    { id: 'proud', cat: 'cheer', zh: '爸爸媽媽說，以你為榮喔！', en: "Mom and Dad are so proud of you!" },
    { id: 'love', cat: 'love', zh: '爸爸媽媽好愛你！', en: "Mom and Dad love you very much!" },
    { id: 'miss', cat: 'love', zh: '爸爸媽媽在想你喔！', en: "Mom and Dad are thinking of you!" },
    { id: 'soon', cat: 'love', zh: '爸爸媽媽快回家了，再等一下下！', en: "Mom and Dad will be home soon. Wait a little bit!" },
  ];
  const CATS = { greet: { zh: '問候', en: 'Greetings' }, remind: { zh: '提醒', en: 'Reminders' }, cheer: { zh: '鼓勵', en: 'Cheers' }, love: { zh: '愛', en: 'Love' } };

  // A big pitch jump makes system voices sound robotic; keep it gentle and let good voices carry it
  const FOX_PITCH = 1.25; // TTS pitch (0–2)
  const FOX_RATE = 1.0;
  const VOICE_SHIFT = 1.32; // recording playback rate with pitch preservation off → higher, cuter voice

  const voices = { zh: null, en: null };
  // prefer neural / enhanced voices (Edge "Natural", iOS "Premium"/"Enhanced"/增強)
  const QUALITY = /natural|neural|online|premium|enhanced|增強|高品質|siri/i;
  function pickVoice() {
    const all = speechSynthesis.getVoices();
    const best = (list, bonus) => list.sort((a, b) => bonus(b) - bonus(a))[0] || null;
    voices.zh = best(all.filter(v => /zh|cmn/i.test(v.lang)),
      v => (QUALITY.test(v.name) ? 4 : 0) + (/TW/i.test(v.lang) ? 2 : 0) + (/female|女|hsiaochen|hsiaoyu|meijia|yating/i.test(v.name) ? 1 : 0));
    voices.en = best(all.filter(v => /^en/i.test(v.lang)),
      v => (QUALITY.test(v.name) ? 4 : 0) + (/en[-_]US/i.test(v.lang) ? 2 : 0) + (/female|ana|jenny|aria|samantha|zira/i.test(v.name) ? 1 : 0));
  }
  // Foxy speaks English only for now (Chinese voice postponed). Kept as a switch for later.
  const SPOKEN = ['en'];
  const hasCJK = text => /[\u3400-\u9fff]/.test(text);
  const langOf = text => (hasCJK(text) && SPOKEN.includes('zh') ? 'zh' : 'en');
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  /* Neural TTS from the server (Azure / OpenAI) sounds far more natural than device voices.
     Checked once; falls back to device speech when the server has no provider. */
  let neural = null;
  const neuralReady = fetch('api/tts/status', { cache: 'no-store' })
    .then(r => r.json()).then(j => { neural = !!j.provider; }).catch(() => { neural = false; });

  function playUrl(url) {
    return new Promise(resolve => {
      const a = new Audio(url);
      a.onended = () => resolve(true);
      a.onerror = () => resolve(false);
      a.play().catch(() => resolve(false));
    });
  }

  async function speakText(text, lang = langOf(text)) {
    await neuralReady;
    if (neural && (await playUrl(`api/tts?lang=${lang}&text=${encodeURIComponent(text)}`))) return true;
    return speakDevice(text, lang);
  }

  function speakDevice(text, lang = langOf(text)) {
    const v = voices[lang];
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) return resolve(false);
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = v ? v.lang : (lang === 'zh' ? 'zh-TW' : 'en-US');
      if (v) u.voice = v;
      u.pitch = FOX_PITCH;
      u.rate = FOX_RATE;
      u.onend = u.onerror = () => resolve(true);
      speechSynthesis.speak(u);
    });
  }

  function playRecording(url) {
    return new Promise(resolve => {
      const a = new Audio(url);
      a.preservesPitch = false;
      a.mozPreservesPitch = false;
      a.webkitPreservesPitch = false;
      a.playbackRate = VOICE_SHIFT;
      a.onended = a.onerror = () => resolve(true);
      a.play().catch(() => resolve(false));
    });
  }

  /* iOS only lets audio/speech start from a user gesture; call this from the first tap */
  function unlock() {
    try {
      if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      const a = new Audio();
      a.play().catch(() => {});
    } catch (e) {}
  }

  /* speech event → audio. kind: line | tts | voice */
  function play(ev) {
    if (ev.kind === 'voice' && ev.audioId) return playRecording(`audio/${ev.audioId}`);
    return speakText(ev.text);
  }

  return { LINES, CATS, SPOKEN, speakText, speakDevice, playRecording, play, unlock, langOf, hasCJK, isNeural: () => neural };
})();

'use strict';
/* UI language (zh = 繁體中文, en = English), shared by the child and parent pages.
   Static HTML uses data-i18n="key" (text) / data-i18n-ph="key" (placeholder). */
const I18N = (() => {
  const DICT = {
    zh: {
      foxName: '小狐', tails: '{n} 尾', level: 'Lv {n}', nextLevel: '下一級 {t}', levelUp: '升到 Lv {n} 了！飛多遠可以多噴射一次！', week: '第 {w} 週', nineDone: '九尾完成',
      nextTail: '下一條尾巴 {t}', hours: '{n} 小時', days: '{n} 天', tailAuto: '自動',
      stat_hunger: '飽足', stat_fun: '快樂', stat_energy: '精神', stat_clean: '清潔',
      food_meat: '肉肉', food_veg: '青菜',
      food_water: '喝水', drinkYum: ['咕嘟咕嘟～好好喝！', '好清涼～'],
      vegYum: ['青菜好好吃！', '脆脆的好好吃～', '吃青菜身體棒棒！'], meatYum: ['肉肉好香！', '好好吃～'],
      wantVeg: '也想吃青菜耶～', wantMeat: '也想吃肉肉～', balanced: '肉肉跟青菜都吃了，好健康！',
      tidyAsk: '可以幫我把玩具收好嗎？', tidyThanks: '謝謝你幫我收玩具！',
      act_feed: '餵食', act_play: '玩耍', act_clean: '清潔', act_sleep: '睡覺', act_wake: '叫醒', act_learn: '學英文',
      eggTitle: '一顆狐狸蛋出現了！', eggSub: '幫牠取個名字吧', hatch: '孵化 ✨',
      settings: '設定', pairCode: '配對碼', pairHint: '請爸媽用手機相機掃這個 QR 碼，就會打開家長版並配對好', pairShare: '🔗 把家長版連結傳給爸媽', pairCopied: '連結已複製，貼給爸媽就可以了', iAmParent: '我是家長 → 打開家長版',
      boundWith: '已綁定：', unbind: '解除綁定（換新的配對碼）', pairMore: '掃 QR 碼綁定家長', challengeParents: '🦊 挑戰爸媽一起飛', boundNow: '和{name}綁定好了！',
      challengeWait: '等爸媽回應…（爸媽的家長版要開著）', challengeNo: '爸媽現在不方便，等一下再挑戰吧', challengeNone: '爸媽沒有回應（請爸媽打開家長版）', cancel: '取消',
      unbindAsk: '解除和所有家長的綁定？配對碼會換新的，要重新掃 QR 碼才能再綁定。',
      rename: '改名字', runner: '🦊 狐火奔跑（試玩）', act_game: '飛多遠', admin: '管理人模式（數值 FF 鎖）', reset: '重新開始（會清除寵物）', close: '關閉', language: 'Language / 語言',
      renamePrompt: '新名字', resetConfirm: '確定要重新開始嗎？目前的小狐會消失。',
      hello: '你好！我是{name}～', full: '吃不下了啦～', yum: ['好吃！', '嚼嚼嚼…', '還要還要！', '最喜歡了～'],
      tooTired: '好累…想睡覺', tooTiredToPlay: '好累喔…不想飛了，讓我睡一下或吃點東西～', playLines: ['再來一次！', '抓到你了！', '嘿嘿～'], cleanDone: '毛毛變乾淨了～',
      stillSleepy: '嗚…還好睏…', morning: '早安！', notSleepy: '還不睏！再玩一下嘛', goodnight: '晚安…',
      wokeUp: '睡飽了！早安～', dontWake: 'Zzz…別吵…', huh: '！？', what: '嗯？要幹嘛？',
      petLines: ['嘿嘿～', '再摸一下！', '喜歡你～'], hungry: '肚子餓了…', bored: '好無聊喔～陪我玩',
      sleepy: '好睏…', dirty: '身上黏黏的…', idle: ['那是什麼？', '嗅嗅…', '尾巴好蓬～', '今天要做什麼？'],
      nineTails: '九尾完成了！！', newTail: '長出第 {n} 條尾巴了！', msgWaiting: '有人傳話給你！點我聽聽看 👂',
      giftFrom: '{from}送我 {e}！好開心～', giftStored: '{from}送來 {e}，放進儲物箱了！', pantry: '儲物箱', pantryHint: '爸媽送來的東西都在這裡，想餵的時候再拿出來', pantryEmpty: '現在是空的，等爸媽送東西來吧～', feedThis: '餵牠', food_meat: '肉肉', food_veg: '蔬菜', food_water: '水', parents: '爸媽', whisper: '🎤 爸媽的悄悄話～',
      awayHours: '你離開了 {n} 小時，好想你！', back: '你回來了！',
      // learning
      learnTitle: '跟小狐學英文', mode_word: '每日單字', mode_quiz: '聽音選圖', mode_speak: '跟讀練習',
      wordOfDay: '今天的單字', listen: '🔊 再聽一次', learned: '我學會了！', learnedAlready: '已經學會囉 ✓',
      quizAsk: '小狐說的是哪一個？', quizRight: '答對了！好棒！', quizWrong: '再試一次！', quizNext: '下一題',
      quizScore: '答對 {n} / {m} 題', quizDone: '全部完成！小狐好開心！',
      speakAsk: '跟著小狐唸唸看', speakBtn: '🎤 按我開始唸', speakListening: '在聽你唸…',
      speakGood: '唸得好棒！', speakTry: '很接近了！再唸一次', speakHeard: '小狐聽到：「{w}」',
      speakNoMic: '這個瀏覽器不能聽你唸（iPhone 需要 https 連線）', speakNoPerm: '沒有麥克風權限',
      learnReward: '學英文好好玩！', progress: '已學會 {n} 個單字',
      // parent app
      p_title: '小狐 家長版', p_gifts: '送零食給孩子的小狐', p_ad: '▶ 看廣告 +10（示意）', p_buy: '購買金幣（示意）',
      p_speak: '讓小狐說話', p_tab_line: 'a. 固定台詞', p_tab_tts: 'b. 打字發音', p_tab_voice: 'c. 錄音變聲',
      p_speakLang: '小狐說：', p_ttsPh: '想讓小狐用英文說什麼？（最多 40 字）', p_rec: '● 按一下開始錄音（最長 10 秒）',
      p_recAgain: '● 重新錄音', p_recLive: '■ 錄音中…再按一下停止', p_recHint: '錄完可以先試聽變聲效果',
      p_recDone: '錄好了（{kb} KB），按「試聽」聽小狐的聲音', p_noRec: '這個瀏覽器不能錄音（iPhone 需要 https 連線，原型請在電腦 localhost 測試）',
      p_noMic: '沒有麥克風權限', p_now: '立刻說', p_at: '指定時間', p_daily: '每天重複', p_preview: '🔊 試聽', p_send: '送出',
      p_scheduled: '已排程', p_empty: '還沒有排程', p_offline: '連不到伺服器', p_delete: '刪除', p_everyday: '每天',
      p_voiceMsg: '錄音訊息', p_needText: '請先輸入文字', p_needRec: '請先錄音', p_needTime: '請選擇時間',
      p_sentNow: '小狐馬上就會說出來！', p_sentLater: '排程好了', p_fail: '送出失敗，請確認伺服器有開',
      p_giftSent: '已送出 {e}', p_adDone: '（示意）看完廣告，獲得 10 金幣', p_buyNote: '（示意）正式版走 Apple 內購',
      p_engineNeural: '語音引擎：{p}', p_engineDevice: '語音引擎：裝置內建語音（較生硬）。設定雲端語音金鑰後會自動改用自然語音',
      p_foot: '原型：兒童端開 / ，家長端開 /parent.html，兩邊配對碼相同即可連線。金幣、廣告、購買目前只是畫面示意。',
      g_apple: '蘋果', g_rice: '飯糰', g_fish: '小魚', g_cake: '蛋糕', g_meat: '肉肉', g_veg: '蔬菜', g_water: '一碗水', p_needCode: '先配對：在孩子的小狐按 ⚙︎ 設定，用相機掃 QR 碼（或輸入配對碼）', p_paired: '已和孩子的小狐配對：{code}', p_kids: '孩子們', p_kidN: '孩子 {n}', p_kidCode: '配對碼', p_kidName: '名字', p_addKid: '＋ 加一個孩子', p_removeKid: '移除', p_flyTogether: '🦊 挑戰',
      p_online: '在線上', p_away: '沒開著', p_challengeWait: '等 {name} 回應…（孩子的小狐要開著）', p_challenged: '{name} 挑戰你一起飛！', p_accept: '接受', p_later: '等一下',
      p_noAnswer: '{name} 沒有回應（孩子的小狐要開著）', p_declined: '{name} 現在不方便', p_unbindAsk: '解除和 {name} 的綁定？', p_unbound: '{name} 解除了綁定', p_taken: '另一位家長先接受了', p_cancel: '取消', p_myName: '你的名字（一起飛時顯示）', inviteFly: '{from}邀你一起飛！', inviteGo: '一起飛', inviteLater: '等一下',
      p_enOnly: '小狐目前只會說英文，請輸入英文', p_localModel: '內建模型 Kokoro',
    },
    en: {
      foxName: 'Foxy', tails: '{n} tail(s)', level: 'Lv {n}', nextLevel: 'next level in {t}', levelUp: 'Level {n}! One more dash in the flying game!', week: 'Week {w}', nineDone: 'Nine tails!',
      nextTail: 'next tail in {t}', hours: '{n}h', days: '{n}d', tailAuto: 'Auto',
      stat_hunger: 'Food', stat_fun: 'Fun', stat_energy: 'Energy', stat_clean: 'Clean',
      food_meat: 'Meat', food_veg: 'Veggies',
      food_water: 'Water', drinkYum: ['Gulp gulp — so good!', 'Nice and cool!'],
      vegYum: ['Veggies are yummy!', 'Crunchy and yummy!', 'Veggies make me strong!'], meatYum: ['Meat smells so good!', 'Yummy!'],
      wantVeg: 'I want some veggies too!', wantMeat: 'I want some meat too!', balanced: 'Meat and veggies, so healthy!',
      tidyAsk: 'Can you help me put my toy away?', tidyThanks: 'Thank you for tidying up!',
      act_feed: 'Feed', act_play: 'Play', act_clean: 'Clean', act_sleep: 'Sleep', act_wake: 'Wake', act_learn: 'Learn',
      eggTitle: 'A fox egg appeared!', eggSub: 'Give it a name', hatch: 'Hatch ✨',
      settings: 'Settings', pairCode: 'Pairing code', pairHint: 'Parents: scan this QR code with your phone camera to open the parent app, already paired', pairShare: '🔗 Send the parent link', pairCopied: 'Link copied — paste it to a parent', iAmParent: "I'm a parent → open the parent app",
      boundWith: 'Linked with: ', unbind: 'Unlink (new pairing code)', pairMore: 'Scan to link a parent', challengeParents: '🦊 Challenge a parent', boundNow: 'Linked with {name}!',
      challengeWait: 'Waiting for a parent… (the parent app must be open)', challengeNo: 'Not now — try again later', challengeNone: 'No answer (ask a parent to open the parent app)', cancel: 'Cancel',
      unbindAsk: 'Unlink from all parents? The pairing code changes; scan the new QR code to link again.',
      rename: 'Rename', runner: '🦊 Fox-fire Run (try it)', act_game: 'Fly!', admin: 'Admin mode (FF stat locks)', reset: 'Start over (removes your pet)', close: 'Close', language: 'Language / 語言',
      renamePrompt: 'New name', resetConfirm: 'Start over? Your fox will be gone.',
      hello: 'Hi! I\'m {name}!', full: 'I\'m so full!', yum: ['Yummy!', 'Nom nom nom…', 'More please!', 'I love it!'],
      tooTired: 'So tired… I want to sleep', tooTiredToPlay: 'Too tired to fly… let me sleep or have a snack', playLines: ['Again!', 'Got you!', 'Hehe!'], cleanDone: 'All clean and fluffy!',
      stillSleepy: 'Still sleepy…', morning: 'Good morning!', notSleepy: 'Not sleepy! Let\'s play more', goodnight: 'Good night…',
      wokeUp: 'I slept so well! Morning!', dontWake: 'Zzz… let me sleep…', huh: '!?', what: 'Hm? What is it?',
      petLines: ['Hehe!', 'More pets!', 'I like you!'], hungry: 'I\'m hungry…', bored: 'I\'m bored… play with me!',
      sleepy: 'So sleepy…', dirty: 'I feel sticky…', idle: ['What\'s that?', 'Sniff sniff…', 'My tail is so fluffy!', 'What shall we do today?'],
      nineTails: 'Nine tails!!', newTail: 'I grew tail number {n}!', msgWaiting: 'You have a message! Tap me 👂',
      giftFrom: '{from} sent me {e}! Yay!', giftStored: "{from} sent {e} — it's in the pantry!", pantry: 'Pantry', pantryHint: 'Everything Mom & Dad send is kept here: feed it whenever you like', pantryEmpty: "It's empty — wait for Mom & Dad to send something!", feedThis: 'Feed', food_meat: 'Meat', food_veg: 'Veggies', food_water: 'Water', parents: 'Mom & Dad', whisper: '🎤 A message from Mom & Dad',
      awayHours: 'You were gone {n} hours. I missed you!', back: 'You\'re back!',
      learnTitle: 'Learn with Foxy', mode_word: 'Word of the day', mode_quiz: 'Listen & pick', mode_speak: 'Say it',
      wordOfDay: 'Today\'s word', listen: '🔊 Listen again', learned: 'I learned it!', learnedAlready: 'Learned ✓',
      quizAsk: 'Which one did Foxy say?', quizRight: 'Correct! Great job!', quizWrong: 'Try again!', quizNext: 'Next',
      quizScore: '{n} / {m} correct', quizDone: 'All done! Foxy is so happy!',
      speakAsk: 'Say it with Foxy', speakBtn: '🎤 Tap and say it', speakListening: 'Listening…',
      speakGood: 'Great job!', speakTry: 'So close! Try again', speakHeard: 'Foxy heard: "{w}"',
      speakNoMic: 'This browser can\'t listen (iPhone needs https)', speakNoPerm: 'No microphone permission',
      learnReward: 'Learning is fun!', progress: '{n} words learned',
      p_title: 'Foxy for Parents', p_gifts: "Send a treat to your child's fox", p_ad: '▶ Watch ad +10 (demo)', p_buy: 'Buy coins (demo)',
      p_speak: 'Make Foxy talk', p_tab_line: 'a. Phrases', p_tab_tts: 'b. Type it', p_tab_voice: 'c. Voice changer',
      p_speakLang: 'Foxy speaks:', p_ttsPh: 'What should Foxy say? (max 40 characters)', p_rec: '● Tap to record (max 10 s)',
      p_recAgain: '● Record again', p_recLive: '■ Recording… tap to stop', p_recHint: 'Preview the fox voice after recording',
      p_recDone: 'Recorded ({kb} KB). Tap Preview to hear Foxy', p_noRec: "This browser can't record (iPhone needs https; test on localhost)",
      p_noMic: 'No microphone permission', p_now: 'Say it now', p_at: 'At', p_daily: 'Every day', p_preview: '🔊 Preview', p_send: 'Send',
      p_scheduled: 'Scheduled', p_empty: 'Nothing scheduled yet', p_offline: "Can't reach the server", p_delete: 'Delete', p_everyday: 'daily',
      p_voiceMsg: 'Voice message', p_needText: 'Type something first', p_needRec: 'Record something first', p_needTime: 'Pick a time',
      p_sentNow: 'Foxy will say it right away!', p_sentLater: 'Scheduled', p_fail: "Couldn't send. Is the server running?",
      p_giftSent: 'Sent {e}', p_adDone: '(demo) Ad watched: +10 coins', p_buyNote: '(demo) The real app uses Apple in-app purchase',
      p_engineNeural: 'Voice: {p}', p_engineDevice: 'Voice: device built-in (robotic). Add a cloud TTS key for a natural voice',
      p_foot: 'Prototype: child app at / , parent app at /parent.html, same pairing code on both. Coins, ads and purchases are mock-ups.',
      g_apple: 'Apple', g_rice: 'Rice ball', g_fish: 'Fish', g_cake: 'Cake', g_meat: 'Meat', g_veg: 'Veggies', g_water: 'Water', p_needCode: "Pair first: in your child's Foxy open ⚙︎ Settings and scan the QR code (or type the code)", p_paired: "Paired with your child's Foxy: {code}", p_kids: 'Children', p_kidN: 'Child {n}', p_kidCode: 'Pairing code', p_kidName: 'Name', p_addKid: '+ Add a child', p_removeKid: 'Remove', p_flyTogether: '🦊 Challenge',
      p_online: 'online', p_away: 'not open', p_challengeWait: 'Waiting for {name}… (their Foxy must be open)', p_challenged: '{name} challenges you to fly!', p_accept: 'Accept', p_later: 'Later',
      p_noAnswer: 'No answer from {name} (their Foxy must be open)', p_declined: '{name} can’t right now', p_unbindAsk: 'Unlink {name}?', p_unbound: '{name} unlinked', p_taken: 'Another parent accepted first', p_cancel: 'Cancel', p_myName: 'Your name (shown when flying together)', inviteFly: '{from} wants to fly with you!', inviteGo: "Let's fly", inviteLater: 'Later',
      p_enOnly: 'Foxy only speaks English for now', p_localModel: 'built-in Kokoro',
    },
  };

  let lang = null;
  try { lang = localStorage.getItem('ipet-lang'); } catch (e) {}
  if (lang !== 'zh' && lang !== 'en') lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  function t(key, vars) {
    let v = (DICT[lang] && DICT[lang][key]) ?? DICT.zh[key] ?? key;
    if (typeof v === 'string' && vars) v = v.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
    return v;
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  }

  function set(l) {
    lang = l === 'en' ? 'en' : 'zh';
    try { localStorage.setItem('ipet-lang', lang); } catch (e) {}
    apply();
  }

  return { t, apply, set, get lang() { return lang; } };
})();
const t = I18N.t;

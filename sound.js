/* Sound for the pet and its games: one Web Audio context, music and sound effects at matched loudness.

   Loudness (BS.1770, as TIVOT does it): every music file brought to MIX.music LUFS by its own gain (MUSIC, measured
   with ffmpeg's ebur128); the sound effects (fling.js's synth blips, ~-32 LUFS as they're made) through one bus, raised
   to about 10% over the music (MIX.sfx). All of it through a limiter, so stacked sounds don't clip.

   iPhone: an <audio> element's volume can't be set there (it reads back but plays at full — TIVOT's audio.js, ver
   -2017), which is why the music drowned everything. There the element goes into the Web Audio context
   (createMediaElementSource → a gain node), its volume set on the node; elsewhere the element's own volume, as it was.
   Only where iOS has navigator.audioSession (16.4+): set to 'playback', so the mute switch doesn't silence it.
*/
(() => {
  const MIX = { music: -22, sfx: -21.2 }; // LUFS: the music, and the effects ~10% (0.8 dB) over it
  const MUSIC = { // each file's integrated loudness (LUFS), measured
    'PerituneMaterial_Battle_Fun_loop.m4a': -6.5,
    'PerituneMaterial_Laid_Back3_loop.m4a': -8.0,
    'Peritune_Magic_Skirmish_loop.m4a': -7.7,
  };
  const BLIPS = -32.5; // fling.js's blips as made (a boing, a thud: momentary max)
  const db = d => Math.pow(10, d / 20);

  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const WIRED = IS_IOS ? 'audioSession' in navigator
    : (() => { try { const a = new Audio(); a.volume = 0.5; return Math.abs(a.volume - 0.5) > 0.01; } catch (e) { return false; } })();
  if (WIRED && navigator.audioSession) try { navigator.audioSession.type = 'playback'; } catch (e) {}

  let ac = null, out = null, sfx = null;
  function ctx() { // made on the first touch (browsers want one), woken on every one after
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      out = ac.createDynamicsCompressor(); // (a limiter: clear under -6 dB)
      out.threshold.value = -6; out.knee.value = 3; out.ratio.value = 12; out.attack.value = 0.003; out.release.value = 0.15;
      out.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = db(MIX.sfx - BLIPS); sfx.connect(out);
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  // one piece at a time: playing one stops any other (the pet's and the game's both going at once — a touch that
  // started the pet's as the game opened — was the music skipping on a phone)
  const pieces = [];
  function music(src) { // a looping piece: { play(), pause() }, as loud as the rest
    const el = Object.assign(new Audio(src), { loop: true });
    const file = src.split('/').pop().split('?')[0], gain = Math.min(1, db(MIX.music - (MUSIC[file] ?? MIX.music)));
    let node = null;
    if (!WIRED) el.volume = gain;
    const piece = {
      el,
      get paused() { return el.paused; },
      play() {
        for (const p of pieces) if (p !== piece && !p.el.paused) p.el.pause();
        if (WIRED && !node) { const c = ctx(); if (c) try { node = c.createGain(); node.gain.value = gain; c.createMediaElementSource(el).connect(node); node.connect(out); } catch (e) { node = null; } }
        else ctx();
        return el.play();
      },
      pause() { el.pause(); },
    };
    pieces.push(piece);
    return piece;
  }

  window.Sound = { ctx, music, get sfx() { ctx(); return sfx; } };
})();

/* The mini game's music: classical pieces (all long out of copyright) as their melodies, note by note — a note is
   [MIDI pitch, length in eighths] — and a small piano made with the browser's own sound (no sound files): a few
   sine / triangle partials with a quick attack and a long fade, brighter at first, the way a piano string rings.
   window.Music: PIECES, play(midi, when), unlock() (on a tap: the browser lets sound start only then). */
(function () {
  const PIECES = [
    { name: '給愛麗絲（貝多芬）', eighth: 0.26, notes: [
      [76, 1], [75, 1], [76, 1], [75, 1], [76, 1], [71, 1], [74, 1], [72, 1], [69, 3],
      [60, 1], [64, 1], [69, 1], [71, 3], [64, 1], [68, 1], [71, 1], [72, 3],
      [64, 1], [76, 1], [75, 1], [76, 1], [75, 1], [76, 1], [71, 1], [74, 1], [72, 1], [69, 3],
      [60, 1], [64, 1], [69, 1], [71, 3], [64, 1], [72, 1], [71, 1], [69, 4]] },
    { name: '歡樂頌（貝多芬）', eighth: 0.24, notes: [
      [76, 2], [76, 2], [77, 2], [79, 2], [79, 2], [77, 2], [76, 2], [74, 2], [72, 2], [72, 2], [74, 2], [76, 2], [76, 3], [74, 1], [74, 4],
      [76, 2], [76, 2], [77, 2], [79, 2], [79, 2], [77, 2], [76, 2], [74, 2], [72, 2], [72, 2], [74, 2], [76, 2], [74, 3], [72, 1], [72, 4]] },
    { name: '小星星（莫札特變奏曲的主題）', eighth: 0.24, notes: [
      [72, 2], [72, 2], [79, 2], [79, 2], [81, 2], [81, 2], [79, 4], [77, 2], [77, 2], [76, 2], [76, 2], [74, 2], [74, 2], [72, 4],
      [79, 2], [79, 2], [77, 2], [77, 2], [76, 2], [76, 2], [74, 4], [79, 2], [79, 2], [77, 2], [77, 2], [76, 2], [76, 2], [74, 4],
      [72, 2], [72, 2], [79, 2], [79, 2], [81, 2], [81, 2], [79, 4], [77, 2], [77, 2], [76, 2], [76, 2], [74, 2], [74, 2], [72, 4]] },
  ];

  let ac = null, out = null;
  function unlock() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createDynamicsCompressor(); // several notes ringing together don't clip
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function play(midi, gain = 0.5) {
    if (!ac) return;
    const t = ac.currentTime, f = 440 * 2 ** ((midi - 69) / 12);
    const env = ac.createGain(), tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.min(9000, f * 9), t);       // bright as it's struck …
    tone.frequency.exponentialRampToValueAtTime(Math.max(600, f * 2), t + 1.2); // … mellower as it rings
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    tone.connect(env).connect(out);
    for (const [mul, type, amp, cents] of [[1, 'triangle', 0.6, 0], [1, 'sine', 0.5, 4], [2, 'sine', 0.25, -3], [3, 'sine', 0.1, 2], [4, 'sine', 0.05, 0]]) {
      const o = ac.createOscillator(), a = ac.createGain();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = cents;
      a.gain.value = amp;
      o.connect(a).connect(tone);
      o.start(t);
      o.stop(t + 2.3);
    }
  }
  window.Music = { PIECES, play, unlock };
})();

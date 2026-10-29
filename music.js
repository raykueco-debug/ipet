/* The mini game's music: classical pieces (all long out of copyright) in two parts — the lead, the notes the
   fox picks up (each sounds only when it is picked up), and the accompaniment, played all the way through — and a
   small piano made with the browser's own sound (no sound files): a few partials, a quick attack and a long fade,
   brighter at first, the way a piano string rings.

   A part is written as tokens "pitch:length" (length in sixteenths; "C4+E4+G4:8" a chord, "-:4" a rest, "|" only
   for reading); bar: its sixteenths. In the lead, "^" before a note makes it one to jump for; runs of quick notes (sixteenths, three or
   more) become a roll to tap through.
   window.Music: SONGS, parse(text) → [{ t (16ths), len, midi[] , jump }], unlock(), now(), play(midi, gain, when). */
(function () {
  const SONGS = [
    { name: '給愛麗絲（貝多芬）', sixteenth: 0.17, times: 3, bar: 6,
      lead: 'E5:1 D#5:1 | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:6 | B4:6 | ^C5:4 E5:1 D#5:1 | E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 | A4:6 | B4:6 | ^A4:6',
      back: '-:2 | -:6 | A2:1 E3:1 A3:1 C4:1 E4:1 A4:1 | E2:1 E3:1 G#3:1 E4:1 G#4:1 B4:1 | A2:1 E3:1 A3:1 E4:1 -:2 | -:6 | A2:1 E3:1 A3:1 C4:1 E4:1 A4:1 | E2:1 E3:1 G#3:1 E4:1 C5:1 B4:1 | A2:1 E3:1 A3:1 -:3' },
    { name: '歡樂頌（貝多芬）', sixteenth: 0.13, times: 2, bar: 16,
      lead: 'E5:4 E5:4 F5:4 ^G5:4 | G5:4 F5:4 E5:4 D5:4 | C5:4 C5:4 D5:4 E5:4 | E5:6 D5:2 D5:8 | E5:4 E5:4 F5:4 ^G5:4 | G5:4 F5:4 E5:4 D5:4 | C5:4 C5:4 D5:4 E5:4 | D5:6 C5:2 ^C5:8',
      back: 'C3:4 G3:4 E3:4 G3:4 | G2:4 G3:4 B2:4 G3:4 | C3:4 G3:4 E3:4 G3:4 | G2:4 D3:4 B2:4 D3:4 | C3:4 G3:4 E3:4 G3:4 | G2:4 G3:4 B2:4 G3:4 | C3:4 G3:4 E3:4 G3:4 | G2:4 B2:4 C3+E3+G3:8' },
    { name: '小星星（莫札特變奏曲的主題）', sixteenth: 0.12, times: 2, bar: 16,
      lead: 'C5:4 C5:4 G5:4 G5:4 ^A5:4 A5:4 G5:8 | F5:4 F5:4 E5:4 E5:4 D5:4 D5:4 C5:8 | G5:4 G5:4 F5:4 F5:4 E5:4 E5:4 D5:8 | G5:4 G5:4 F5:4 F5:4 E5:4 E5:4 D5:8 | C5:4 C5:4 G5:4 G5:4 ^A5:4 A5:4 G5:8 | F5:4 F5:4 E5:4 E5:4 D5:4 D5:4 ^C5:8',
      back: 'C3+G3:8 C3+E3:8 | F3+A3:8 C3+G3:8 | F3+A3:8 C3+G3:8 | G2+F3:8 C3+E3:8 | C3+G3:8 F3+A3:8 | C3+G3:8 G2+B2:8 | C3+G3:8 F3+A3:8 | C3+G3:8 G2+B2:8 | C3+G3:8 C3+E3:8 | F3+A3:8 C3+G3:8 | F3+A3:8 C3+G3:8 | G2+F3:8 C3+E3:8' },
  ];
  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = p => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(p); return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  function parse(text) {
    if (Array.isArray(text)) { // already notes (from a MIDI file)
      const notes = text.map(([t, len, midi, jump]) => ({ t, len, midi: [midi], jump: !!jump }));
      return { notes, length: Math.max(...notes.map(n => n.t + n.len)) };
    }
    const out = [];
    let t = 0;
    for (const tok of text.split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [p, l] = tok.split(':'), len = +l, jump = p.startsWith('^');
      if (p !== '-') out.push({ t, len, midi: p.replace('^', '').split('+').map(midiOf), jump });
      t += len;
    }
    return { notes: out, length: t };
  }

  let ac = null, out = null;
  function unlock() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createDynamicsCompressor(); // several notes ringing together don't clip
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  const now = () => (ac ? ac.currentTime : performance.now() / 1000);
  function play(midi, gain = 0.5, when = 0) {
    if (!ac) return;
    const t = Math.max(ac.currentTime, when), f = 440 * 2 ** ((midi - 69) / 12);
    const env = ac.createGain(), tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.min(9000, f * 9), t);                     // bright as it's struck …
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
  window.Music = { SONGS, parse, unlock, now, play };
})();

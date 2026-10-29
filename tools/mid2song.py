"""MIDI → a music.js song (usage: python tools/mid2song.py <file.mid> > song.json; paste its lead / back into
music.js SONGS): track 1 the lead (each note's length = the gap to the next onset), tracks 2.. the
accompaniment (track 3 an octave down). Times in sixteenths. Prints JS."""
import struct, sys, json
data = open(sys.argv[1], 'rb').read()
def vlq(b, i):
    v = 0
    while True:
        c = b[i]; i += 1; v = (v << 7) | (c & 0x7f)
        if not c & 0x80: return v, i
fmt, ntr, div = struct.unpack('>HHH', data[8:14])
i = 14; tracks = []; tempo = 500000
for tr in range(ntr):
    ln = struct.unpack('>I', data[i+4:i+8])[0]; b = data[i+8:i+8+ln]; i += 8 + ln
    t = 0; j = 0; run = 0; on = {}; notes = []
    while j < len(b):
        d, j = vlq(b, j); t += d; st = b[j]
        if st == 0xff:
            ty = b[j+1]; l, j2 = vlq(b, j+2)
            if ty == 0x51 and tr == 0 and t == 0: tempo = int.from_bytes(b[j2:j2+l], 'big')
            j = j2 + l; continue
        if st in (0xf0, 0xf7): l, j2 = vlq(b, j+1); j = j2 + l; continue
        if st & 0x80: run = st; j += 1
        k = run & 0xf0
        if k in (0xc0, 0xd0): j += 1; continue
        a1, a2 = b[j], b[j+1]; j += 2
        if k == 0x90 and a2 > 0: on[a1] = t
        elif k in (0x80, 0x90) and a1 in on: s = on.pop(a1); notes.append((s, a1, t - s))
    tracks.append(sorted(notes))
q = div / 4
lead = tracks[1]
L = []
for k, (s, p, l) in enumerate(lead):
    nxt = lead[k + 1][0] if k + 1 < len(lead) else s + l
    gap = max(0.5, (nxt - s) / q)
    L.append([round(s / q, 2), round(gap, 2), p, 1 if p >= 90 and gap >= 2 else 0])  # F#6 and up, held: jump
B = []
for ti, tr in enumerate(tracks[2:], 2):
    for s, p, l in tr: B.append([round(s / q, 2), round(l / q, 2), p - 12 if ti == 3 else p])
B.sort()
end = max(s + l for s, l, p, *_ in L) if L else 0
print(json.dumps({'sixteenth': round(tempo / 1e6 / 4, 4), 'lead': L, 'back': B}, separators=(',', ':')))

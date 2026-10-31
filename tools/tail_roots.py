"""Where the fox's tail grows from, frame by frame, in the clips the fling game plays — so it can fan out the
fox's extra tails there (its own one is in the picture already).

usage: python tools/tail_roots.py      → assets/fox/tail_roots.json

Each clip's root is picked by hand on its first frame (ROOTS: x, y in the 480px frame, and the way its own tail
points, degrees from straight up, + clockwise), then followed through the clip with tools/track_anchor.py's
optical-flow tracker (the slow clips), or — the run, too quick for that — found again in every frame by matching
the patch of fur round it on the first (MATCH), its tail's way taken from where the tail lies behind it; frames it
matches poorly (a leap, the body turned) are filled in between their neighbours.
Output: { "<dir>/<clip>": [[x, y, angle, visible], …per frame] } — angle the tail's way on that frame.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from track_anchor import track_slot  # noqa: E402

FOX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox')
# (dir, clip): x, y, the tail's way on the first frame
ROOTS = {
    ('clips', 'walk_r_loop_run'): (187, 285, -70),
    ('clips', 'walk_r_to_pounce_r'): (202, 285, -70),
    ('clips', 'jump_joy_loop'): (270, 270, 30),
    ('clips', 'surprised_loop'): (270, 360, 60),
    ('clips', 'cheer_loop'): (292, 345, 40),
    ('clips', 'happy_loop'): (300, 345, 40),
    ('clips', 'back_crouch_to_back_air'): (225, 345, 50),
    ('clips', 'back_air_to_back_crouch'): (210, 285, 30),
    ('clips_halloween', 'cheer_loop'): (292, 345, 40),
    ('clips_halloween', 'happy_loop'): (300, 345, 40),
    ('clips_halloween', 'back_crouch_to_back_air'): (225, 345, 50),
    ('clips_halloween', 'back_air_to_back_crouch'): (210, 285, 30),
}
MATCH = {('clips', 'walk_r_loop_run')}
# single pictures (the caped fox side on, assets/fox/halloween): no tracking, just where
STILLS = {'halloween/air': (184, 224, -108), 'halloween/dive': (225, 255, -80), 'halloween/crouch': (172, 285, -75)}


def main():
    out = {}
    for (d, clip), (x, y, a) in ROOTS.items():
        path = os.path.join(FOX, d, clip)
        if not os.path.exists(os.path.join(path, 'meta.json')):
            continue
        meta = json.load(open(os.path.join(path, 'meta.json'), encoding='utf-8'))
        if (d, clip) in MATCH:
            out[f'{d}/{clip}'] = matched(path, meta['frames'], x, y)
        else:  # (the tracker's own 'lost' is too strict for these: its points are good enough where it still has three)
            out[f'{d}/{clip}'] = [[r[0], r[1], round(a + r[2], 1), True] for r in track_slot(load_frames_named(path, meta['frames']), x, y)]
        print(f'{d}/{clip}: {len(out[f"{d}/{clip}"])} frames')
    for k, (x, y, a) in STILLS.items():
        out[k] = [[x, y, a, True]]
    json.dump(out, open(os.path.join(FOX, 'tail_roots.json'), 'w', encoding='utf-8'))


def matched(path, names, x, y, r=34, poor=0.55):
    import math
    import cv2
    import numpy as np
    ims = []
    for n in names:
        im = cv2.imread(os.path.join(path, n), cv2.IMREAD_UNCHANGED)
        a = im[:, :, 3:4] / 255.0
        ims.append(((im[:, :, :3] * a + 128 * (1 - a)).astype(np.uint8), im[:, :, 3]))
    tpl = ims[0][0][y - r:y + r, x - r:x + r]
    rows = []
    for im, al in ims:
        sc = cv2.matchTemplate(im, tpl, cv2.TM_CCOEFF_NORMED)
        _, best, _, loc = cv2.minMaxLoc(sc)
        rx, ry = loc[0] + r, loc[1] + r
        ys, xs = np.where(al[:ry + 40, :max(1, rx - 25)] > 128)  # (the tail: behind the root, above the legs)
        ang = math.degrees(math.atan2(xs.mean() - rx, -(ys.mean() - ry))) if len(xs) else -80
        rows.append([rx, ry, ang, best])
    good = [i for i, rw in enumerate(rows) if rw[3] >= poor]
    for i, rw in enumerate(rows):
        if rw[3] >= poor:
            continue
        lo = max((g for g in good if g < i), default=None); hi = min((g for g in good if g > i), default=None)
        lo = lo if lo is not None else hi; hi = hi if hi is not None else lo
        t = 0 if hi == lo else (i - lo) / (hi - lo)
        rw[:3] = [rows[lo][k] + (rows[hi][k] - rows[lo][k]) * t for k in range(3)]
    return [[round(rw[0], 1), round(rw[1], 1), round(rw[2], 1), True] for rw in rows]


def load_frames_named(path, names):  # (the clip's own frames, in its own order — not every file in the folder)
    import cv2
    import numpy as np
    frames = []
    for n in names:
        im = cv2.imread(os.path.join(path, n), cv2.IMREAD_UNCHANGED)
        if im.shape[2] == 4:
            a = im[:, :, 3:4] / 255.0
            im = (im[:, :, :3] * a + 128 * (1 - a)).astype(np.uint8)
        frames.append(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return frames


if __name__ == '__main__':
    main()

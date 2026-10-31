"""GPT's tail-less nine-grid (N01…) back onto the 512px canvas of the pictures it was drawn from: each cell scaled and
placed where its fox lies best over the original's — as much of it on the original fox as can be, as little off it
(the tail gone, the rest is the same fox; its top or its bottom may have been the tail's, so no single point will do).
→ assets/fox/wan_in/notail/<pose>.png, by assets/source/notail/grids.json.

usage: python tools/notail_align.py N01 [N02 …]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, IN = os.path.join(IPET, 'assets', 'source', 'notail'), os.path.join(IPET, 'assets', 'fox', 'wan_in')


def mask(img):
    a = np.asarray(img).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ~((g > 150) & (g > r + 60) & (g > b + 60))


def feat(m):
    ys, xs = np.where(m); t, bm = ys.min(), ys.max()
    tx = np.where(m[t:t + int((bm - t) * 0.22)].any(0))[0]
    return t, bm, (tx.min() + tx.max()) / 2


def fit(orig, q, s=4):
    """The scale and place (on the 512 canvas) best laying q's fox over the original's: fox on fox +1, fox on its
    background -2 — at a quarter size, then the scale's place refined at full size."""
    import cv2
    ys, xs = np.where(mask(q)); box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    qc = q.crop(box)
    O = np.where(orig, 1.0, -2.0).astype(np.float32)
    best = None
    t0, b0, _ = feat(orig)
    k0 = (b0 - t0) / qc.size[1]
    for k in np.arange(k0 * 0.8, k0 * 1.25, k0 * 0.01):
        w, h = round(qc.size[0] * k / s), round(qc.size[1] * k / s)
        if w < 4 or h < 4 or w >= 512 // s or h >= 512 // s:
            continue
        T = mask(qc.resize((w, h), Image.NEAREST)).astype(np.float32)
        Os = cv2.resize(O, (512 // s, 512 // s), interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(Os, T, cv2.TM_CCORR)
        _, v, _, loc = cv2.minMaxLoc(r)
        if best is None or v > best[0]:
            best = (v, k, loc)
    _, k, (lx, ly) = best
    T = mask(qc.resize((round(qc.size[0] * k), round(qc.size[1] * k)), Image.NEAREST)).astype(np.float32)
    x0, y0 = lx * s, ly * s
    r = cv2.matchTemplate(O, T, cv2.TM_CCORR)
    lo = (max(0, y0 - 8), max(0, x0 - 8)); win = r[lo[0]:y0 + 9, lo[1]:x0 + 9]
    dy, dx = np.unravel_index(np.argmax(win), win.shape)
    x, y = lo[1] + dx, lo[0] + dy
    return k, round(x - box[0] * k), round(y - box[1] * k)


# pictures that are just another one flipped (wan_prep.py): their tail-less one flipped too
MIRRORS = {'bat_r': 'bat', 'header_r': 'header', 'pounce_r': 'pounce', 'swipe_r': 'swipe', 'walk_r': 'walk', 'leap_r': 'leap'}


def main():
    grids = json.load(open(os.path.join(SRC, 'grids.json')))
    os.makedirs(os.path.join(IN, 'notail'), exist_ok=True)
    for g in sys.argv[1:]:
        names = grids[int(g[1:]) - 1]
        src = Image.open(os.path.join(SRC, f'{g}_notail.png')).convert('RGB'); W, H = src.size
        for i, n in enumerate(names):
            q = src.crop(((i % 3) * W // 3, (i // 3) * H // 3, (i % 3 + 1) * W // 3, (i // 3 + 1) * H // 3))
            k, x, y = fit(mask(Image.open(os.path.join(IN, f'{n}.png')).convert('RGB')), q)
            q2 = q.resize((round(q.size[0] * k), round(q.size[1] * k)), Image.LANCZOS)
            out = Image.new('RGB', (512, 512), (0, 255, 0)); out.paste(q2, (x, y))
            out.save(os.path.join(IN, 'notail', f'{n}.png'))
            print(g, n, round(k, 3))
    for r, n in MIRRORS.items():
        p = os.path.join(IN, 'notail', f'{n}.png')
        if os.path.exists(p):
            Image.open(p).transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(IN, 'notail', f'{r}.png'))


if __name__ == '__main__':
    main()

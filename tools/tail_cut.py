"""The fox's side-on frames with its tail taken off, so the fling game can draw all its tails itself (each one
swaying, as many as it has) — assets/fox/notail/<the frame's own path under assets/fox>.

usage: python tools/tail_cut.py      (after tools/tail_roots.py: where each frame's tail grows, and which way)

Off goes what lies in a cone from the tail's root along its way (past a little stub at the root, which the game's
own tail covers): the orange and white of its fur — not the dark of the legs, nor a cape's black and red — then what's
left of its dark outline there (thin, unlike a leg), and any specks no longer joined to the body.
Only the side-on clips: from the front or behind the tail lies over the body, and there's nothing under it to show.
"""
import json
import math
import os

import cv2
import numpy as np
from PIL import Image

FOX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox')
OUT = os.path.join(FOX, 'notail')
CLIPS = [('clips', 'walk_r_loop_run'), ('clips', 'walk_r_to_pounce_r')]
STILLS = {'halloween/air': 3, 'halloween/dive': 2, 'halloween/crouch': 2}
NEAR = 14  # px: the stub left at the root


def cut(path, root):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    x, y, ang = root[:3]
    d = (math.sin(math.radians(ang)), -math.cos(math.radians(ang)))
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    along = (xx - x) * d[0] + (yy - y) * d[1]
    across = np.abs((xx - x) * d[1] - (yy - y) * d[0])
    r, g = a[..., 0], a[..., 1]
    cone = (along > NEAR) & (across < along * 1.3 + 40)
    fur = (r > 150) & (g > 75)            # (orange and white: not legs, not a cape's red or black)
    dark = (r < 140) & (g < 90)
    a[..., 3] *= 1 - np.clip((along - NEAR) / 10, 0, 1) * (cone & fur)
    dens = cv2.blur((a[..., 3] > 128).astype(np.float32), (15, 15))
    a[..., 3] *= np.where(cone & dark & (dens < 0.45), 0, 1)
    n, lab, st, _ = cv2.connectedComponentsWithStats((a[..., 3] > 40).astype(np.uint8))
    if n > 2:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        a[..., 3] *= (lab == big) | (lab == 0)
    return Image.fromarray(a.round().astype(np.uint8))


def main():
    roots = json.load(open(os.path.join(FOX, 'tail_roots.json'), encoding='utf-8'))
    for d, clip in CLIPS:
        meta = json.load(open(os.path.join(FOX, d, clip, 'meta.json'), encoding='utf-8'))
        os.makedirs(os.path.join(OUT, d, clip), exist_ok=True)
        for i, f in enumerate(meta['frames']):
            cut(os.path.join(FOX, d, clip, f), roots[f'{d}/{clip}'][i]).save(os.path.join(OUT, d, clip, f), quality=90)
        print(f'{d}/{clip}: {len(meta["frames"])}')
    for k, n in STILLS.items():
        os.makedirs(os.path.join(OUT, os.path.dirname(k)), exist_ok=True)
        for i in range(n):
            cut(os.path.join(FOX, f'{k}_{i}.webp'), roots[k][0]).save(os.path.join(OUT, f'{k}_{i}.webp'), quality=90)
        print(k, n)


if __name__ == '__main__':
    main()

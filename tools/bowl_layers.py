"""The front of each food bowl, on its own: assets/fox/food/<name>_front.png, for the layer over the fox.

usage: python tools/bowl_layers.py      (all of assets/fox/food/*.png that aren't fronts already)

The pet shows a bowl in two layers (app.js showBowl): the whole picture under the fox — its back rim, its inside,
the food — and this over it: the bowl's near rim and front wall, so the fox's muzzle goes down into the bowl,
not behind it. The front is what lies below the near arc of the bowl's opening, an ellipse measured off the empty
bowl (OPEN: its centre and radii in px of the 312-wide picture, from the bottom — every picture is the same bowl
cut to its own height, so measured from the bottom it's in the same place).
"""
import glob
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOD = os.path.join(ROOT, 'assets', 'fox', 'food')
OPEN = {'cx': 156, 'cy_up': 158, 'rx': 121, 'ry': 62}  # (centre x; centre's height above the bottom; radii)


def front(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    k = w / 312
    cx, cy, rx, ry = OPEN['cx'] * k, h - OPEN['cy_up'] * k, OPEN['rx'] * k, OPEN['ry'] * k
    xs = np.arange(w)
    u = np.clip((xs - cx) / rx, -1, 1)
    arc = cy + ry * np.sqrt(1 - u * u)  # (the opening's near edge; past its sides, its middle height)
    arc[np.abs(xs - cx) >= rx] = cy
    ys = np.arange(h)[:, None]
    a[..., 3] = np.where(ys > arc[None, :] - 1, a[..., 3], 0)
    out = path[:-4] + '_front.png'
    Image.fromarray(a).save(out, optimize=True)
    return out


if __name__ == '__main__':
    for p in sorted(glob.glob(os.path.join(FOOD, '*.png'))):
        if not p.endswith('_front.png'):
            print(os.path.basename(front(p)))

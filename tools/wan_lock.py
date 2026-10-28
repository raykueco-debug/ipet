"""Lock pose pictures to the home pose by the front legs, so a clip doesn't slide or grow the fox mid-move.

usage: python tools/wan_lock.py curious sad …   → rewrites assets/fox/wan_in/<name>.png (original kept in orig/)

The GPT sprites aren't drawn on one grid: the same sitting fox sits up to ~50 px to the side and ~10 % larger
from one picture to the next, and Wan carries that over as a slide / zoom in the middle of a clip. A sitting
fox's front legs don't move, so they are the lock: the two dark-brown legs just above the paws. Their middle
sets the position, the distance between their outer edges the scale; the picture is scaled about the feet and
moved so both match "normal". Clips made from a picture must be generated again after it is locked.
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

IN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox', 'wan_in')
GREEN = (0, 255, 0)
SCALE = {'look_up': 0.93, 'angry': 1.0, 'paw': 0.92, 'eat': 0.88, 'sorry': 1.0}  # legs not measured well in these: scale from the fox's height instead


def legs(im):
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fox = ~((g > 180) & (r < 120) & (b < 120))
    foot = int(np.nonzero(fox.any(1))[0].max())
    dark = fox & (r < 130) & (g < 85) & (b < 75) & (r > g)
    band = np.zeros_like(dark)
    band[foot - 75:foot - 28] = dark[foot - 75:foot - 28]  # the legs above the paws
    lab, n = ndimage.label(band)
    sizes = ndimage.sum(band, lab, range(1, n + 1))
    xs = [np.nonzero(lab == c)[1] for c in sorted(range(1, n + 1), key=lambda k: -sizes[k - 1])[:2]]
    x0, x1 = min(x.min() for x in xs), max(x.max() for x in xs)
    return (x0 + x1) / 2, x1 - x0, foot


def main(names):
    rx, rw, rfoot = legs(Image.open(os.path.join(IN, 'normal.png')))
    os.makedirs(os.path.join(IN, 'orig'), exist_ok=True)
    for name in names:
        dst, keep = os.path.join(IN, name + '.png'), os.path.join(IN, 'orig', name + '.png')
        if not os.path.exists(keep):
            shutil.copy(dst, keep)
        im = Image.open(keep).convert('RGB')
        x, w, foot = legs(im)
        s = SCALE.get(name, rw / w)
        # key out the green, scale about (legs, feet), put the legs on normal's
        a = np.asarray(im).astype(int)
        alpha = ~((a[..., 1] > 180) & (a[..., 0] < 120) & (a[..., 2] < 120))
        rgba = im.convert('RGBA')
        rgba.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
        big = rgba.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        out = Image.new('RGBA', im.size, GREEN + (255,))
        out.paste(big, (round(rx - x * s), round(rfoot - foot * s)), big)
        out.convert('RGB').save(dst)
        print(f'{name:12s} move {rx - x:+6.1f} px  scale {s:.3f}')


if __name__ == '__main__':
    main(sys.argv[1:])

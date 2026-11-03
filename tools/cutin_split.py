"""Cut a GPT 3×3 sheet of the friends' close-ups (already see-through, from GPT) into the fling game's cut-in pictures.

usage: python tools/cutin_split.py <sheet.png> <out dir> <name1> … <name9> [--grid] [--flip] [--fade]   (a name "-" skips that cell)
       --grid: each friend is what's within its cell (when they touch across the lines); --flip: mirrored; --fade: its back side (the left, where the
       cell cut it off) fading out, so no straight edge shows on the band

The pieces of each friend are found as they are (an ear or a horn may reach over its cell's line): every piece of
the picture goes to the cell its middle is in. The faint halo round them (GPT's, alpha under 60) goes, the inside
is made opaque, and each is cropped to itself.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def main(sheet, out, names, grid=False, flip=False, fade=False):
    a = np.asarray(Image.open(sheet).convert('RGBA')).copy()
    al = a[..., 3].astype(np.float32)
    al[al < 60] = 0
    solid = al > 128
    h, w = solid.shape
    if grid:  # (cut along the lines, each cell's biggest pieces its friend)
        cell = np.zeros(solid.shape, int)
        for c in range(9):
            cell[c // 3 * h // 3:(c // 3 + 1) * h // 3, c % 3 * w // 3:(c % 3 + 1) * w // 3] = c + 1
        lab, n, cells = np.where(solid, cell, 0), 0, {c: [c + 1] for c in range(9)}
    else:
        lab, n = ndimage.label(solid)
        cells = {}
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 200:
            continue
        c = int(ys.mean() * 3 // h) * 3 + int(xs.mean() * 3 // w)
        cells.setdefault(c, []).append(k)
    os.makedirs(out, exist_ok=True)
    for c, name in enumerate(names):
        if name == '-' or c not in cells:
            continue
        mine = ndimage.binary_dilation(np.isin(lab, cells[c]), iterations=3)
        if grid:
            mine &= cell == c + 1
        inside = ndimage.binary_erosion(ndimage.binary_fill_holes(mine & solid), iterations=2)
        aa = np.where(mine, al, 0)
        aa[inside] = 255
        ys, xs = np.nonzero(aa > 0)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        px = a[y0:y1, x0:x1].copy()
        px[..., 3] = aa[y0:y1, x0:x1].astype(np.uint8)
        im = Image.fromarray(px)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if fade:  # (over its left fifth, up to its full alpha)
            q = np.asarray(im).copy()
            ramp = np.clip(np.arange(q.shape[1]) / (q.shape[1] * 0.2), 0, 1) ** 1.5
            q[..., 3] = (q[..., 3] * ramp[None, :]).astype(np.uint8)
            im = Image.fromarray(q)
        im.save(os.path.join(out, f'{name}.png'), optimize=True)
        print(f'{name:10s} {x1 - x0}×{y1 - y0}')


if __name__ == '__main__':
    names = [x for x in sys.argv[3:] if not x.startswith('--')]
    main(sys.argv[1], sys.argv[2], names[:9], grid='--grid' in sys.argv, flip='--flip' in sys.argv, fade='--fade' in sys.argv)

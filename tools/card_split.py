"""Cut a GPT 3×3 sheet of card pictures (see-through, from GPT) into the fling game's cards: assets/cards/<name>.png.

usage: python tools/card_split.py [--halloween] <sheet.png> <name1> … <name9>   (a name "-" skips that cell;
       --halloween: into assets/cards/halloween/, the friends in their costumes)

Each cell's picture (its faint halo, GPT's, gone; its inside opaque) cropped to itself, centred on a square with a
little room round it, 256 px. assets/cards/index.json: the names there (the game asks only for those).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, SIZE, ROOM = os.path.join(ROOT, 'assets', 'cards'), 256, 0.04


def main(sheet, names, out=OUT):
    a = np.asarray(Image.open(sheet).convert('RGBA')).copy()
    h, w = a.shape[:2]
    os.makedirs(out, exist_ok=True)
    for c, name in enumerate(names):
        if name == '-':
            continue
        y0, y1, x0, x1 = c // 3 * h // 3, (c // 3 + 1) * h // 3, c % 3 * w // 3, (c % 3 + 1) * w // 3
        cell = a[y0:y1, x0:x1].copy()
        al = cell[..., 3].astype(np.float32)
        al[al < 60] = 0
        lab, n = ndimage.label(al > 128)
        if not n:
            continue
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep = ndimage.binary_dilation(np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s > sizes.max() * 0.02]), iterations=3)
        al = np.where(keep, al, 0)
        al[ndimage.binary_erosion(ndimage.binary_fill_holes(al > 128), iterations=2)] = 255
        cell[..., 3] = al.astype(np.uint8)
        ys, xs = np.nonzero(al > 0)
        im = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        side = int(max(im.size) * (1 + ROOM * 2))
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
        sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, f'{name}.png'), optimize=True)
        print(name)
    json.dump(sorted(f[:-4] for f in os.listdir(out) if f.endswith('.png')), open(os.path.join(out, 'index.json'), 'w'))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--halloween']
    main(args[0], args[1:10], os.path.join(OUT, 'halloween') if '--halloween' in sys.argv else OUT)

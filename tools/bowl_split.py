"""Cut GPT's sheet of the pet's food bowls (see-through) into assets/fox/food/<name>.png, as app.js shows them.

usage: python tools/bowl_split.py <sheet.png> <cols> <rows> <name1> … (row by row; a name "-" skips that cell)
       e.g. bowls_01.png 3 3 meat_3 meat_2 meat_1 veg_3 veg_2 veg_1 water_3 water_2 water_1

Each cell's bowl (GPT's faint halo gone, its inside opaque) cropped to itself and brought to WIDTH px wide: the
bowl is the same in every cell, so they all come out the same size, the food heaped over its rim making it taller
(app.js stands the picture on its bottom edge, so the bowl doesn't move between them).
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, WIDTH = os.path.join(ROOT, 'assets', 'fox', 'food'), 312


def main(sheet, cols, rows, names):
    a = np.asarray(Image.open(sheet).convert('RGBA')).copy()
    h, w = a.shape[:2]
    for c, name in enumerate(names):
        if name == '-':
            continue
        y0, y1, x0, x1 = c // cols * h // rows, (c // cols + 1) * h // rows, c % cols * w // cols, (c % cols + 1) * w // cols
        cell = a[y0:y1, x0:x1].copy()
        al = cell[..., 3].astype(np.float32)
        al[al < 60] = 0
        lab, n = ndimage.label(al > 128)
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep = ndimage.binary_dilation(np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s > sizes.max() * 0.01]), iterations=2)
        al = np.where(keep, al, 0)
        al[ndimage.binary_erosion(ndimage.binary_fill_holes(al > 128), iterations=2)] = 255
        cell[..., 3] = al.astype(np.uint8)
        ys, xs = np.nonzero(al > 0)
        im = Image.fromarray(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(f'{name:9s} {im.width}×{im.height}')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:])

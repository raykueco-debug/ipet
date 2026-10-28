"""Cut a GPT 3×3 sprite sheet (fox poses on flat pure blue) into sprites like assets/fox/t1/*.png.

usage: python tools/grid_split.py <sheet.png> <out dir> <name1> … <name9> [--ref <cell no.>] [--props]
       a name "-" skips that cell; --props: things, not the fox — each just cropped to itself, no rescale

Blue, because nothing on the fox is blue: the key only takes near-pure blue (blue 90+ above red and green) and
pulls blue spill on the edges back down, and the inside of the outline is made opaque — no half see-through
fur that a later green canvas could show through (that was the green in the first clips). Each sprite goes on
a 512² transparent canvas, centred, feet on y=497 like the t1 sprites, all with one scale: the --ref cell (a
sitting pose, default 2) is made as tall as the sitting fox of assets/fox/t1/normal.png.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE, FOOT = 512, 497


def key(cell, keep_share=0.15, centre=False):  # keep pieces ≥ this share of the biggest; centre: only the piece in the middle
    a = np.asarray(cell.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = b - np.maximum(r, g)
    al = 1 - np.clip((blue - 90) / 80, 0, 1)
    fox = al > 0.5
    lab, n = ndimage.label(fox)
    if n:  # the fox is the biggest piece; specks of noise go
        sizes = ndimage.sum(fox, lab, range(1, n + 1))
        keep = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s >= sizes.max() * keep_share])
        if centre:  # the cell reaches past its line: of the big pieces, the one nearest the middle is the thing
            big = [k + 1 for k, s in enumerate(sizes) if s >= sizes.max() * 0.1]
            cy, cx = (np.array(fox.shape) - 1) / 2
            dist = {k: np.hypot(*(np.array(ndimage.center_of_mass(fox, lab, k)) - (cy, cx))) for k in big}
            keep = lab == min(dist, key=dist.get)
        al = np.where(ndimage.binary_dilation(keep, iterations=2), al, 0)
    inside = ndimage.binary_erosion(ndimage.binary_fill_holes(al > 0.5), iterations=2)
    al[inside] = 1
    b2 = np.minimum(b, np.maximum(r, g))  # blue spill on the soft edge
    out = np.dstack([r, g, b2, al * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out)


def bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox()


def main(args):
    ref, props = 2, '--props' in args
    args = [a for a in args if a != '--props']
    if '--ref' in args:
        i = args.index('--ref'); ref = int(args[i + 1]); args = args[:i] + args[i + 2:]
    sheet, out, names = args[0], args[1], args[2:11]
    im = Image.open(sheet)
    W, H = im.size
    cells = [key(im.crop((c * W // 3, r * H // 3, (c + 1) * W // 3, (r + 1) * H // 3))) for r in range(3) for c in range(3)]
    if props:  # a thing is one piece: only the biggest stays
        m = W // 16  # reach a little past the cell (a tall thing pokes over its line); strays go with keep 0.5
        cells = [key(im.crop((max(0, c * W // 3 - m), max(0, r * H // 3 - m), min(W, (c + 1) * W // 3 + m), min(H, (r + 1) * H // 3 + m))), 0.5, True)
                 for r in range(3) for c in range(3)]
    os.makedirs(out, exist_ok=True)
    if props:
        for name, cell in zip(names, cells):
            if name != '-':
                cell.crop(bbox(cell)).save(os.path.join(out, name + '.png'))
                print(f'{name:12s} {cell.crop(bbox(cell)).size}')
        return
    nb = bbox(Image.open(os.path.join(ROOT, 'assets', 'fox', 't1', 'normal.png')).convert('RGBA'))
    rb = bbox(cells[ref - 1])
    s = (nb[3] - nb[1]) / (rb[3] - rb[1])
    for name, cell in zip(names, cells):
        if name == '-':
            continue
        x0, y0, x1, y1 = bbox(cell)
        fox = cell.crop((x0, y0, x1, y1))
        fox = fox.resize((round(fox.width * s), round(fox.height * s)), Image.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        canvas.alpha_composite(fox, ((SIZE - fox.width) // 2, FOOT - fox.height))
        canvas.save(os.path.join(out, name + '.png'))
        print(f'{name:12s} {fox.size}')
    print('scale', round(s, 3), '→', out)


if __name__ == '__main__':
    main(sys.argv[1:])

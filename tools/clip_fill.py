"""Close the see-through spots the green key punches into the fox (eyes, white fur, tail seam).

usage: python tools/clip_fill.py [clip …]    → rewrites the frames of assets/fox/clips/<clip> (default: all)

Wan tints light fur and eye whites a little green, so the key in tivot_wan.py lets the background through
there. Inside the silhouette (its outline filled in, minus a 3 px rim so the soft outer edge stays soft) a
pixel that still has some colour but lost its alpha is put back: opaque, its colour painted in from the fur
around it (what is left of it is the key's dull, green-cut colour). Real gaps — between the legs, under the
tail — were keyed to near-black and stay transparent, unless they are small: a small enclosed hole is a
speck the key took, and in a dark eye its sparkle (put back light). Run it on the frames as generated.
"""
import glob
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox', 'clips')


SMALL = 80               # px: an enclosed hole this small is never a real gap (eye sparkles, specks)
GLINT = (255, 244, 214)  # a small hole in a dark eye was its sparkle (yellow-green, so the key took it)


def fill(path):
    a = np.asarray(Image.open(path).convert('RGBA')).copy()
    solid = a[..., 3] > 128
    filled = ndimage.binary_fill_holes(solid)
    inside = ndimage.binary_erosion(filled, iterations=3)
    bad = inside & (a[..., 3] < 250) & (a[..., :3].max(-1) > 60)
    # small enclosed holes, whatever is left of their colour
    glint = np.zeros_like(bad)
    lab, n = ndimage.label(filled & ~solid)
    for k in range(1, n + 1):
        hole = lab == k
        if hole.sum() > SMALL:
            continue
        ring = ndimage.binary_dilation(hole, iterations=2) & ~hole & solid
        if ring.any() and a[ring][:, :3].mean() < 110:
            glint |= hole
        else:
            bad |= hole
    if bad.any():
        a[..., :3] = cv2.inpaint(np.ascontiguousarray(a[..., :3]), bad.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
    a[glint, :3] = GLINT
    fixed = bad | glint
    if fixed.any():
        a[fixed, 3] = 255
        Image.fromarray(a).save(path, 'WEBP', quality=82)
    return int(fixed.sum())


def main(names):
    for meta in sorted(glob.glob(os.path.join(ROOT, '*', 'meta.json'))):
        clip = os.path.dirname(meta)
        if names and os.path.basename(clip) not in names:
            continue
        m = json.load(open(meta, encoding='utf-8'))
        n = sum(fill(os.path.join(clip, f)) for f in m['frames'])
        if n:  # new pictures: a new revision, so browsers fetch them again instead of a cached copy
            m['rev'] = int(time.time())
            json.dump(m, open(meta, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{os.path.basename(clip):24s} {n} px')


if __name__ == '__main__':
    main(sys.argv[1:])

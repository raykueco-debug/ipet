"""How fast a side-on walk loop really walks: its planted feet drift back across the picture as it steps on the
spot; the fox's own pace is that drift, so the player moves it just so far and its feet never slide.

usage: python tools/clip_stride.py            → writes "speed" (px of the 480 picture a frame) into the meta.json of
                                                the walk[_r]_loop* clips (not the push: it doesn't go)
       python tools/clip_stride.py --mirror   → first makes the walk_r loops the walk ones mirrored (the walk_r picture
                                                is the walk one mirrored, so they chain the same), then measures

The feet: the dark-brown paws within a few px of the ground. Frame to frame each is matched to the nearest in the
next frame; the median of their moves is the drift (big jumps — a foot lifting, a new one landing — left out). The
speed is the mean of the drift over the frames where it steps (a bound in the air counts at the pace of its
landings).
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

CLIPS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox', 'clips')
LOOPS = ['walk_loop', 'walk_loop_happy', 'walk_loop_up', 'walk_loop_run']


def feet(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    fox = al > 128
    ys = np.nonzero(fox.any(1))[0]
    if not len(ys):
        return []
    dark = fox & (r < 130) & (g < 85) & (b < 75) & (r > g)
    dark[:ys.max() - 14] = False
    lab, n = ndimage.label(dark)
    return [ndimage.center_of_mass(dark, lab, k + 1)[1] for k in range(n) if ndimage.sum(dark, lab, k + 1) > 30]


def measure(clip):
    meta_path = os.path.join(CLIPS, clip, 'meta.json')
    meta = json.load(open(meta_path, encoding='utf-8'))
    F = [feet(os.path.join(CLIPS, clip, f)) for f in meta['frames']]
    drift = []
    for a, b in zip(F, F[1:]):
        d = [min(b, key=lambda x: abs(x - p)) - p for p in a] if a and b else []
        d = [x for x in d if abs(x) < 25]
        drift.append(float(np.median(d)) if d else 0.0)
    stepping = [abs(x) for x in drift if abs(x) > 1]
    meta['speed'] = round(float(np.mean(stepping)), 2) if len(stepping) >= 3 else 0
    json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{clip:20s} speed {meta["speed"]} px a frame')


def mirror(src, dst):
    s, d = os.path.join(CLIPS, src), os.path.join(CLIPS, dst)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    meta = json.load(open(os.path.join(s, 'meta.json'), encoding='utf-8'))
    for f in meta['frames']:
        Image.open(os.path.join(s, f)).transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(d, f), lossless=False, quality=90)
    meta['name'] = dst
    meta['mirrored_from'] = src
    meta['rev'] = meta.get('rev', 0) + 1
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{src} → {dst} (mirrored)')


def main(args):
    if '--mirror' in args:
        for c in LOOPS:
            mirror(c, c.replace('walk_', 'walk_r_', 1))
    for c in LOOPS + [c.replace('walk_', 'walk_r_', 1) for c in LOOPS]:
        if os.path.isdir(os.path.join(CLIPS, c)):
            measure(c)


if __name__ == '__main__':
    main(sys.argv[1:])

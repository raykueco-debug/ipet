"""Mark the frames where a loop may be left early, so the 2D fox answers quickly without a jump.

usage: python tools/clip_exits.py            → writes "exits" into assets/fox/clips/*_loop*/meta.json

A loop starts on its anchor picture; the player may leave it after frame k only if frame k looks like that
picture (the next clip starts on it). "Looks like" = differs from frame 0 no more than a normal step between
two neighbouring frames of the same loop, so the cut is as smooth as playing on.
"""
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox', 'clips')


def frame(path):
    a = np.asarray(Image.open(path).convert('RGBA').resize((128, 128)), dtype=np.float32)
    return a[..., :3] * a[..., 3:] / 255  # premultiplied: background counts as black


def main():
    for meta_path in sorted(glob.glob(os.path.join(ROOT, '*_loop*', 'meta.json'))):
        clip = os.path.dirname(meta_path)
        meta = json.load(open(meta_path, encoding='utf-8'))
        F = [frame(os.path.join(clip, f)) for f in meta['frames']]
        step = np.median([np.abs(F[k + 1] - F[k]).mean() for k in range(len(F) - 1)])
        meta['exits'] = [k for k in range(1, len(F) - 1) if np.abs(F[k] - F[0]).mean() <= step]
        json.dump(meta, open(meta_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{os.path.basename(clip):24s} step {step:.2f}  exits {meta["exits"]}')


if __name__ == '__main__':
    main()

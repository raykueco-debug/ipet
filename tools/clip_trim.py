"""Shorten transition clips after Wan: keep fewer frames, chosen so the motion is spread evenly.

usage: python tools/clip_trim.py <clip> … [--n 13]   → rewrites assets/fox/clips/<clip>/ (all 25 kept in
                                                      assets/fox/wan_full/<clip>/, to trim again from)

Wan makes a link between two pictures (sit → stand, turn round, into a move) natural at 25 frames, but slow:
it eases in and out, and lingers at both ends. Shortening it in Wan (fewer frames) makes the motion rushed and
odd; instead the long clip is made and then thinned: the first and last frames stay (they are the anchor
pictures the next clip starts on), and the frames between are picked by how far the fox has moved — equal
steps of motion, so the slow ends lose most frames and the quick middle keeps its own.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox')
CLIPS, FULL = os.path.join(ROOT, 'clips'), os.path.join(ROOT, 'wan_full')


def frame(path):
    a = np.asarray(Image.open(path).convert('RGBA').resize((128, 128)), dtype=np.float32)
    return a[..., :3] * a[..., 3:] / 255


def trim(name, n):
    clip, full = os.path.join(CLIPS, name), os.path.join(FULL, name)
    if not os.path.isdir(full):  # the first time: keep everything Wan made
        shutil.copytree(clip, full)
    meta = json.load(open(os.path.join(full, 'meta.json'), encoding='utf-8'))
    frames = meta['frames']
    if len(frames) <= n:
        print(f'{name:24s} {len(frames)} frames, kept')
        return
    F = [frame(os.path.join(full, f)) for f in frames]
    moved = np.concatenate([[0], np.cumsum([np.abs(F[k + 1] - F[k]).mean() for k in range(len(F) - 1)])])
    keep = sorted({0, len(F) - 1, *(int(np.argmin(np.abs(moved - t))) for t in np.linspace(0, moved[-1], n))})
    for f in os.listdir(clip):
        if f.startswith('frame_'):
            os.remove(os.path.join(clip, f))
    names = []
    for j, k in enumerate(keep):
        dst = f'frame_{j:02d}.webp'
        shutil.copy(os.path.join(full, frames[k]), os.path.join(clip, dst))
        names.append(dst)
    meta['frames'] = names
    meta['trimmed'] = {'from': len(frames), 'kept': keep}
    meta['rev'] = meta.get('rev', 0) + 1  # the player's cache key (?v=)
    json.dump(meta, open(os.path.join(clip, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{name:24s} {len(frames)} → {len(names)}  {keep}')


def main(args):
    n = 13
    if '--n' in args:
        i = args.index('--n'); n = int(args[i + 1]); args = args[:i] + args[i + 2:]
    for name in args:
        trim(name, n)


if __name__ == '__main__':
    main(sys.argv[1:])

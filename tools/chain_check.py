"""Where the pet's clips don't join: each clip a_to_b starts on pose a's picture and ends on b's, a loop a_loop*
starts and ends on a — so every clip ending on a pose should end on the very frame every clip from it starts on.
A clip whose first or last frame is far from its pose's (the pose's own picture, assets/fox/wan_in/<pose>.png, as the
clips are drawn: fitted the same way) is a break in the chain: the fox jumps there.

usage: python tools/chain_check.py [--all] [--save <dir>] [--fix]   (--all: every join, not only the bad ones;
       --save: each bad one side by side, the pose's picture | the clip's frame, into <dir>;
       --fix: where only its colour is off (Wan's drift, heading into a picture), the clip's colour put back — at
       that end all the way to the pose's, less and less towards its other end; the frames as they were kept in
       assets/fox/wan_full/<clip>_colour/)

The difference: of the two frames shrunk to 96 px, the share of the fox's outline (alpha) that isn't shared, and
the mean colour difference where both are fox. Bad: outline off by more than OUTLINE, or colour by more than COLOUR.
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.path.join(ROOT, 'assets', 'fox', 'clips')
OUTLINE, COLOUR, SIZE = 0.12, 22, 96


def frame(clip, last):
    meta = json.load(open(os.path.join(CLIPS, clip, 'meta.json'), encoding='utf-8'))
    return Image.open(os.path.join(CLIPS, clip, meta['frames'][-1 if last else 0])).convert('RGBA')


def small(im):
    return np.asarray(im.resize((SIZE, SIZE), Image.BILINEAR)).astype(np.float32)


def diff(a, b):
    ma, mb = a[..., 3] > 128, b[..., 3] > 128
    union = (ma | mb).sum() or 1
    outline = (ma ^ mb).sum() / union
    both = ma & mb
    colour = np.abs(a[..., :3] - b[..., :3])[both].mean() if both.any() else 255
    return outline, colour


def stats(a, mask):  # (each channel's mean and spread over the fox)
    px = a[..., :3][mask]
    return px.mean(0), px.std(0) + 1e-3


def recolour(clip, ref, side):  # its frames' colours eased to the pose's at <side>'s end (the frame there matched to ref)
    meta = json.load(open(os.path.join(CLIPS, clip, 'meta.json'), encoding='utf-8'))
    fr = meta['frames']
    keep = os.path.join(ROOT, 'assets', 'fox', 'wan_full', clip + '_colour')
    os.makedirs(keep, exist_ok=True)
    end = np.asarray(frame(clip, side == 'end')).astype(np.float32)
    r = np.asarray(ref.resize((end.shape[1], end.shape[0]))).astype(np.float32)
    (m0, s0), (m1, s1) = stats(end, end[..., 3] > 128), stats(r, r[..., 3] > 128)
    gain, off = s1 / s0, m1 - m0 * s1 / s0
    n = len(fr)
    for i, f in enumerate(fr):
        path = os.path.join(CLIPS, clip, f)
        if not os.path.exists(os.path.join(keep, f)):
            Image.open(path).save(os.path.join(keep, f), lossless=True)
        w = (i / (n - 1) if side == 'end' else 1 - i / (n - 1)) if n > 1 else 1
        w = w * w * (3 - 2 * w)  # (eased: hardly at all through the middle of it)
        a = np.asarray(Image.open(os.path.join(keep, f)).convert('RGBA')).astype(np.float32)
        rgb = a[..., :3] * (1 + (gain - 1) * w) + off * w
        a[..., :3] = np.clip(rgb, 0, 255)
        Image.fromarray(a.astype(np.uint8)).save(path, quality=92)
    meta['rev'] = meta.get('rev', 0) + 1
    json.dump(meta, open(os.path.join(CLIPS, clip, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'   recoloured {clip} ({side})')


def ends(name):  # (start pose, end pose) of a clip by its name
    if '_to_' in name:
        a, b = name.split('_to_', 1)
        return a, b
    m = re.match(r'(.+?)_loop', name) or re.match(r'(.+?)_turn$', name)
    if m:
        a = m.group(1)
        return a, (('walk_r' if a == 'walk' else 'walk') if name.endswith('_turn') else a)
    return None


def main(args):
    show_all, fix = '--all' in args, '--fix' in args
    save = args[args.index('--save') + 1] if '--save' in args else None
    if save:
        os.makedirs(save, exist_ok=True)
    names = sorted(n for n in os.listdir(CLIPS) if os.path.exists(os.path.join(CLIPS, n, 'meta.json')))
    joins = {}  # pose → [(clip, 'start'|'end', small frame, frame)]
    for n in names:
        e = ends(n)
        if not e:
            continue
        for pose, last in ((e[0], False), (e[1], True)):
            try:
                im = frame(n, last)
            except Exception as ex:
                print(f'?? {n}: {ex}')
                continue
            joins.setdefault(pose, []).append((n, 'end' if last else 'start', small(im), im))
    bad = 0
    for pose, js in sorted(joins.items()):
        if len(js) < 2:
            continue
        # the pose's own frame: where most of its joins agree (the one closest to all the others)
        score = [sum(sum(diff(a[2], b[2])) for b in js) for a in js]
        ref = js[int(np.argmin(score))]
        for n, side, s, im in js:
            o, c = diff(ref[2], s)
            off = o > OUTLINE or c > COLOUR
            if off or show_all:
                print(f'{"!!" if off else "  "} {pose:22s} {side:5s} of {n:40s} outline {o:.2f} colour {c:5.1f}   (vs {ref[1]} of {ref[0]})')
            if off:
                bad += 1
                if fix and o <= OUTLINE:
                    recolour(n, ref[3], side)
                if save:
                    pair = Image.new('RGBA', (im.width * 2, im.height), (0, 160, 0, 255))
                    pair.alpha_composite(ref[3].resize(im.size), (0, 0)); pair.alpha_composite(im, (im.width, 0))
                    pair.convert('RGB').resize((im.width, im.height // 2)).save(os.path.join(save, f'{pose}__{side}__{n}.jpg'))
    print(f'{bad} bad joins of {sum(len(j) for j in joins.values())}')


if __name__ == '__main__':
    main(sys.argv[1:])

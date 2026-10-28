"""Split a white-background turnaround sheet (front | left side | back, one row) into transparent views.

usage: python tools/split_turnaround.py assets/source/cub_standing_turnaround_v1.png assets/fox3d/views/standing

Writes front.png / left.png / back.png (transparent, one shared scale, feet on one baseline) plus
*_hy.png versions for Hunyuan3D (white background, square, centred) and right_hy.png (mirrored side).
"""
import os
import sys

import cv2
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
NAMES = ['front', 'left', 'back']


def main():
    im = cv2.imread(SRC)
    h, w = im.shape[:2]
    # white-ish background → alpha; flood from the border so white fur inside the outline stays opaque
    bg = (im.min(axis=2) > 235).astype(np.uint8)
    mask = np.zeros((h + 2, w + 2), np.uint8)
    reach = bg.copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if reach[seed[1], seed[0]]:
            cv2.floodFill(reach, mask, seed, 2)
    alpha = np.where(reach == 2, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((3, 3), np.uint8)), (0, 0), 0.8)

    # split by empty columns
    cols = (alpha > 0).sum(0) > 0
    runs, start = [], None
    for x, c in enumerate(cols):
        if c and start is None:
            start = x
        if not c and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, w))
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:3])
    assert len(runs) == 3, f'expected 3 figures, found {len(runs)}'

    rgba = np.dstack([im, alpha])
    rows = np.nonzero((alpha > 0).sum(1))[0]
    top, bot = rows.min(), rows.max() + 1  # shared top/bottom keeps one scale and one foot line
    os.makedirs(OUT, exist_ok=True)
    side = max(max(r[1] - r[0] for r in runs), bot - top)
    for name, (x0, x1) in zip(NAMES, runs):
        crop = rgba[top:bot, x0:x1]
        cv2.imwrite(os.path.join(OUT, name + '.png'), crop)
        # Hunyuan input: square, white, same scale for every view, figure centred, ~85% fill
        S = int(side / 0.85)
        canvas = np.full((S, S, 3), 255, np.uint8)
        ox, oy = (S - crop.shape[1]) // 2, (S - crop.shape[0]) // 2
        a = crop[..., 3:4].astype(np.float32) / 255
        region = canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]]
        canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = (crop[..., :3] * a + region * (1 - a)).astype(np.uint8)
        canvas = cv2.resize(canvas, (1024, 1024), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, name + '_hy.png'), canvas)
        if name == 'left':
            cv2.imwrite(os.path.join(OUT, 'right_hy.png'), canvas[:, ::-1])
    print('views', [(n, r) for n, r in zip(NAMES, runs)], 'rows', (top, bot))


if __name__ == '__main__':
    main()

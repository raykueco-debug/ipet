"""Remove a fake transparency checkerboard that GPT painted into an image.

usage: python tools/dechecker.py <in.png> <out.png>

The checkerboard is low-saturation white / light grey. Starting from the image border,
grow through such pixels only (the fox's dark outline stops the fill), make them
transparent, then soften the 1px fringe so edges don't look jagged.
"""
import sys

import numpy as np
from PIL import Image, ImageFilter


def enclosed_checker(cand, light):
    """Pockets the border fill can't reach (between ears, legs, tails). A pocket is checkerboard
    when it mixes both checker tones in similar amounts; white fur is almost all one tone."""
    h, w = cand.shape
    seen = np.zeros_like(cand)
    out = np.zeros_like(cand)
    ys, xs = np.nonzero(cand)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack, pts = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(pts) < 80:
            continue
        py, px = np.array(pts).T
        grey = (light[py, px] < 236).mean()
        if 0.25 <= grey <= 0.75:
            out[py, px] = True
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    light = rgb.min(axis=2)
    cand = (sat <= 14) & (light >= 200)

    bg = np.zeros_like(cand)
    bg[0, :], bg[-1, :], bg[:, 0], bg[:, -1] = cand[0, :], cand[-1, :], cand[:, 0], cand[:, -1]
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= cand
        if (grown == bg).all():
            break
        bg = grown

    bg |= enclosed_checker(cand & ~bg, light)

    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    # erase the light halo just inside the cut, then feather it
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.open(src).convert("RGBA")
    out.putalpha(alpha)
    out.save(dst)
    print(f"background removed: {bg.mean():.0%}")


if __name__ == "__main__":
    main()

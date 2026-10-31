"""Cut a keyed sheet of horizontal strips (GPT's B01: the fling game's background layers) into one WebP each,
top to bottom, and make each join to itself left-to-right so it can be tiled along the way.

usage: python tools/slice_bands.py <keyed.png> <out dir> <name> [<name> ...]

The strips are the bands of rows that have something in them, split where a run of see-through rows lies between
(the magenta gaps). Each is cut to its own height, then followed by its own mirror image (seamless()), since GPT's "seamless" seldom
quite is.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

EDGE = 3      # columns dropped from each end
GAP = 6       # see-through rows in a row that part two strips


def bands(alpha):
    rows = (alpha > 0.1).mean(1) > 0.02
    out, start, empty = [], None, 0
    for y, full in enumerate(rows):
        if full:
            if start is None:
                start = y
            empty = 0
        elif start is not None:
            empty += 1
            if empty >= GAP:
                out.append((start, y - empty + 1)); start, empty = None, 0
    if start is not None:
        out.append((start, len(rows)))
    return [b for b in out if b[1] - b[0] > 20]


def seamless(a):
    """The strip and then itself mirrored: each end meets its own reflection, so the join is exact wherever GPT's
    ends don't match (a cloud, a tree or a hill cut through at the edge becomes one whole, symmetric, across it).
    EDGE columns are dropped from each end first (GPT's own outermost pixels are often smeared)."""
    a = a[:, EDGE:a.shape[1] - EDGE]
    return np.concatenate([a, a[:, ::-1]], axis=1)


def main():
    src, out, names = sys.argv[1], Path(sys.argv[2]), sys.argv[3:]
    a = np.asarray(Image.open(src).convert("RGBA"))
    found = bands(a[..., 3] / 255)
    print(f"{len(found)} strips: {found}")
    out.mkdir(parents=True, exist_ok=True)
    for (y0, y1), name in zip(found, names):
        print(f"  {name}:")
        t = seamless(a[y0:y1]); Image.fromarray(t).save(out / f"{name}.webp", quality=88, method=6)
        print(f"    {t.shape[1]}x{t.shape[0]}")


if __name__ == "__main__":
    main()

"""Cut a keyed sheet of horizontal strips (GPT's B01: the fling game's background layers) into one PNG each,
top to bottom, and make each join to itself left-to-right so it can be tiled along the way.

usage: python tools/slice_bands.py <keyed.png> <out dir> <name> [<name> ...]

The strips are the bands of rows that have something in them, split where a run of see-through rows lies between
(the magenta gaps). Each is cut to its own height, full width, then its ends cross-faded (SEAM of the width taken off
the right end and blended into the left), since GPT's "seamless" seldom quite is.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SEAM = 0.08   # of the strip's width
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
    """Blend the right end into the left over SEAM of the width, then drop it: the strip's last column now runs on
    into its first."""
    w = a.shape[1]; n = int(w * SEAM)
    head, tail = a[:, :n].astype(np.float32), a[:, w - n:].astype(np.float32)
    k = np.linspace(0, 1, n)[None, :, None]               # 0 at the join: all tail; 1 inside: all head
    a = a[:, :w - n].astype(np.float32)
    a[:, :n] = tail * (1 - k) + head * k
    return a.clip(0, 255).astype(np.uint8)


def main():
    src, out, names = sys.argv[1], Path(sys.argv[2]), sys.argv[3:]
    a = np.asarray(Image.open(src).convert("RGBA"))
    found = bands(a[..., 3] / 255)
    print(f"{len(found)} strips: {found}")
    out.mkdir(parents=True, exist_ok=True)
    for (y0, y1), name in zip(found, names):
        Image.fromarray(seamless(a[y0:y1])).save(out / f"{name}.png")
        print(f"  {name}: {a.shape[1] - int(a.shape[1] * SEAM)}x{y1 - y0}")


if __name__ == "__main__":
    main()

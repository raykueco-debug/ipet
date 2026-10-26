"""Flag sprites that still carry effect marks touching the fox (!, anger mark, ?, leaves...).

usage: python tools/scan_effects.py [assets/fox]

Effect marks use colours the fox never has: saturated yellow, pure red, blue, green.
Prints each sprite with a noticeable cluster of such pixels so it can be sent back to GPT.
"""
import colorsys
import os
import sys

from PIL import Image


def effect_pixels(im):
    im = im.convert("RGBA").resize((128, 128), Image.BOX)
    n = 0
    for r, g, b, a in im.getdata():
        if a < 200:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        h *= 360
        if s < 0.55 or v < 0.45:
            continue
        if 45 <= h <= 170 or 190 <= h <= 260 or (h >= 345 or h <= 5) and s > 0.8:
            n += 1
    return n


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "assets/fox"
    hits = []
    for d, _, files in os.walk(root):
        if os.path.basename(d) in ("cub", "tail") or "anim" in d:
            continue
        for f in sorted(files):
            if f.endswith(".png") and os.path.basename(d) != "fox":
                n = effect_pixels(Image.open(os.path.join(d, f)))
                if n >= 3:
                    hits.append((os.path.relpath(os.path.join(d, f), root), n))
    for p, n in hits:
        print(f"{n:4d}  {p}")
    print(len(hits), "flagged")


if __name__ == "__main__":
    main()

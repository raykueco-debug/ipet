"""Where the tail grows from on each of the pet's start pictures, and which way it goes — found by taking GPT's
tail-less picture (assets/fox/wan_in/notail/<pose>.png) from the one with the tail (wan_in/<pose>.png): what's left
is the tail; its point nearest the fox's middle is the root, and from there to the tail's own middle is its way.
→ assets/fox/tail_pics.json { pose: [x, y, angle] } (x, y in the 480px frames of the clips; angle in degrees from
straight up, + clockwise). tools/tail_roots.py follows these through every clip made from the picture.

usage: python tools/tail_pics.py
"""
import json
import math
import os

import cv2
import numpy as np
from PIL import Image

FOX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fox')
K = 480 / 512  # (pictures 512px, clips' frames 480)


def fox(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ~((g > 150) & (g > r + 60) & (g > b + 60))


def root(pose):
    whole, body = fox(os.path.join(FOX, 'wan_in', f'{pose}.png')), fox(os.path.join(FOX, 'wan_in', 'notail', f'{pose}.png'))
    body = cv2.dilate(body.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)  # (a little round it: not its edge's fur)
    tail = whole & ~body
    n, lab, st, _ = cv2.connectedComponentsWithStats(tail.astype(np.uint8))
    if n < 2:
        return None
    big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    if st[big, cv2.CC_STAT_AREA] < 800:  # (no tail to speak of in it)
        return None
    ty, tx = np.where(lab == big)
    by, bx = np.where(body)
    cx, cy = bx.mean(), by.mean()
    i = np.argmin((tx - cx) ** 2 + (ty - cy) ** 2)  # the tail's point nearest the body's middle
    rx, ry = tx[i], ty[i]
    ang = math.degrees(math.atan2(tx.mean() - rx, -(ty.mean() - ry)))
    return [round(rx * K, 1), round(ry * K, 1), round(ang, 1)]


def main():
    out = {}
    for f in sorted(os.listdir(os.path.join(FOX, 'wan_in', 'notail'))):
        if f.endswith('.png'):
            r = root(f[:-4])
            if r:
                out[f[:-4]] = r
    json.dump(out, open(os.path.join(FOX, 'tail_pics.json'), 'w'), indent=0)
    print(len(out), 'pictures:', out)


if __name__ == '__main__':
    main()

"""The cheering fox's third leg (Wan keeps drawing one standing in the middle while both front legs are up): the left
of its lower body mirrored over the right, from its middle (x 211 of 480) — that side has no extra leg.

usage: python tools/cheer_leg.py <clip folder> …     (rewrites its frames; bumps meta.json's rev)
"""
import glob
import json
import os
import sys
import time

import numpy as np
from PIL import Image

AX, X1, Y0, Y1 = 211, 304, 330, 470  # its middle; the patch's right end, top, bottom


def fix(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    o = a.copy()
    o[Y0:Y1, AX + 1:X1 + 1] = a[Y0:Y1, AX - 1:2 * AX - X1 - 1:-1]
    for k in range(14):  # (its top edge, feathered back into the frame)
        w = k / 14
        o[Y0 + k, AX + 1:X1 + 1] = a[Y0 + k, AX + 1:X1 + 1] * (1 - w) + o[Y0 + k, AX + 1:X1 + 1] * w
    Image.fromarray(o.round().astype(np.uint8)).save(path, quality=90)


for d in sys.argv[1:]:
    for f in sorted(glob.glob(os.path.join(d, 'frame_*.webp'))):
        fix(f)
    m = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
    m['rev'] = int(time.time())
    json.dump(m, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(d)

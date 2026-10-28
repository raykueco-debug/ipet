"""Key the clips again from Wan's raw output, with a key that leaves the fox's own colours alone.

usage: python tools/rekey.py [clip …]    → rewrites assets/fox/clips/<clip>/frame_XX.webp (default: all)

tivot_wan.py's key starts to see through a pixel once its green is 25 above red and blue, and pulls green down
to the red/blue average: Wan's yellow-green eye sparkles and green-lit white fur went see-through, yellows went
olive. Here the key only takes near-pure green (green 70+ above red and blue, gone at 150) and only pulls green
down to the larger of red and blue, so yellows and whites keep their colour. The raw frames are found in
ComfyUI/output/tivotwan by time (the run that finished just before the clip's sheet.jpg was written), and go
through the same steps as in tivot_wan.py (deflicker, frame pick, size). Then tools/clip_fill.py and
tools/clip_exits.py run over the clips again.
"""
import glob
import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

IPET = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.path.join(IPET, 'assets', 'fox', 'clips')
COMFY = os.path.join(os.path.expanduser('~'), 'Desktop', 'ComfyUI-master')
RAW = os.path.join(COMFY, 'output', 'tivotwan')
sys.path.insert(0, os.path.join(COMFY, 'tivot_wan'))
from tivot_wan import deflicker, fg_mask  # noqa: E402  (the same deflicker the clips were made with)

SEED = 7


def source(clip):  # the wan_in picture a clip was generated from
    if '_loop' in clip:
        return clip.split('_loop')[0]
    if clip.endswith('_turn'):
        return clip[:-5]
    return clip.split('_to_')[0]


def raw_run(clip):
    """Raw frames of the Wan run behind this clip: the last burst of files before its sheet.jpg."""
    made = os.path.getmtime(os.path.join(CLIPS, clip, 'sheet.jpg'))
    files = sorted((os.path.getmtime(p), p) for p in glob.glob(os.path.join(RAW, f'{source(clip)}_{SEED}_*_.png')))
    files = [(t, p) for t, p in files if t <= made + 1]
    run = []
    for t, p in reversed(files):  # walk back while the files come in one burst
        if run and run[-1][0] - t > 20:
            break
        run.append((t, p))
    return [p for t, p in reversed(run)]


def key(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = 1 - np.clip((g - np.maximum(r, b) - 70) / 80, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b))
    return Image.fromarray(np.dstack([r, g2, b, al * 255]).clip(0, 255).astype(np.uint8))


def rekey(clip):
    d = os.path.join(CLIPS, clip)
    meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
    paths = raw_run(clip)
    n = len(meta['frames'])
    idx = list(range(n))  # loops dropped the raw run's last frame, transitions kept all
    if len(paths) not in (n, n + 1):
        return f'skipped: {len(paths)} raw frames for {n}'
    arrs = [np.asarray(Image.open(p).convert('RGB')).astype(np.float32) for p in paths]
    if fg_mask(arrs[0]).sum() > 500:
        arrs = deflicker(arrs)
    w, h = Image.open(os.path.join(d, meta['frames'][0])).size
    for j, i in enumerate(idx):
        key(arrs[i]).resize((w, h), Image.LANCZOS).save(os.path.join(d, meta['frames'][j]), 'WEBP', quality=82)
    meta['rev'] = int(time.time())
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return f'{n} frames from {os.path.basename(paths[0])}'


def main(names):
    clips = names or sorted(c for c in os.listdir(CLIPS) if os.path.exists(os.path.join(CLIPS, c, 'sheet.jpg')))
    for c in clips:
        print(f'{c:24s} {rekey(c)}', flush=True)
    py = sys.executable
    subprocess.run([py, os.path.join(IPET, 'tools', 'clip_fill.py'), *clips], stdout=subprocess.DEVNULL)
    subprocess.run([py, os.path.join(IPET, 'tools', 'clip_exits.py')], stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main(sys.argv[1:])

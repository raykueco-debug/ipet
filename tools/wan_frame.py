"""Turn one frame of a generated clip into a Wan input picture (an anchor other clips start / end on).

usage: python tools/wan_frame.py <clip> <frame index> <name>   → assets/fox/wan_in/<name>.png

The frame (keyed, transparent) goes back onto the pure-green 512² canvas, unscaled, so the new picture sits
exactly where the clip left the fox and the clips made from it chain on.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(clip, index, name):
    d = os.path.join(ROOT, 'assets', 'fox', 'clips', clip)
    frames = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))['frames']
    im = Image.open(os.path.join(d, frames[int(index)])).convert('RGBA').resize((512, 512), Image.LANCZOS)
    canvas = Image.new('RGBA', im.size, (0, 255, 0, 255))
    canvas.alpha_composite(im)
    canvas.convert('RGB').save(os.path.join(ROOT, 'assets', 'fox', 'wan_in', name + '.png'))
    print(clip, frames[int(index)], '→', name + '.png')


if __name__ == '__main__':
    main(*sys.argv[1:4])

"""Put every mood sprite on one identical green canvas for Wan, so all clips share scale and foot line.

usage: python tools/wan_prep.py            → assets/fox/wan_in/<mood>.png (512×512, RGB, pure green #00FF00)
       (generate with TIVOT_GEN=512x512 so tivot_wan.py keeps this framing)

The sprites (assets/fox/t1/…, 512² transparent, feet on one baseline) are cut with ONE box — the union of
all their outlines plus a margin — and scaled the same way. The images carry no alpha, so tivot_wan.py
doesn't re-crop them per image (that gave each clip its own scale: chained clips would jump).
"""
import os

from PIL import Image
from scipy import ndimage
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = {  # mood → sprite
    'normal': 'assets/fox/t1/normal.png', 'happy': 'assets/fox/t1/happy.png', 'love': 'assets/fox/t1/smile.png',  # pet_happy has a person's hand on its head
    'surprised': 'assets/fox/t1/surprised.png', 'curious': 'assets/fox/t1/puzzled.png', 'sad': 'assets/fox/t1/sulky.png',
    'angry': 'assets/fox/t1/angry.png',
}
W, H = 512, 512      # generation size (TIVOT_GEN=512x512): square keeps the fox large
FILL = 0.80          # fox box width as a share of the canvas (room for ears / tail to move)
FOOT = 0.94          # foot line, as a share of the canvas height
OUT = os.path.join(ROOT, 'assets', 'fox', 'wan_in')


# idle actions from the sitting home pose: only the fox in the picture (no hands, bowls, toys, effect marks)
POSES = {
    'look_around': 'assets/fox/t1/d03/look_around.png', 'tilt_left': 'assets/fox/t1/d03/tilt_left.png',
    'tilt_right': 'assets/fox/t1/d03/tilt_right.png', 'look_up': 'assets/fox/t1/d03/look_up.png',
    'yawn': 'assets/fox/t1/d07/yawn.png', 'stretch': 'assets/fox/t1/d07/stretch.png',
    'walk': 'assets/fox/t1/d07/get_up.png',  # standing, side-on, facing left: the walk loop's anchor
    'paw': 'assets/fox/t1/d03/paw_up.png',  # sitting, one front paw up: batting the ball
    'drowsy': 'assets/fox/t1/d08/eyes_closed.png',  # sitting, nodding off
    'sleep': 'assets/fox/t1/d08/sleep_curl.png',     # curled up asleep
    # GPT sheet assets/source/gpt/grid_01.png (tools/grid_split.py): eating and cute idles
    'eat': 'assets/fox/t1/g01/eat.png', 'lick': 'assets/fox/t1/g01/lick.png', 'scratch': 'assets/fox/t1/g01/scratch.png',
    'chase_tail': 'assets/fox/t1/g01/chase_tail.png', 'belly': 'assets/fox/t1/g01/belly.png',
    'sneeze': 'assets/fox/t1/g01/sneeze.png', 'play_bow': 'assets/fox/t1/g01/play_bow.png', 'sniff': 'assets/fox/t1/g01/sniff.png',
    # GPT sheet assets/source/gpt/grid_02.png: greeting, learning (yes / no / thinking), bath, cosy
    'wave': 'assets/fox/t1/g02/wave.png', 'jump_joy': 'assets/fox/t1/g02/jump_joy.png', 'nod': 'assets/fox/t1/g02/nod.png',
    'shake_no': 'assets/fox/t1/g02/shake_no.png', 'think': 'assets/fox/t1/g02/think.png', 'shake_dry': 'assets/fox/t1/g02/shake_dry.png',
    'bored': 'assets/fox/t1/g02/bored.png', 'hug_tail': 'assets/fox/t1/g02/hug_tail.png', 'shy': 'assets/fox/t1/g02/shy.png',
    # GPT sheet assets/source/gpt/grid_03.png: feelings and play
    'clap': 'assets/fox/t1/g03/clap.png', 'peekaboo': 'assets/fox/t1/g03/peekaboo.png', 'blow_kiss': 'assets/fox/t1/g03/blow_kiss.png',
    'hungry': 'assets/fox/t1/g03/hungry.png', 'shiver': 'assets/fox/t1/g03/shiver.png', 'proud': 'assets/fox/t1/g03/proud.png',
    'dance': 'assets/fox/t1/g03/dance.png', 'beg': 'assets/fox/t1/g03/beg.png', 'roll': 'assets/fox/t1/g03/roll.png',
    # GPT sheet assets/source/gpt/grid_04.png: walking to / from the viewer, the scene around it
    'walk_front': 'assets/fox/t1/g04/walk_front.png', 'walk_back': 'assets/fox/t1/g04/walk_back.png',
    'sit_back': 'assets/fox/t1/g04/sit_back.png', 'rest': 'assets/fox/t1/g04/rest.png', 'look_back': 'assets/fox/t1/g04/look_back.png',
    'sleep_belly': 'assets/fox/t1/g04/sleep_belly.png', 'stretch_up': 'assets/fox/t1/g04/stretch_up.png',
    'look_down_l': 'assets/fox/t1/g04/look_down_l.png', 'look_down_r': 'assets/fox/t1/g04/look_down_r.png',
    # GPT sheet assets/source/gpt/grid_05.png: presenting a word card, cheering, little expressions
    'present_l': 'assets/fox/t1/g05/present_l.png', 'present_r': 'assets/fox/t1/g05/present_r.png', 'cheer': 'assets/fox/t1/g05/cheer.png',
    'giggle': 'assets/fox/t1/g05/giggle.png', 'wink': 'assets/fox/t1/g05/wink.png', 'cover_ears': 'assets/fox/t1/g05/cover_ears.png',
    'sing': 'assets/fox/t1/g05/sing.png', 'sorry': 'assets/fox/t1/g05/sorry.png', 'delight': 'assets/fox/t1/g05/delight.png',
}
# facing right = the left picture flipped on the canvas, so the player can flip left-facing frames exactly
FLIPPED = {'walk_r': 'walk'}
MIRROR = {'yawn'}
ZOOM = {'walk': 0.85}  # get_up is drawn closer than the other sprites: match the head size  # drawn with the tail on the left; the home pose has it on the right


def solid(im):
    """The sprites' own background removal left the inside of the fox partly see-through (iris, shading over
    closed eyes, white fur edges: alpha 125–225). On the green canvas the green showed through there, Wan
    painted it into every frame and the key cut it out again. The colour of those pixels is right — make the
    inside of the outline opaque, keep the soft outer edge."""
    a = np.asarray(im).copy()
    inside = ndimage.binary_erosion(ndimage.binary_fill_holes(a[..., 3] > 128), iterations=2)
    a[inside, 3] = 255
    return Image.fromarray(a)


def main():
    ims = {m: solid(Image.open(os.path.join(ROOT, p)).convert('RGBA')) for m, p in SPRITES.items()}
    # the framing is set once, by the mood sprites; every later picture reuses it so all clips chain
    boxes = [im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox() for im in ims.values()]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    pad = 16
    box = (x0 - pad, y0 - pad, x1 + pad, y1)  # feet stay on the crop's bottom edge
    s = W * FILL / (box[2] - box[0])
    os.makedirs(OUT, exist_ok=True)
    for mood, im in ims.items():
        dst = os.path.join(OUT, mood + '.png')
        if os.path.exists(dst):
            continue  # clips were generated from it: never move it again
        crop = im.crop(box)
        crop = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
        canvas = Image.new('RGBA', (W, H), (0, 255, 0, 255))
        canvas.paste(crop, ((W - crop.width) // 2, round(H * FOOT) - crop.height), crop)
        canvas.convert('RGB').save(dst)
    # poses: the whole sprite through the same transform (no crop, so a wider pose isn't cut by the box)
    cw, ch = round((box[2] - box[0]) * s), round((box[3] - box[1]) * s)
    ox = (W - cw) // 2 - round(box[0] * s)
    oy = round(H * FOOT) - ch - round(box[1] * s)
    for name, path in POSES.items():
        dst = os.path.join(OUT, name + '.png')
        if os.path.exists(dst):
            continue
        im = solid(Image.open(os.path.join(ROOT, path)).convert('RGBA'))
        if name in MIRROR:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        z = ZOOM.get(name, 1)
        if z != 1:  # shrink about the bottom centre, feet stay on the foot line
            a = im.getchannel('A').getbbox()
            cx, fy = (a[0] + a[2]) / 2, a[3]
            im = im.resize((round(im.width * z), round(im.height * z)), Image.LANCZOS)
            ox2, oy2 = round(ox + cx - cx * z), round(oy + fy - fy * z)
        else:
            ox2, oy2 = ox, oy
        canvas = Image.new('RGBA', (W, H), (0, 255, 0, 255))
        canvas.paste(im, (ox2, oy2), im)
        canvas.convert('RGB').save(dst)
    for name, src in FLIPPED.items():
        dst = os.path.join(OUT, name + '.png')
        if not os.path.exists(dst):
            Image.open(os.path.join(OUT, src + '.png')).transpose(Image.FLIP_LEFT_RIGHT).save(dst)
    print('box', box, 'scale', round(s, 3), '→', OUT)


if __name__ == '__main__':
    main()

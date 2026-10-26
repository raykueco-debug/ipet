"""Ingest one GPT nine-grid by its code: QA alpha, slice, scale-match to G01, write sprites.

usage: python tools/ingest.py <grid.png> <code>
  codes: E2..E9 (expressions for N tails), N-D03 / N-D04 / N-D05 / N-D06 / N-D07 / N-D08 / N-D10

Output: assets/fox/t<N>/<name>.png for expressions, assets/fox/t<N>/<group>/<name>.png for actions.
Cell 1 of every grid is the home pose ("home"), the WAN A2B loop start/end. The whole grid is
scaled so that its home cell matches the height of G01's cell for that tail count, keeping the
fox the same size across every grid.
"""
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

EXPR = ["home", "happy", "smile", "surprised", "puzzled", "playful", "sulky", "sleepy", "angry"]
GROUPS = {
    "D03": ["home", "tilt_left", "tilt_right", "ears_up", "ear_side", "paw_up", "look_down", "look_up", "look_around"],
    "D04": ["home", "pet_happy", "pet_puzzled", "nuzzle", "look_owner", "enjoy", "beg", "surprised_joy", "shy"],
    "D05": ["home", "see_food", "sniff", "open_mouth", "eat", "chew", "swallow", "lick", "satisfied"],
    "D06": ["home", "spot_toy", "stare", "reach", "pounce", "hug_toy", "bite_toy", "chase", "tired"],
    "D07": ["home", "stand_up", "lie_down", "lie_side", "curl", "stretch", "yawn", "get_up", "sit_down"],
    "D08": ["home", "drowsy", "yawn", "eyes_closed", "sleep_prone", "sleep_curl", "deep_sleep", "dream_twitch", "wake"],
    "D10": ["home", "stand", "run_start", "run", "stop", "jump", "land", "turn", "look_back"],
}


def main():
    src, code = sys.argv[1], sys.argv[2].upper()
    if code == "D01":  # original expression sheet = 1 tail, home pose is the last cell
        n, names, sub = 1, EXPR[1:] + ["home"], ""
    elif code.startswith("E"):
        n, names, sub = int(code[1:]), EXPR, ""
    else:
        n_str, group = code.split("-")
        n, names, sub = int(n_str), GROUPS[group], group.lower()

    im = Image.open(src).convert("RGBA")
    h = im.getchannel("A").histogram()
    clear = h[0] / sum(h)
    partial = sum(h[1:240]) / sum(h)
    corner = im.convert("RGB").getpixel((2, 2))
    if corner[1] > 200 and corner[0] < 80 and corner[2] < 80:
        # green-screen delivery (#00FF00): chroma key it
        keyed = os.path.splitext(src)[0] + "_alpha.png"
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "greenkey.py"), src, keyed], check=True)
        src = keyed
        h = Image.open(src).getchannel("A").histogram()
        clear, partial = h[0] / sum(h), 0
    if clear < 0.2 or partial > 0.3:
        # GPT painted a fake checkerboard (or a translucent white haze): strip it locally
        # instead of asking for a redo. Haze → flatten on white first so it reads as background.
        fixed = os.path.splitext(src)[0] + "_alpha.png"
        if partial > 0.3:
            flat = Image.new("RGBA", im.size, (255, 255, 255, 255))
            flat.alpha_composite(im)
            src = os.path.splitext(src)[0] + "_flat.png"
            flat.convert("RGB").save(src)
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "dechecker.py"), src, fixed], check=True)
        print(f"{code}: fake alpha -> removed checkerboard ({os.path.basename(fixed)})")
        src = fixed
        h = Image.open(src).getchannel("A").histogram()
        clear = h[0] / sum(h)

    out = os.path.join(ROOT, "assets", "fox", f"t{n}", sub)
    tmp = os.path.join(out, "_probe")
    py = [sys.executable, "-I", os.path.join(HERE, "slice_grid.py")]

    # pass 1: natural scale, to measure the home cell
    r = subprocess.run(py + [src, tmp] + names, capture_output=True, text=True, check=True)
    base_scale = float(r.stdout.split()[1])
    home_h = Image.open(os.path.join(tmp, "home.png")).getchannel("A").getbbox()
    ref = Image.open(os.path.join(ROOT, "assets", "source", "g01_cells", f"t{n}.png")).getchannel("A").getbbox()
    scale = base_scale * (ref[3] - ref[1]) / (home_h[3] - home_h[1])
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)

    # pass 2: matched scale
    subprocess.run(py + [src, out] + names + ["--scale", str(scale)], check=True, capture_output=True)
    if not sub:
        # expressions: the home pose doubles as the "normal" sprite
        os.replace(os.path.join(out, "home.png"), os.path.join(out, "normal.png"))
    print(f"OK {code}: {clear:.0%} transparent -> {os.path.relpath(out, ROOT)} (scale {scale:.4f})")


if __name__ == "__main__":
    main()

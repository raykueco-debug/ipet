"""Key out a solid #00FF00 background (the delivery format GPT uses since its alpha is unreliable).

usage: python tools/greenkey.py <in.png> <out.png>

Alpha comes from how much greener a pixel is than its red/blue ("green excess"), so fur edges
get soft partial alpha; the leftover green tint on those edges is removed (despill).
"""
import sys

import numpy as np
from PIL import Image


def main():
    src, dst = sys.argv[1], sys.argv[2]
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # the fox palette never has green above red (orange, cream, brown, pink), so green over red
    # is background showing through fur edges
    excess = g - r
    lo, hi = 12.0, 110.0           # below lo: fully opaque, above hi: fully transparent
    alpha = 1.0 - np.clip((excess - lo) / (hi - lo), 0, 1)
    # unmix: an edge pixel is alpha*fox + (1-alpha)*green, so take the green back out
    a = np.maximum(alpha, 1e-3)
    fr = r / a
    fg = (g - (1 - alpha) * 255) / a
    fb = b / a
    fg = np.minimum(fg, fr)  # despill: green may never exceed red
    # GPT blends fur tips into the green in its own way, leaving yellow fringes (r ~ g >> b).
    # The fox has no yellow: pull those back to the fur's orange ratio and soften them.
    fringe = (fg > 0.75 * fr) & (fb < 0.6 * fr) & (fr > 60)
    fg = np.where(fringe, 0.58 * fr, fg)
    alpha = np.where(fringe, alpha * 0.75, alpha)
    out = np.dstack([fr, fg, fb, alpha * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(dst)
    print(f"keyed: {(alpha < 0.05).mean():.0%} transparent")


if __name__ == "__main__":
    main()

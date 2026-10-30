"""Slice a 3x3 RGBA grid from the GPT session into individual sprites.

usage: python tools/slice_grid.py <grid.png> <out_dir> name1 name2 ... name9 [--size 512] [--anchor-root] [--scale S]

- Cleans near-transparent noise (alpha < 24 -> 0) and snaps near-opaque to 255.
- Finds the cell boundaries from empty columns/rows in the alpha channel
  (falls back to an even 3x3 split).
- Crops each cell to its content and places it on a square canvas,
  bottom-centered, so every sprite shares the same feet baseline.
"""
import sys
from PIL import Image


def clean(im):
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 24 else (255 if v > 232 else v))
    return Image.merge("RGBA", (r, g, b, a))


def drop_specks(cell, keep_ratio=0.004, step=4, fox_only=True):
    """Erase islands: bits of neighbouring cells, and (fox_only) every effect/prop not attached
    to the fox body (?, !, zzz, hearts, motion lines...). The fox is the biggest blob."""
    a = cell.getchannel("A")
    w, h = a.size
    gw, gh = (w + step - 1) // step, (h + step - 1) // step
    small = a.resize((gw, gh), Image.BOX).load()
    seen = [[False] * gw for _ in range(gh)]
    comps = []
    for y in range(gh):
        for x in range(gw):
            if seen[y][x] or small[x, y] < 32:
                continue
            stack, pts = [(x, y)], []
            seen[y][x] = True
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and not seen[ny][nx] and small[nx, ny] >= 32:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            comps.append(pts)
    if not comps:
        return cell
    biggest = max(len(c) for c in comps)
    mask = Image.new("L", (gw, gh), 0)
    mp = mask.load()
    for c in comps:
        # bits of a neighbouring cell always touch the cut line; effects (?, !, zzz) float free
        touches_edge = any(x in (0, gw - 1) or y in (0, gh - 1) for x, y in c)
        if touches_edge and len(c) < biggest * 0.15:
            continue
        if fox_only and len(c) != biggest:
            continue
        if len(c) >= biggest * keep_ratio:
            for x, y in c:
                mp[x, y] = 255
    from PIL import ImageFilter
    mask = mask.filter(ImageFilter.MaxFilter(3)).resize((w, h), Image.NEAREST)
    from PIL import ImageChops
    out = cell.copy()
    out.putalpha(ImageChops.multiply(a, mask))
    return out


def splits(profile, n=3):
    """Pick n-1 cut points in the emptiest region near each even third."""
    total = len(profile)
    cuts = []
    for i in range(1, n):
        center = total * i // n
        win = total // 8
        lo, hi = center - win, center + win
        best = min(range(lo, hi), key=lambda x: (profile[x], abs(x - center)))
        cuts.append(best)
    return [0] + cuts + [total]


def main():
    args = sys.argv[1:]
    size = 512
    root_anchor = "--anchor-root" in args  # tails: center the root (bottom-most fur), not the bbox
    if root_anchor:
        args.remove("--anchor-root")
    fixed_scale = None  # reuse the scale printed for G01 so every grid keeps the same character size
    if "--scale" in args:
        i = args.index("--scale")
        fixed_scale = float(args[i + 1])
        del args[i:i + 2]
    if "--size" in args:
        i = args.index("--size")
        size = int(args[i + 1])
        del args[i:i + 2]
    src, out_dir, names = args[0], args[1], args[2:]
    assert len(names) == 9, "need 9 names"

    im = clean(Image.open(src).convert("RGBA"))
    a = im.getchannel("A")
    w, h = im.size
    px = a.load()
    col = [sum(1 for y in range(0, h, 2) if px[x, y]) for x in range(w)]
    row = [sum(1 for x in range(0, w, 2) if px[x, y]) for y in range(h)]
    xs, ys = splits(col), splits(row)

    crops = []
    for r in range(3):
        # the column cuts for this row only (a giraffe's head may reach into a gap another row doesn't have)
        y0, y1 = ys[r], ys[r + 1]
        xs = splits([sum(1 for y in range(y0, y1, 2) if px[x, y]) for x in range(w)])
        for c in range(3):
            cell = drop_specks(im.crop((xs[c], ys[r], xs[c + 1], ys[r + 1])))
            bbox = cell.getchannel("A").getbbox()
            crops.append(cell.crop(bbox) if bbox else cell)

    # one shared scale so all sprites keep the same character size
    biggest = max(max(c.size) for c in crops)
    scale = fixed_scale or (size * 0.94) / biggest
    print("scale", round(scale, 5))
    pad = int(size * 0.03)

    import os
    os.makedirs(out_dir, exist_ok=True)
    for name, cr in zip(names, crops):
        cw, ch = max(1, round(cr.width * scale)), max(1, round(cr.height * scale))
        cr = cr.resize((cw, ch), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        x = (size - cw) // 2
        if root_anchor:
            band = cr.getchannel("A").crop((0, int(ch * 0.94), cw, ch)).getbbox()
            if band:
                x = size // 2 - (band[0] + band[2]) // 2
        canvas.paste(cr, (x, size - pad - ch), cr)
        canvas.save(os.path.join(out_dir, name + ".png"), optimize=True)
        print("wrote", name, cr.size)


if __name__ == "__main__":
    main()

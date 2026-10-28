"""Cut the face out of each 2D expression sprite, align it to normal.png, and pack an atlas for the 3D fox.

usage: python tools/face_atlas.py [assets/fox/cub] [assets/fox3d] [base.png]
  base.png: the art the 3D face is projected from (default <src>/normal.png), e.g. the turnaround's front view

Writes two layers over the same face rectangle (4-column grids of 256² cells) and <out>/face.json:
  face_atlas.png – brows, nose, mouth per expression     face.json: rect, cols, rows, cells
  eyes_atlas.png – the eyes alone per expression, plus "half" and "closed" blink frames   face.json: eyes{}
  rect – face rectangle in the base art, normalised (u0, v0, u1, v1; v measured from the top)
The 3D model itself carries no eyes; the app animates the eyes layer on top (blink = half → closed → half).
Alignment uses the two eye centres (dark blobs) of each sprite → similarity transform onto normal's eyes.
Only the features stay opaque (eyes, nose, mouth, brow dots, blush): alpha = distance from the local
fur colour, so the body's flat colour regions show through and recolouring the fox still matches.
"""
import json
import os
import sys

import cv2
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'assets/fox/cub'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/fox3d'
BASE = sys.argv[3] if len(sys.argv) > 3 else None
# puzzled / sulky tilt the whole head, so their faces don't line up with a front-facing model
EXPRS = ['normal', 'happy', 'angry', 'surprised', 'smile', 'blink']
CELL, COLS = 256, 4
EYE_INK = (38, 24, 22)


def load(name):
    path = BASE if name == 'normal' and BASE else os.path.join(SRC, name + '.png')
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return im  # BGRA


def eye_blobs(im):
    """Two largest dark blobs in the upper-middle of the sprite → (left, right) centres + masks."""
    a = im[..., 3]
    ys, xs = np.nonzero(a > 128)
    top, bot = ys.min(), ys.max()
    gray = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2GRAY)
    dark = ((gray < 95) & (a > 200)).astype(np.uint8)
    band = np.zeros_like(dark)
    band[int(top + 0.30 * (bot - top)):int(top + 0.62 * (bot - top))] = 1
    n, lab, stats, cent = cv2.connectedComponentsWithStats(cv2.morphologyEx(dark * band, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)))
    comps = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:6]
    # pick the pair that is roughly level and well apart
    best = None
    for i in comps:
        for j in comps:
            if i >= j:
                continue
            (x1, y1), (x2, y2) = cent[i], cent[j]
            if abs(y1 - y2) < 25 and 60 < abs(x1 - x2) < 200:
                score = stats[i, cv2.CC_STAT_AREA] + stats[j, cv2.CC_STAT_AREA]
                if not best or score > best[0]:
                    best = (score, i, j)
    if not best:
        return None
    _, i, j = best
    pts = sorted([cent[i], cent[j]], key=lambda c: c[0])
    mask = ((lab == i) | (lab == j)).astype(np.uint8)
    return np.array(pts, np.float32), mask


def align(im, src_eyes, dst_eyes):
    m, _ = cv2.estimateAffinePartial2D(src_eyes, dst_eyes)
    return cv2.warpAffine(im, m, (im.shape[1], im.shape[0]), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))


def eye_holes(eyes):
    """Soft mask (0..1) of both eyes in cell pixels: wider than the eye (red outer corner, lashes) and
    deeper below it than above, so the brow dots stay on the face layer."""
    d = float(np.linalg.norm(eyes[1] - eyes[0]))
    hole = np.zeros((CELL, CELL), np.float32)
    for (x, y) in eyes:
        cv2.ellipse(hole, (int(x), int(y + d * 0.08)), (int(d * 0.40), int(d * 0.37)), 0, 0, 360, 1.0, -1)
    return cv2.GaussianBlur(hole, (0, 0), 1.5)


def layer(cell, keep):
    out = cell.copy()
    out[..., 3] = (out[..., 3].astype(np.float32) * keep).astype(np.uint8)
    return out


def lid_arcs(cell, eyes, dy, thick):
    d = float(np.linalg.norm(eyes[1] - eyes[0]))
    for (x, y) in eyes:
        w = int(d * 0.24)
        cv2.ellipse(cell, (int(x), int(y + d * dy)), (w, int(w * 0.45)), 0, 15, 165, (*EYE_INK, 255),
                    max(3, int(d * thick)), cv2.LINE_AA)
    return cell


def shut(eyes):
    """Closed eyes: just the lid arcs."""
    return lid_arcs(np.zeros((CELL, CELL, 4), np.uint8), eyes, 0.04, 0.035)


def half_shut(open_eyes, eyes):
    """Mid-blink: the open eyes with their top half hidden under a straight dark lid line."""
    cell = open_eyes.copy()
    d = float(np.linalg.norm(eyes[1] - eyes[0]))
    for (x, y) in eyes:
        lid = int(y + d * 0.02)
        x0, x1 = int(x - d * 0.42), int(x + d * 0.42)
        cell[:lid, x0:x1, 3] = 0
        cv2.line(cell, (int(x - d * 0.26), lid), (int(x + d * 0.26), lid), (*EYE_INK, 255), max(3, int(d * 0.045)), cv2.LINE_AA)
    return cell


def feature_alpha(crop):
    """1 where the pixel stands out from the smoothed fur around it (eyes, nose, mouth), 0 on plain fur."""
    bgr = crop[..., :3].astype(np.float32)
    fur = cv2.medianBlur(crop[..., :3], 31).astype(np.float32)
    lab_d = np.linalg.norm(cv2.cvtColor(bgr / 255, cv2.COLOR_BGR2LAB) - cv2.cvtColor(fur / 255, cv2.COLOR_BGR2LAB), axis=-1)
    a = np.clip((lab_d - 10) / 18, 0, 1)
    h, w = a.shape
    # the nose bridge and the fur either side of the nose are plain fur on the 3D body: drop the light
    # highlights there (they showed as white dots on the orange), keep the dark nose itself
    lab = cv2.cvtColor(bgr / 255, cv2.COLOR_BGR2LAB)
    light = (lab[..., 0] > 78) & (np.hypot(lab[..., 1], lab[..., 2]) < 30)
    bridge = np.zeros_like(a)
    cv2.rectangle(bridge, (int(w * 0.36), int(h * 0.28)), (int(w * 0.64), int(h * 0.63)), 1.0, -1)
    a[light & (bridge > 0)] = 0
    # only where features live: brows → mouth, not the chest fur or cheek outlines
    zone = np.zeros_like(a)
    cv2.ellipse(zone, (w // 2, int(h * 0.48)), (int(w * 0.40), int(h * 0.30)), 0, 0, 360, 1.0, -1)
    a *= zone
    # fill enclosed holes (iris colour is close to the fur), drop specks
    solid = (a > 0.35).astype(np.uint8)
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    flood = solid.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    solid |= 1 - flood
    n, lab, stats, _ = cv2.connectedComponentsWithStats(solid)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 25:
            solid[lab == i] = 0
    a = np.maximum(a * (solid > 0), solid.astype(np.float32))
    return cv2.GaussianBlur(a, (0, 0), 1.0)


def main():
    base = load('normal')
    base_eyes, base_mask = eye_blobs(base)
    d = float(np.linalg.norm(base_eyes[1] - base_eyes[0]))
    cx, cy = base_eyes.mean(0)
    # face rect: brows → below the mouth, a bit wider than the eyes
    x0, x1 = cx - 1.15 * d, cx + 1.15 * d
    y0, y1 = cy - 0.75 * d, cy + 1.05 * d
    h, w = base.shape[:2]

    faces = {}
    for name in EXPRS:
        if name == 'blink':
            continue  # eyes layer: 'half' and 'closed' frames are drawn below
        p = os.path.join(SRC, name + '.png')
        if not os.path.exists(p):
            continue
        im = load(name)
        found = eye_blobs(im)
        if found is None:
            print(f'{name}: eyes not found, skipped')
            continue
        faces[name] = align(im, found[0], base_eyes)

    # feathered oval mask so the face melts into the flat fur colours around it
    mask = np.zeros((CELL, CELL), np.float32)
    cv2.ellipse(mask, (CELL // 2, CELL // 2), (int(CELL * 0.47), int(CELL * 0.46)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), CELL * 0.05)

    # every expression cell, then split in two layers by the eye holes: the eyes become their own animated
    # layer (eyes_atlas.png, plus half-shut and shut frames for blinking); the rest is face_atlas.png —
    # brows only: the nose and mouth are 3D parts on the muzzle (toon_fox.py), right from every angle
    cell_eyes = (base_eyes - np.array([x0, y0], np.float32)) * np.array([CELL / (x1 - x0), CELL / (y1 - y0)], np.float32)
    hole = eye_holes(cell_eyes)
    d_cell = float(np.linalg.norm(cell_eyes[1] - cell_eyes[0]))
    muzzle = np.zeros((CELL, CELL), np.float32)
    cv2.ellipse(muzzle, (CELL // 2, int(cell_eyes[:, 1].mean() + d_cell * 0.6)), (int(d_cell * 0.42), int(d_cell * 0.62)), 0, 0, 360, 1.0, -1)
    muzzle = cv2.GaussianBlur(muzzle, (0, 0), 2)
    full = {}
    for name in [n for n in EXPRS if faces.get(n) is not None]:
        crop = faces[name][int(y0):int(y1), int(x0):int(x1)]
        crop = cv2.resize(crop, (CELL, CELL), interpolation=cv2.INTER_AREA)
        crop[..., 3] = (crop[..., 3].astype(np.float32) * mask * feature_alpha(crop)).astype(np.uint8)
        full[name] = crop
    # the face layer stays clear of everything eye-ish (lower lashes, red outer corners) — with the eyes
    # shut those leftovers showed as marks; a wider, lower hole than the eyes layer, brows untouched above
    around = np.zeros((CELL, CELL), np.float32)
    for (x, y) in cell_eyes:
        cv2.ellipse(around, (int(x), int(y + d_cell * 0.14)), (int(d_cell * 0.55), int(d_cell * 0.42)), 0, 0, 360, 1.0, -1)
    around = np.maximum(hole, cv2.GaussianBlur(around, (0, 0), 2))
    face_cells = {n: layer(c, (1 - around) * (1 - muzzle)) for n, c in full.items()}
    eye_cells = {n: layer(c, hole) for n, c in full.items()}
    eye_cells['half'] = half_shut(eye_cells['normal'], cell_eyes)
    eye_cells['closed'] = shut(cell_eyes)

    os.makedirs(OUT, exist_ok=True)
    info = {'rect': [float(v) for v in (x0 / w, y0 / h, x1 / w, y1 / h)]}
    for fname, key, cells in (('face_atlas.png', None, face_cells), ('eyes_atlas.png', 'eyes', eye_cells)):
        rows = (len(cells) + COLS - 1) // COLS
        atlas = np.zeros((rows * CELL, COLS * CELL, 4), np.uint8)
        index = {}
        for k, (name, cell) in enumerate(cells.items()):
            r, c = divmod(k, COLS)
            atlas[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = cell
            index[name] = k
        cv2.imwrite(os.path.join(OUT, fname), atlas)
        grid = {'cols': COLS, 'rows': rows, 'cells': index}
        if key:
            info[key] = grid
        else:
            info.update(grid)
        print(fname, index)
    json.dump(info, open(os.path.join(OUT, 'face.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()

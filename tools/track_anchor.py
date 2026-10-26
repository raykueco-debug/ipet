"""Track accessory anchor points through a WAN-animated frame sequence.

usage:
  python tools/track_anchor.py <frames_dir> <out.json> --head X,Y --neck X,Y [--face X,Y]

  frames_dir : the animation's frames (PNG/WebP, sorted by name), same 512x512 canvas as the stills
  --head/--neck/--face : pixel position of each slot on the FIRST frame (the home pose)

Output JSON (consumed by app.js):
  { "slots": { "head": [[x, y, angle_deg, scale, visible], ...per frame], "neck": [...] } }

How: each slot is tracked with a small cloud of Lucas-Kanade points around the click.
Per frame we fit a similarity transform (move + rotate + scale) from the cloud, so a hat
tilts with the head. When most points are lost (fox turns away / curls up) the slot is
marked invisible; the app hides the accessory on those frames.
"""
import json
import math
import os
import sys

import cv2
import numpy as np


def load_frames(d):
    names = sorted(f for f in os.listdir(d) if f.lower().endswith((".png", ".webp", ".jpg")))
    frames = []
    for n in names:
        im = cv2.imread(os.path.join(d, n), cv2.IMREAD_UNCHANGED)
        if im.shape[2] == 4:  # composite on grey so transparent areas don't create fake features
            a = im[:, :, 3:4] / 255.0
            im = (im[:, :, :3] * a + 128 * (1 - a)).astype(np.uint8)
        frames.append(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY))
    return frames


def seed_points(gray, x, y, radius=28):
    mask = np.zeros_like(gray)
    cv2.circle(mask, (int(x), int(y)), radius, 255, -1)
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=40, qualityLevel=0.01, minDistance=3, mask=mask)
    if pts is None or len(pts) < 6:  # flat fur: fall back to a grid
        g = [(x + dx, y + dy) for dx in range(-16, 17, 8) for dy in range(-16, 17, 8)]
        pts = np.array(g, np.float32).reshape(-1, 1, 2)
    return pts.astype(np.float32)


def track_slot(frames, x, y):
    lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    p0 = seed_points(frames[0], x, y)
    ref = p0.copy()
    n0 = len(p0)
    out = [[float(x), float(y), 0.0, 1.0, True]]
    prev, pts, anchor = frames[0], p0, np.array([x, y], np.float32)
    keep = np.ones(n0, bool)
    for gray in frames[1:]:
        nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, gray, pts, None, **lk)
        back, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev, nxt, None, **lk)
        good = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(back - pts, axis=2).ravel() < 1.5)
        keep &= good
        visible = keep.sum() >= max(4, n0 * 0.3)
        if keep.sum() >= 3:
            m, _ = cv2.estimateAffinePartial2D(ref[keep], nxt[keep])
        else:
            m = None
        if m is not None:
            ax, ay = m @ np.array([x, y, 1.0])
            angle = math.degrees(math.atan2(m[1, 0], m[0, 0]))
            scale = math.hypot(m[0, 0], m[1, 0])
            anchor = np.array([ax, ay], np.float32)
        else:
            angle, scale = out[-1][2], out[-1][3]
            visible = False
        out.append([round(float(anchor[0]), 1), round(float(anchor[1]), 1), round(angle, 1), round(scale, 3), bool(visible)])
        prev, pts = gray, nxt
    return out


def main():
    args = sys.argv[1:]
    frames_dir, out_path = args[0], args[1]
    slots = {}
    for flag in ("--head", "--neck", "--face"):
        if flag in args:
            x, y = map(float, args[args.index(flag) + 1].split(","))
            slots[flag[2:]] = (x, y)
    if not slots:
        sys.exit("give at least one of --head/--neck/--face")
    frames = load_frames(frames_dir)
    result = {"frames": len(frames), "slots": {k: track_slot(frames, *v) for k, v in slots.items()}}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f)
    for k, v in result["slots"].items():
        hidden = sum(1 for r in v if not r[4])
        print(f"{k}: {len(v)} frames, hidden on {hidden}")


if __name__ == "__main__":
    main()

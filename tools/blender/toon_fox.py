"""Hunyuan3D shape + 2D art → toon fox for the app (flat colour regions, 2D face decal, rig, tails, clips).

usage: blender -b --factory-startup --python tools/blender/toon_fox.py -- RAW.glb ART.png OUT.glb
         [--face assets/fox3d/face.json] [--faces 20000] [--blend out.blend]
         [--pose standing --side left.png --back back.png]   (multi-view turnaround, tools/split_turnaround.py)

ART is the front view. With --side / --back each surface takes its colour from the view it faces most
(side view = the fox looking to the image's left). --pose standing skips the single-view fixes (face
sculpt, tail-stub cut), places the neck from the face rect and uses a four-legged walk.

Body colours are flat regions (Fur / Cream / Dark / Pink materials) classified from a feature-less copy
of the art, so the app can recolour each region. The face (eyes, nose, mouth) is a separate "Face" mesh
cut from the front of the head, UV-mapped onto one cell of face_atlas.png (tools/face_atlas.py); the app
switches expressions by moving the texture offset to another cell.
Rig weights are procedural (height bands), which is robust on any blob Hunyuan returns.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_fox  # noqa: E402  (tail + action helpers)
import quad_rig  # noqa: E402  (four-legged Rigify-wolf-style skeleton for the standing fox)

argv = sys.argv[sys.argv.index('--') + 1:]
RAW, ART, OUT = argv[:3]
opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d  # noqa: E731
FACE = opt('--face', os.path.join(os.path.dirname(os.path.abspath(OUT)), 'face.json'))
FACES = int(opt('--faces', 20000))  # triangle budget for the body
BLEND = opt('--blend', None)
POSE = opt('--pose', 'sitting')
SIDE = opt('--side', None)
BACK = opt('--back', None)
EYE_ITERS = int(opt('--eye-iters', 300))  # membrane-fill iterations for the eye patches

REGIONS = ['Fur', 'Cream', 'Dark', 'Pink']


# ---------------------------------------------------------------- art helpers
def load_art(path):
    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top-down rows
    ys, xs = np.nonzero(px[..., 3] > 0.5)
    return px, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def featureless(px, k=45):
    """Per-pixel median over a k×k window (opaque pixels only): keeps big colour areas, drops eyes/mouth."""
    h, w = px.shape[:2]
    pad, step = k // 2, max(1, k // 9)
    rgb = np.pad(px[..., :3], ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    a = np.pad(px[..., 3], ((pad, pad), (pad, pad)), mode='edge')
    samples, masks = [], []
    for dy in range(0, k, step):
        for dx in range(0, k, step):
            samples.append(rgb[dy:dy + h, dx:dx + w])
            masks.append(a[dy:dy + h, dx:dx + w] > 0.5)
    s, m = np.stack(samples), np.stack(masks)[..., None]
    med = np.nanmedian(np.where(m, s, np.nan), axis=0)
    return np.where(np.isnan(med), px[..., :3], med)


def palette(px):
    """Representative colour per region, measured from the art (so the 3D fox matches it)."""
    rgb = px[..., :3][px[..., 3] > 0.9]
    hsv = rgb_to_hsv(rgb)
    pick = {
        'Fur': (hsv[:, 1] > 0.55) & (hsv[:, 2] > 0.75) & (hsv[:, 0] < 0.11),
        'Cream': (hsv[:, 1] < 0.18) & (hsv[:, 2] > 0.88),
        'Dark': (hsv[:, 2] < 0.38),
        'Pink': (hsv[:, 0] < 0.05) & (hsv[:, 1] > 0.15) & (hsv[:, 1] < 0.4) & (hsv[:, 2] > 0.8),
    }
    fallback = {'Fur': (0.94, 0.54, 0.24), 'Cream': (1.0, 0.95, 0.9), 'Dark': (0.3, 0.18, 0.15), 'Pink': (0.97, 0.75, 0.7)}
    return {k: tuple(np.median(rgb[m], 0)) if m.sum() > 50 else fallback[k] for k, m in pick.items()}


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return np.stack([h, np.where(mx > 0, d / (mx + 1e-6), 0), mx], -1)


def classify(rgb, pal):
    names = REGIONS
    centres = np.array([pal[n] for n in names])
    d = ((rgb[:, None, :] - centres[None]) ** 2).sum(-1)
    return d.argmin(1)


# ---------------------------------------------------------------- mesh
def import_clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(RAW))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    fox = bpy.context.object
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.context.scene.objects):
        if o != fox:
            bpy.data.objects.remove(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    fox.name = fox.data.name = 'Fox'

    co = np.array([v.co[:] for v in fox.data.vertices])
    lo, hi = co.min(0), co.max(0)
    s = 1.0 / (hi[2] - lo[2])
    for v in fox.data.vertices:
        v.co = Vector(((v.co.x - (lo[0] + hi[0]) / 2) * s, (v.co.y - (lo[1] + hi[1]) / 2) * s, (v.co.z - lo[2]) * s))

    # voxel remesh drops floaters' spikes and makes it watertight; smooth; then decimate to budget
    fox.data.remesh_voxel_size = 0.006
    bpy.ops.object.voxel_remesh()
    for name, kind, props in (('sm', 'SMOOTH', {'factor': 0.6, 'iterations': 6}),
                              ('dec', 'DECIMATE', {'ratio': 1.0})):
        mod = fox.modifiers.new(name, kind)
        for k, v in props.items():
            setattr(mod, k, v)
        if kind == 'DECIMATE':
            mod.ratio = min(1.0, FACES / max(1, 2 * len(fox.data.polygons)))  # FACES counts triangles; remesh gives quads
        bpy.ops.object.modifier_apply(modifier=name)
    if POSE != 'standing':
        cut_tail_stub(fox)
    keep_largest_island(fox)

    # re-normalise after smoothing shrank it a little
    co = np.array([v.co[:] for v in fox.data.vertices])
    lo, hi = co.min(0), co.max(0)
    s = 1.0 / (hi[2] - lo[2])
    for v in fox.data.vertices:
        v.co = Vector(((v.co.x - (lo[0] + hi[0]) / 2) * s, (v.co.y - (lo[1] + hi[1]) / 2) * s, (v.co.z - lo[2]) * s))
    for p in fox.data.polygons:
        p.use_smooth = True
    return fox


def cut_tail_stub(fox):
    """Hunyuan usually invents a tail lying behind the rump; drop everything well behind the back."""
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    band = (co[:, 2] > 0.25) & (co[:, 2] < 0.40) & (np.abs(co[:, 0]) < 0.1)
    if not band.any():
        return
    back = co[band, 1].max() + 0.02
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    gone = [v for v in bm.verts if v.co.y > back and v.co.z < 0.30]
    if gone:
        bmesh.ops.delete(bm, geom=gone, context='VERTS')
        edges = [e for e in bm.edges if e.is_boundary]
        new = bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces']
        bmesh.ops.triangulate(bm, faces=new)
    bm.to_mesh(me)
    bm.free()
    print('tail stub: removed', len(gone), 'verts behind y', round(back, 3))


def fit_profile(fox, side):
    """Match the head's side profile to the side-view art: for each height, the face's front edge in the
    art is the target; the centre line of the head is moved there (the cheeks follow with a falloff).
    Fixes noses the clean-up smoothing blunted, without inventing a shape the art doesn't have."""
    px, (x0, y0, x1, y1) = side
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    yr, zr = (co[:, 1].min(), co[:, 1].max()), (co[:, 2].min(), co[:, 2].max())
    alpha = px[..., 3] > 0.5
    centre = np.abs(co[:, 0]) < 0.04
    head_top = co[centre, 2].max()
    zs = np.arange(0.35, head_top - 0.06, 0.01)  # chin … forehead, below the ears
    target, current = [], []
    for z in zs:
        row = int(np.clip(y1 - (z - zr[0]) / (zr[1] - zr[0]) * (y1 - y0), 0, px.shape[0] - 1))
        cols = np.nonzero(alpha[row])[0]
        band = centre & (np.abs(co[:, 2] - z) < 0.006)
        if not len(cols) or not band.any():
            target.append(np.nan)
            current.append(np.nan)
            continue
        target.append(yr[0] + (cols.min() - x0) / (x1 - x0) * (yr[1] - yr[0]))
        current.append(co[band, 1].min())
    delta = np.array(target) - np.array(current)
    ok = ~np.isnan(delta)
    if ok.sum() < 3:
        return
    delta = np.interp(zs, zs[ok], delta[ok])
    delta = np.convolve(delta, np.ones(5) / 5, mode='same').clip(-0.08, 0.08)
    head_y = co[co[:, 2] > zs[0], 1].mean()
    for v in me.vertices:
        if v.co.y > head_y or not zs[0] - 0.03 < v.co.z < zs[-1] + 0.03:
            continue
        d = float(np.interp(v.co.z, zs, delta))
        w = math.exp(-(v.co.x / 0.12) ** 2) * min(1.0, (head_y - v.co.y) / 0.08)
        v.co.y += d * w
    print('profile: moved up to', round(float(np.abs(delta).max()), 3))


def sculpt_face(fox, bbox, w, h, face, broad=0.045, snout=0.05, snout_r=0.075):
    """Single-view Hunyuan gives a flat, mask-like face: push out a rounded face and a short muzzle.
    Multi-view shapes keep their face but the clean-up smoothing blunts the nose: snout only."""
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    nrm = np.array([v.normal[:] for v in me.vertices])
    xr, zr = (co[:, 0].min(), co[:, 0].max()), (co[:, 2].min(), co[:, 2].max())
    x0, y0, x1, y1 = bbox
    fu0, fv0, fu1, fv1 = face['rect']

    def model_xz(ax, ay):  # art pixel → model x, z
        return (xr[0] + (ax - x0) / (x1 - x0) * (xr[1] - xr[0]),
                zr[0] + (y1 - ay) / (y1 - y0) * (zr[1] - zr[0]))

    # face rect spans brows (eyes - .75d) … chin (eyes + 1.05d): eyes at 0.42, nose at 0.58 of its height
    cx = (fu0 + fu1) / 2 * w
    eyes = model_xz(cx, (fv0 + 0.42 * (fv1 - fv0)) * h)
    nose = model_xz(cx, (fv0 + 0.58 * (fv1 - fv0)) * h)
    mid = ((eyes[0] + nose[0]) / 2, (eyes[1] + nose[1]) / 2)
    front = np.clip((-nrm[:, 1] - 0.1) / 0.4, 0, 1) * (co[:, 2] > nose[1] - 0.16)
    r_face = ((co[:, 0] - mid[0]) ** 2 + (co[:, 2] - mid[1]) ** 2)
    r_snout = ((co[:, 0] - nose[0]) ** 2 + (co[:, 2] - nose[1]) ** 2)
    push = front * (broad * np.exp(-r_face / 0.17 ** 2) + snout * np.exp(-r_snout / snout_r ** 2))
    for v, d in zip(me.vertices, push):
        v.co.y -= float(d)
    print('face: pushed max', round(float(push.max()), 3))


def keep_largest_island(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen, islands = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, isl = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            isl.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        islands.append(isl)
    islands.sort(key=len, reverse=True)
    for isl in islands[1:]:
        bmesh.ops.delete(bm, geom=isl, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()


def project(co, bbox, w, h, xr, zr):
    """Front projection of object-space points → art pixel coords (x right, y down)."""
    x0, y0, x1, y1 = bbox
    u = x0 + (co[:, 0] - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)
    v = y1 - (co[:, 2] - zr[0]) / (zr[1] - zr[0]) * (y1 - y0)
    return np.clip(u, 0, w - 1), np.clip(v, 0, h - 1)


# ---------------------------------------------------------------- colour regions
def sample_view(px, bbox, along, zs, rng, zr):
    """Colour at (horizontal coord `along` mapped over rng, height z) in one view's art."""
    h, w = px.shape[:2]
    x0, y0, x1, y1 = bbox
    u = np.clip(x0 + (along - rng[0]) / (rng[1] - rng[0]) * (x1 - x0), 0, w - 1)
    v = np.clip(y1 - (zs - zr[0]) / (zr[1] - zr[0]) * (y1 - y0), 0, h - 1)
    return px[v.astype(int), u.astype(int)]


def layer_ears(co, nrm, lab):
    """Ears get clean layers from geometry instead of the art (projected fur tufts turned them to confetti):
    outside = orange with a dark tip; inside (facing forward) = white fluff at the base, pink, dark rim at the top."""
    centre = np.abs(co[:, 0]) < 0.04
    head_top = co[centre, 2].max() if centre.any() else 0.8
    ear = (co[:, 2] > head_top) & ~centre
    if not ear.any():
        return lab
    top = co[ear, 2].max()
    t = (co[:, 2] - head_top) / max(1e-3, top - head_top)  # 0 at the skull, 1 at the ear tip
    inner = nrm[:, 1] < -0.25
    R = {n: REGIONS.index(n) for n in REGIONS}
    out = lab.copy()
    out[ear & ~inner] = np.where(t[ear & ~inner] > 0.55, R['Dark'], R['Fur'])
    ti = t[ear & inner]
    out[ear & inner] = np.where(ti > 0.8, R['Dark'], np.where(ti < 0.15, R['Cream'], R['Pink']))
    out[~ear & (out == R['Pink'])] = R['Cream']  # pink belongs to the inner ear only
    print('ears: layered', int(ear.sum()), 'verts above z', round(float(head_top), 3))
    return out


def eye_spots(co, nrm, px, bbox, xr, zr, face):
    """Vertices where the art's eyes sit (whites, lashes and all). The body must carry no eyes — the eyes
    layer draws them, and anything the body picked up there showed through closed eyes."""
    h, w = px.shape[:2]
    x0, y0, x1, y1 = bbox
    fu0, fv0, fu1, fv1 = face['rect']
    rw, rh = (fu1 - fu0) * w, (fv1 - fv0) * h
    ax = x0 + (co[:, 0] - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)  # vertex → art pixel
    ay = y1 - (co[:, 2] - zr[0]) / (zr[1] - zr[0]) * (y1 - y0)
    ey = (fv0 + 0.75 / 1.8 * (fv1 - fv0)) * h  # eye centre row; eyes ±0.217 rect widths from the middle
    spots = np.zeros(len(co), bool)
    for sx in (-1, 1):
        ex = (fu0 + fu1) / 2 * w + sx * 0.217 * rw
        spots |= ((ax - ex) / (0.19 * rw)) ** 2 + ((ay - ey - 0.03 * rh) / (0.22 * rh)) ** 2 < 1
    return spots & (nrm[:, 1] < -0.2)


def fill_labels(lab, unknown, nbr):
    """Grow the surrounding colours into the unknown patch ring by ring (majority of known neighbours), so
    borders that run under the eyes carry on along their own curve instead of a cut straight across."""
    lab = lab.copy()
    known = ~unknown
    for _ in range(500):
        todo = np.nonzero(~known)[0]
        if not len(todo):
            break
        new = {}
        for i in todo:
            ks = [j for j in nbr[i] if known[j]]
            if ks:
                new[i] = np.bincount(lab[ks], minlength=len(REGIONS)).argmax()
        if not new:
            break
        for i, l in new.items():
            lab[i] = l
            known[i] = True
    return lab


def paint_regions(fox, px, bbox, pal, side=None, back=None, face=None):
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    nrm = np.array([v.normal[:] for v in me.vertices])
    xr, yr, zr = [(co[:, i].min(), co[:, i].max()) for i in range(3)]
    lab = classify(sample_view(featureless(px), bbox, co[:, 0], co[:, 2], xr, zr), pal)

    fur, dark = REGIONS.index('Fur'), REGIONS.index('Dark')
    if side is not None and back is not None:
        # each vertex takes the view it faces most: front (-Y), side (+-X, the art is symmetric), back (+Y).
        # The side view only owns clearly sideways surfaces; tops (forehead, back) go to front/back by which
        # half of the body they sit in — the side art's top edge is ears and outline, which streaked the head.
        up = np.clip(nrm[:, 2], 0, 1)
        front_half = co[:, 1] < (yr[0] + yr[1]) / 2
        score = np.stack([-nrm[:, 1] + up * front_half, np.abs(nrm[:, 0]) - 0.2, nrm[:, 1] + up * ~front_half], 1)
        pick = score.argmax(1)
        sp, sb = side
        bp, bb = back
        lab_side = classify(sample_view(featureless(sp), sb, co[:, 1], co[:, 2], yr, zr), pal)
        lab_back = classify(sample_view(featureless(bp), bb, -co[:, 0], co[:, 2], (-xr[1], -xr[0]), zr), pal)
        lab = np.where(pick == 1, lab_side, np.where(pick == 2, lab_back, lab))
    else:
        # faces turned away from the camera can't be seen in the art: orange fur, dark paws, dark ear tips
        back_f = nrm[:, 1] > 0.25
        lab[back_f] = fur
        lab[back_f & (co[:, 2] < 0.09)] = dark
        lab[back_f & (co[:, 2] > 0.90)] = dark
        lab[back_f & (lab == REGIONS.index('Pink'))] = fur

    lab = layer_ears(co, nrm, lab)
    nbr = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    if face is not None:
        lab = fill_labels(lab, eye_spots(co, nrm, px, bbox, xr, zr, face), nbr)

    # majority filter over neighbours to clean ragged borders
    for _ in range(3):
        new = lab.copy()
        for i, ns in enumerate(nbr):
            if ns:
                new[i] = np.bincount(lab[ns + [i]], minlength=len(REGIONS)).argmax()
        lab = new

    me.materials.clear()
    for name in REGIONS:
        m = bpy.data.materials.new(name)
        bsdf = m.node_tree.nodes['Principled BSDF']
        lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in pal[name]]
        bsdf.inputs['Base Color'].default_value = (*lin, 1)
        bsdf.inputs['Roughness'].default_value = 0.8
        me.materials.append(m)
    cut_regions(me, lab, nbr)
    return co, nrm, xr, zr


def cut_regions(me, lab, nbr, smooth=4):
    """Clean colour borders: smooth one field per region, then cut the mesh along the curve where the two
    strongest fields are equal, so each colour block is its own patch with a smooth edge (instead of
    whole triangles picking a colour, which left saw-tooth borders)."""
    n = len(REGIONS)
    f = np.eye(n, dtype=np.float32)[lab]  # one-hot per vertex
    for _ in range(smooth):
        f = np.stack([f[ns + [i]].mean(0) if ns else f[i] for i, ns in enumerate(nbr)])
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    field = {v: f[v.index] for v in bm.verts}
    best = lambda v: int(field[v].argmax())  # noqa: E731
    cuts = set()
    for e in list(bm.edges):
        a, b = e.verts
        ra, rb = best(a), best(b)
        if ra == rb:
            continue
        ga = field[a][ra] - field[a][rb]
        gb = field[b][ra] - field[b][rb]
        t = float(np.clip(ga / (ga - gb), 0.05, 0.95)) if ga != gb else 0.5
        _, nv = bmesh.utils.edge_split(e, a, t)
        field[nv] = field[a] * (1 - t) + field[b] * t
        cuts.add(nv)
    # join the two cut points inside every face the border crosses
    for face in list(bm.faces):
        vs = [v for v in face.verts if v in cuts]
        if len(vs) == 2 and not any(e.other_vert(vs[0]) is vs[1] for e in vs[0].link_edges):
            bmesh.ops.connect_verts(bm, verts=vs)
    for face in bm.faces:
        avg = np.mean([field[v] for v in face.verts if v not in cuts] or [field[v] for v in face.verts], 0)
        face.material_index = int(avg.argmax())
        face.smooth = True
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    print('regions: cut', len(cuts), 'border points')


# ---------------------------------------------------------------- face decal
def flatten_eyes(fox, bbox, w, h, face, iters=300):
    """The model carries no eyes: Hunyuan sculpts eyeballs and brow ridges, which the toon shading and ink
    lines turned into odd patterns under the (animated) eyes layer. Per eye patch, the depth (y) is filled
    in from the patch's rim like a membrane: each vertex repeatedly takes its neighbours' mean depth with
    the rim held fixed. That can never bulge past or sink below the rim (a fitted surface did bulge — "goggle
    eyes"). x/z stay put, so the decal UVs don't slide. The nose bridge and the muzzle below are left alone."""
    fu0, fv0, fu1, fv1 = face['rect']
    x0, y0, x1, y1 = bbox
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    xr, zr = (co[:, 0].min(), co[:, 0].max()), (co[:, 2].min(), co[:, 2].max())
    ax = (x0 + (co[:, 0] - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)) / w
    ay = (y1 - (co[:, 2] - zr[0]) / (zr[1] - zr[0]) * (y1 - y0)) / h
    rw, rh = fu1 - fu0, fv1 - fv0
    d_eye = rw / 2.3  # face rect: 2.3 eye distances wide, 1.8 tall, eyes 0.75 below its top
    ey = fv0 + 0.75 / 1.8 * rh
    front = np.array([v.normal.y < -0.1 for v in me.vertices])
    keep = (np.abs(ax - (fu0 + fu1) / 2) > d_eye * 0.18) & (ay < ey + rh * 0.24 / 1.8)  # off nose & muzzle
    inside = np.zeros(len(co), bool)
    for sx in (-1, 1):
        ex = (fu0 + fu1) / 2 + sx * d_eye / 2
        inside |= ((ax - ex) / (d_eye * 0.40)) ** 2 + ((ay - ey) / (rh * 0.42 / 1.8)) ** 2 < 1
    inside &= front & keep
    nbr = [[] for _ in me.vertices]
    for e in me.edges:
        i, j = e.vertices
        nbr[i].append(j)
        nbr[j].append(i)
    idx = np.nonzero(inside)[0]
    y = co[:, 1].copy()
    for _ in range(iters):
        y[idx] = [y[nbr[i]].mean() if nbr[i] else y[i] for i in idx]
    for i in idx:
        me.vertices[i].co.y = float(y[i])
    print('eyes: membrane-filled', len(idx), 'verts, depth change up to', round(float(np.abs(y - co[:, 1]).max()), 3))


def build_face(fox, bbox, w, h, xr, zr, face, name='Face', atlas='face_atlas.png', grid=None, lift=0.0025):
    """A decal patch over the front of the head, UV-mapped onto the "normal" cell of an atlas.
    Built twice: Face (brows, nose, mouth) and Eyes (its own layer, animated by the app), the eyes a hair
    further out so they always draw on top."""
    grid = grid or face
    fu0, fv0, fu1, fv1 = face['rect']  # normalised art coords, v from top
    me = fox.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    x0, y0, x1, y1 = bbox

    def to_art(c):
        ax = x0 + (c.x - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)
        ay = y1 - (c.z - zr[0]) / (zr[1] - zr[0]) * (y1 - y0)
        return ax / w, ay / h

    keep = []
    for f in bm.faces:
        if f.normal.y > -0.2:
            continue
        uv = [to_art(v.co) for v in f.verts]
        if all(fu0 - 0.02 <= a <= fu1 + 0.02 and fv0 - 0.02 <= b <= fv1 + 0.02 for a, b in uv):
            keep.append(f)
    # the face patch = front-most layer only (ignore chest faces hidden behind the chin etc.)
    face_bm = bmesh.new()
    vmap = {}
    for f in keep:
        vs = []
        for v in f.verts:
            if v.index not in vmap:
                vmap[v.index] = face_bm.verts.new(v.co + v.normal * lift)
            vs.append(vmap[v.index])
        try:
            face_bm.faces.new(vs)
        except ValueError:
            pass
    uvl = face_bm.loops.layers.uv.new('UV')
    cols, rows = grid['cols'], grid['rows']
    cell = grid['cells']['normal']
    cu, cv = cell % cols, cell // cols
    for f in face_bm.faces:
        f.smooth = True
        for loop in f.loops:
            a, b = to_art(loop.vert.co)
            su = (a - fu0) / (fu1 - fu0)
            sv = (b - fv0) / (fv1 - fv0)
            # cell (cu, cv) in a cols×rows atlas; glTF/three flip v, so measure from the top
            loop[uvl].uv = ((cu + su) / cols, 1 - (cv + sv) / rows)
    fme = bpy.data.meshes.new(name)
    face_bm.to_mesh(fme)
    face_bm.free()
    bm.free()
    obj = bpy.data.objects.new(name, fme)
    bpy.context.collection.objects.link(obj)

    mat = bpy.data.materials.new(name + 'Mat')
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.abspath(os.path.join(os.path.dirname(FACE), atlas)))
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else None
    fme.materials.append(mat)
    return obj


# ---------------------------------------------------------------- rig
def smooth01(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- 3D nose and mouth
MOUTH_COLORS = {'Nose': (0.17, 0.10, 0.09), 'MouthIn': (0.66, 0.22, 0.34)}  # mouth: deep rose pink


def flat_material(name):
    m = bpy.data.materials.new(name)
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in MOUTH_COLORS[name]]
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lin, 1)
    return m


def build_mouth(fox, arm, neck, head_bone='head'):
    """Nose and mouth as small 3D parts on the muzzle (a projected decal slid up the snout seen from the
    side). Found from the shape itself: the nose sits on the front-most point of the head's centre line,
    the mouth just under it, both following the muzzle surface, parented to the head bone.
    Mouth: a flat deep-pink patch on the surface, hidden in the basis; shape keys Open / Happy / Smile /
    Sad / O / Angry give its expressions. There is no mouth line — a shut mouth is just the muzzle."""
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    nrm = np.array([v.normal[:] for v in me.vertices])
    head = (co[:, 2] > neck) & (nrm[:, 1] < 0)
    centre = head & (np.abs(co[:, 0]) < 0.02) & (co[:, 2] < neck + 0.25)
    tip = co[centre][co[centre, 1].argmin()]  # front-most point of the snout

    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])

    def surface_y(x, z):  # where a ray from straight in front first meets the muzzle
        hit = tree.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))[0]
        return float(hit.y) if hit is not None else float(tip[1])

    parts = []
    # nose: a soft rounded triangle sitting on the tip
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=(0, tip[1] + 0.006, tip[2] + 0.004))
    nose = bpy.context.object
    nose.scale = (0.020, 0.018, 0.018)
    bpy.ops.object.transform_apply(scale=True)
    for v in nose.data.vertices:  # narrower at the bottom: an upside-down rounded triangle
        v.co.x *= 1.0 - 0.35 * max(0.0, -v.co.z / 0.018)
    nose.name = nose.data.name = 'Nose'
    nose.data.materials.append(flat_material('Nose'))
    parts.append(nose)

    zc = tip[2] - 0.022  # mouth top: just under the nose (no mouth line: shut = plain muzzle)

    # mouth: one deep-pink patch laid on the muzzle surface (ray-cast point by point, so it never bulges),
    # hanging from just under the nose. Each expression is a shape key that reshapes its outline; the basis
    # is a hidden sliver (shut = plain muzzle). A shape = centre line c(u) and thickness h(u) across the
    # width (u = -1 … 1), plus its half-width w; the app mixes them by mood.
    top = zc - 0.002
    W, H = 0.020, 0.017
    s1 = lambda u: math.sqrt(max(0.0, 1 - u * u))  # noqa: E731
    SHAPES = {  # name: (half-width, centre line, thickness)
        'Open':  (W,        lambda u: -H / 2,                      lambda u: H * s1(u)),           # talking, yawning
        'Happy': (W * 1.1,  lambda u: -H * 0.5 * s1(u) + H * 0.05 * u * u,
                            lambda u: H * s1(u) + H * 0.1 * u * u),                                  # D: flat top, round bottom
        'Smile': (W * 0.9,  lambda u: -H * 0.28 * (1 - u * u) - H * 0.02, lambda u: H * 0.38 * s1(u)),  # ‿ crescent
        'Sad':   (W * 0.75, lambda u: -H * 0.42 + H * 0.28 * (1 - u * u), lambda u: H * 0.34 * s1(u)),   # ︵
        'O':     (W * 0.55, lambda u: -H * 0.42,                   lambda u: H * 0.75 * s1(u)),      # little round o
        'Angry': (W * 0.8,  lambda u: -H * 0.2 - H * 0.18 * u * u, lambda u: H * 0.3 * s1(u)),       # flat, corners down
    }
    shut = (W * 0.3, lambda u: -H * 0.05, lambda u: H * 0.005)
    rings, segs = 5, 32

    def place(shape, r, ang):
        """Polar grid point (r, ang) of the unit disc → a point of this shape's outline area."""
        w, c, h = shape
        u, v = r * math.cos(ang), r * math.sin(ang)  # v: -1 bottom … 1 top, scaled to the disc's height at u
        t = v / (s1(u) or 1)
        x = w * u
        z = top + c(u) + 0.5 * h(u) * t
        return Vector((x, surface_y(x, z) - 0.0008, z))

    pts = [(0.0, 0.0)] + [(ri / rings, 2 * math.pi * si / segs) for ri in range(1, rings + 1) for si in range(segs)]
    bm = bmesh.new()
    vs = [bm.verts.new(place(shut, r, ang)) for r, ang in pts]
    ring = lambda ri, si: vs[1 + (ri - 1) * segs + si % segs]  # noqa: E731
    for si in range(segs):
        bm.faces.new((vs[0], ring(1, si), ring(1, si + 1)))
    for ri in range(1, rings):
        for si in range(segs):
            bm.faces.new((ring(ri, si), ring(ri + 1, si), ring(ri + 1, si + 1), ring(ri, si + 1)))
    mouth_me = bpy.data.meshes.new('Mouth')
    bm.to_mesh(mouth_me)
    bm.free()
    mouth = bpy.data.objects.new('Mouth', mouth_me)
    bpy.context.collection.objects.link(mouth)
    mouth_me.materials.append(flat_material('MouthIn'))
    for p in mouth_me.polygons:
        p.use_smooth = True
    mouth.shape_key_add(name='Basis')
    for name, shape in SHAPES.items():
        key = mouth.shape_key_add(name=name)
        key.value = 0  # exported as the default morph weight: rest = shut
        for i, (r, ang) in enumerate(pts):
            key.data[i].co = place(shape, r, ang)
    parts.append(mouth)

    for o in parts:
        make_fox.attach(o, arm, head_bone)
    print('mouth: nose tip at', tuple(round(float(c), 3) for c in tip))


def build_rig(fox, decals, co, chin_z=None):
    """Bones from the model's own proportions: neck = chin height when known (standing), else the
    narrowest band between chest and head (sitting)."""
    if chin_z is not None:
        neck = float(chin_z) - 0.02
    else:
        zs = np.linspace(0.25, 0.6, 36)
        width = [np.ptp(co[np.abs(co[:, 2] - z) < 0.01, 0]) if (np.abs(co[:, 2] - z) < 0.01).any() else 9 for z in zs]
        neck = float(zs[int(np.argmin(width))])
    leg_top = 0.30 if POSE == 'standing' else 0.24
    head_c = neck + 0.25
    ear_z = 0.80
    ear_x = 0.5 * np.ptp(co[np.abs(co[:, 2] - 0.86) < 0.02, 0]) * 0.55 if (np.abs(co[:, 2] - 0.86) < 0.02).any() else 0.18
    mid = co[(np.abs(co[:, 0]) < 0.06) & (co[:, 2] > 0.12) & (co[:, 2] < neck)]
    rump = mid[mid[:, 1].argmax()]  # back-most point of the body on the centre line
    low = co[co[:, 2] < 0.08]
    ymin, ymax = low[:, 1].min(), low[:, 1].max()
    y_front = ymin + 0.40 * (ymax - ymin)  # front paws are in front of this; haunches behind y_back
    y_back = ymin + 0.60 * (ymax - ymin)
    paws = {}
    for s_, sx in (('L', 1), ('R', -1)):
        for leg, sel in (('F', low[:, 1] < y_front), ('B', low[:, 1] > y_back)):
            pts = low[sel & (low[:, 0] * sx > 0.02)]
            paws[f'leg.{leg}{s_}'] = pts.mean(0) if len(pts) else np.array([0.1 * sx, ymin if leg == 'F' else ymax, 0])

    arm_data = bpy.data.armatures.new('FoxRig')
    arm = bpy.data.objects.new('FoxRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head, b.tail, b.roll = head, tail, 0
        if parent:
            b.parent = eb[parent]

    bone('root', (0, 0, 0), (0, 0, 0.1))
    bone('body', (0, float(rump[1]) * 0.6, float(rump[2])), (0, -0.05, neck), 'root')
    bone('head', (0, 0, neck), (0, 0, head_c + 0.2), 'body')
    for s, x in (('L', 1), ('R', -1)):
        bone(f'ear.{s}', (ear_x * x, 0, ear_z), (ear_x * x * 1.3, 0, 1.0), 'head')
    for name, p in paws.items():  # pointing down: rotating about local X swings the paw fore/aft
        bone(name, (p[0], p[1], leg_top), (p[0], p[1], 0.0), 'body')
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'

    for obj in (fox, *decals):
        vco = np.array([v.co[:] for v in obj.data.vertices])
        wh = smooth01(neck - 0.06, neck + 0.06, vco[:, 2])
        wel = smooth01(ear_z - 0.04, ear_z + 0.04, vco[:, 2]) * (vco[:, 0] > 0.04)
        wer = smooth01(ear_z - 0.04, ear_z + 0.04, vco[:, 2]) * (vco[:, 0] < -0.04)
        wear = wel + wer
        low_w = smooth01(leg_top, leg_top * 0.4, vco[:, 2]) * (1 - wh)
        wf = smooth01(y_front + 0.04, y_front - 0.04, vco[:, 1]) * low_w
        wb = smooth01(y_back - 0.04, y_back + 0.04, vco[:, 1]) * low_w
        legs = {'leg.FL': wf * (vco[:, 0] > 0.015), 'leg.FR': wf * (vco[:, 0] < -0.015),
                'leg.BL': wb * (vco[:, 0] > 0.015), 'leg.BR': wb * (vco[:, 0] < -0.015)}
        wlegs = sum(legs.values())
        weights = {'body': 1 - wh - wlegs, 'head': wh * (1 - wear), 'ear.L': wh * wel, 'ear.R': wh * wer, **legs}
        for name, ws in weights.items():
            g = obj.vertex_groups.new(name=name)
            for i, wv in enumerate(ws):
                if wv > 1e-3:
                    g.add([i], float(wv), 'REPLACE')
        obj.parent = arm
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm

    anchor = bpy.data.objects.new('TailAnchor', None)
    if POSE == 'standing':
        # tailbone: on the surface of the rump, a little above its back-most point, so the tail's orange
        # base (B end) sits on the body and nothing of it is buried inside
        tz = float(rump[2]) + 0.04
        ring = mid[np.abs(mid[:, 2] - tz) < 0.015]
        ty = float(ring[:, 1].max()) if len(ring) else float(rump[1])
        anchor.location = (0, ty - 0.015, tz)
    else:
        anchor.location = (0, float(rump[1]) - 0.03, 0.12)
    bpy.context.collection.objects.link(anchor)
    make_fox.attach(anchor, arm, 'body')
    return arm, neck


def make_actions(arm):
    """Same clip names as the procedural fox, plus Walk (a seated waddle: paws step, body rocks)."""
    arm.animation_data_create()
    pb = arm.pose.bones
    D = math.radians

    def act(name, keys):
        a = bpy.data.actions.new(name)
        a.use_fake_user = True
        arm.animation_data.action = a
        for f, bone, prop, val in keys:
            setattr(pb[bone], prop, val)
            pb[bone].keyframe_insert(prop, frame=f)
        for b in pb:
            b.location, b.rotation_euler, b.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, a)
        track.mute = True

    act('Idle', [k for f, s, r in ((1, 1.0, 0), (25, 1.03, D(-3)), (49, 1.0, 0))
                 for k in ((f, 'body', 'scale', (s, 1, s)), (f, 'head', 'rotation_euler', (r, 0, 0)))])
    act('Hop', [(f, 'root', 'location', (0, z, 0)) for f, z in ((1, 0), (7, 0.06), (13, 0))])
    jump = []
    for f, z, sq in ((1, 0, 0.9), (5, 0.16, 1.08), (10, 0.26, 1.0), (15, 0.16, 1.05), (19, 0, 0.88), (23, 0, 1.0)):
        jump += [(f, 'root', 'location', (0, z, 0)), (f, 'root', 'scale', (1 / sq ** 0.5, sq, 1 / sq ** 0.5))]
    act('Jump', jump)
    act('Tilt', [(f, 'head', 'rotation_euler', (0, 0, r)) for f, r in ((1, 0), (8, D(-15)), (40, D(-15)), (48, 0))])
    if POSE == 'standing':
        standing_actions(act, D)
        return
    act('Eat', [(f, 'head', 'rotation_euler', (r, 0, 0)) for f, r in ((1, D(6)), (7, D(18)), (13, D(6)))])
    sleep = []
    for f, s in ((1, 1.0), (37, 1.04), (73, 1.0)):
        sleep += [(f, 'root', 'scale', (1, 0.92, 1)), (f, 'body', 'scale', (s, 1, s)),
                  (f, 'head', 'rotation_euler', (D(18), 0, D(10)))]
    act('Sleep', sleep)
    walk = []  # 16-frame cycle, two steps: left paw on 1–9, right paw on 9–17
    for f, z, roll in ((1, 0, 6), (5, 0.035, 0), (9, 0, -6), (13, 0.035, 0), (17, 0, 6)):
        walk += [(f, 'root', 'location', (0, z, 0)), (f, 'root', 'rotation_euler', (0, 0, D(roll))),
                 (f, 'head', 'rotation_euler', (0, 0, D(-roll * 0.5)))]
    for f, l, r in ((1, 0, 0), (5, -35, 0), (9, 0, 0), (13, 0, -35), (17, 0, 0)):
        walk += [(f, 'leg.FL', 'rotation_euler', (D(l), 0, 0)), (f, 'leg.FR', 'rotation_euler', (D(r), 0, 0)),
                 (f, 'leg.BL', 'rotation_euler', (D(-r * 0.35), 0, 0)), (f, 'leg.BR', 'rotation_euler', (D(-l * 0.35), 0, 0))]
    act('Walk', walk)


def standing_actions(act, D):
    """Four-legged clips: diagonal-pair walk, head-down eat, lie-down sleep."""
    walk = []  # 16 frames: FL+BR swing forward while FR+BL swing back, then swap
    for f, a, z in ((1, 25, 0), (5, 0, 0.025), (9, -25, 0), (13, 0, 0.025), (17, 25, 0)):
        walk += [(f, 'leg.FL', 'rotation_euler', (D(-a), 0, 0)), (f, 'leg.BR', 'rotation_euler', (D(-a), 0, 0)),
                 (f, 'leg.FR', 'rotation_euler', (D(a), 0, 0)), (f, 'leg.BL', 'rotation_euler', (D(a), 0, 0)),
                 (f, 'root', 'location', (0, z, 0))]
    act('Walk', walk)
    act('Eat', [(f, 'head', 'rotation_euler', (r, 0, 0)) for f, r in ((1, D(25)), (7, D(40)), (13, D(25)))])
    sleep = []
    for f, s in ((1, 1.0), (37, 1.04), (73, 1.0)):
        sleep += [(f, 'root', 'location', (0, -0.14, 0)), (f, 'body', 'scale', (s, 1, s)),
                  (f, 'head', 'rotation_euler', (D(20), 0, D(8)))]
        for leg in ('leg.FL', 'leg.FR'):
            sleep += [(f, leg, 'rotation_euler', (D(-80), 0, 0))]
        for leg in ('leg.BL', 'leg.BR'):
            sleep += [(f, leg, 'rotation_euler', (D(80), 0, 0))]
    act('Sleep', sleep)


def add_tail_anchor(fox, arm, bone, neck):
    """Tail root on the rump surface on the centre line, a little above its back-most point (the tailbone)."""
    co = np.array([v.co[:] for v in fox.data.vertices])
    mid = co[(np.abs(co[:, 0]) < 0.06) & (co[:, 2] > 0.12) & (co[:, 2] < neck)]
    rump = mid[mid[:, 1].argmax()]
    tz = float(rump[2]) + 0.04
    ring = mid[np.abs(mid[:, 2] - tz) < 0.015]
    ty = float(ring[:, 1].max()) if len(ring) else float(rump[1])
    anchor = bpy.data.objects.new('TailAnchor', None)
    anchor.location = (0, ty - 0.015, tz)
    bpy.context.collection.objects.link(anchor)
    make_fox.attach(anchor, arm, bone)


# ---------------------------------------------------------------- main
def main():
    face_info = json.load(open(FACE))
    fox = import_clean()
    px, bbox = load_art(ART)
    pal = palette(px)
    print('palette', {k: tuple(round(c, 2) for c in v) for k, v in pal.items()})
    h, w = px.shape[:2]
    side = load_art(SIDE) if SIDE else None
    back = load_art(BACK) if BACK else None
    if side is not None:
        fit_profile(fox, side)  # the side art says how far the nose sticks out
    if 'eyes' in face_info:
        flatten_eyes(fox, bbox, w, h, face_info, EYE_ITERS)  # eyes live in their own animated layer, not on the body
    else:
        sculpt_face(fox, bbox, w, h, face_info)
    co, _, xr, zr = paint_regions(fox, px, bbox, pal, side, back, face_info)
    decals = [build_face(fox, bbox, w, h, xr, zr, face_info)]
    if 'eyes' in face_info:
        decals.append(build_face(fox, bbox, w, h, xr, zr, face_info, 'Eyes', 'eyes_atlas.png', face_info['eyes'], 0.004))
    chin_z = None
    if POSE == 'standing':  # chin = bottom of the face rect, mapped from art rows to model height
        x0, y0, x1, y1 = bbox
        chin_z = zr[0] + (y1 - face_info['rect'][3] * h) / (y1 - y0) * (zr[1] - zr[0])
    if POSE == 'standing':  # canine skeleton with leg IK; decals ride the head bone
        arm, quad = quad_rig.build(fox, chin_z)
        neck, head_bone = chin_z - 0.02, quad_rig.HEAD
        for d in decals:
            make_fox.attach(d, arm, head_bone)
        add_tail_anchor(fox, arm, quad_rig.HIPS, neck)
    else:
        arm, neck = build_rig(fox, decals, co, chin_z)
        head_bone, quad = 'head', None
    if 'eyes' in face_info:  # layered faces carry no nose/mouth in their decals: 3D parts instead
        build_mouth(fox, arm, neck, head_bone)
    print('neck z', round(neck, 3))
    make_fox.COLORS.update(Fur=pal['Fur'], Cream=pal['Cream'])
    for n in ('Fur', 'Cream'):  # tail must reuse the body's region materials
        bpy.data.materials[n].name = n
    make_fox.build_tail()
    # park the tail template on the hip anchor so any glTF viewer shows it in place (the app clones it there)
    tail, anchor = bpy.data.objects['Tail'], bpy.data.objects['TailAnchor']
    bpy.context.view_layer.update()
    tail.parent = anchor
    tail.matrix_world = anchor.matrix_world.copy()
    if POSE == 'standing':  # base on the tailbone, tail leaning back then curling up (fox3d.js uses the same tilt)
        tail.rotation_euler.x = -0.7
    if quad:
        quad_rig.make_actions(arm, quad)
    else:
        make_actions(arm)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT), export_format='GLB', export_apply=False, export_yup=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True,
        export_def_bones=False, export_force_sampling=True, export_image_format='WEBP',
    )
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    print('wrote', OUT, tris, 'tris', os.path.getsize(OUT) // 1024, 'KB')


main()

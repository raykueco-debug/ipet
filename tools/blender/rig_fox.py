"""Turn a Hunyuan3D shape (no texture) into the app's fox: normalise, decimate, project the 2D art on it.

usage: blender -b --factory-startup --python tools/blender/rig_fox.py -- RAW.glb ART.png OUT.glb [--faces 30000] [--blend out.blend]

Texture = one atlas, left half the art as-is (front-facing faces), right half a feature-less copy
(large median filter: fur colours without eyes/mouth) for faces that look away from the camera.
UVs are a straight front projection, so the face lands exactly where it is in the art.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
RAW, ART, OUT = argv[:3]
FACES = int(argv[argv.index('--faces') + 1]) if '--faces' in argv else 30000
BLEND = argv[argv.index('--blend') + 1] if '--blend' in argv else None


def load_art(path):
    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # bottom-up rows
    a = px[..., 3]
    ys, xs = np.nonzero(a > 0.5)
    bbox = xs.min() / w, ys.min() / h, (xs.max() + 1) / w, (ys.max() + 1) / h  # u0 v0 u1 v1
    return px, bbox


def featureless(px, k=31):
    """Median-ish blur that keeps big colour areas and drops small features (eyes, mouth, nose)."""
    rgb, a = px[..., :3], px[..., 3:4]
    # fill transparent pixels with nearby colour first so edges don't go white
    out = rgb.copy()
    pad = k // 2
    h, w = a.shape[:2]
    p = np.pad(out * a, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    pa = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    stack, wts = [], []
    step = max(1, k // 6)
    for dy in range(0, k, step):
        for dx in range(0, k, step):
            stack.append(p[dy:dy + h, dx:dx + w])
            wts.append(pa[dy:dy + h, dx:dx + w])
    stack, wts = np.stack(stack), np.stack(wts)
    # weighted median per channel ≈ take median over samples with alpha
    masked = np.where(wts > 0.5, stack / np.maximum(wts, 1e-3), np.nan)
    med = np.nanmedian(masked, axis=0)
    med = np.where(np.isnan(med), rgb, med)
    return np.concatenate([med, np.ones_like(a)], axis=-1)


def main():
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

    # keep the biggest connected piece only (Hunyuan sometimes leaves floaters)
    bm = bmesh.new()
    bm.from_mesh(fox.data)
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
    bm.to_mesh(fox.data)
    bm.free()

    # normalise: feet on z=0, centred, 1 unit tall
    co = np.array([v.co[:] for v in fox.data.vertices])
    lo, hi = co.min(0), co.max(0)
    s = 1.0 / (hi[2] - lo[2])
    for v in fox.data.vertices:
        v.co = Vector(((v.co.x - (lo[0] + hi[0]) / 2) * s, (v.co.y - (lo[1] + hi[1]) / 2) * s, (v.co.z - lo[2]) * s))

    if len(fox.data.polygons) > FACES:
        mod = fox.modifiers.new('dec', 'DECIMATE')
        mod.ratio = FACES / len(fox.data.polygons)
        bpy.ops.object.modifier_apply(modifier='dec')
    for p in fox.data.polygons:
        p.use_smooth = True

    # ---- texture atlas
    px, (u0, v0, u1, v1) = load_art(ART)
    h, w = px.shape[:2]
    back = featureless(px)
    atlas = np.concatenate([px, back], axis=1)
    atlas[..., 3] = 1
    img = bpy.data.images.new('FoxTex', w * 2, h, alpha=False)
    img.pixels[:] = atlas.ravel()
    img.filepath_raw = os.path.splitext(os.path.abspath(OUT))[0] + '_tex.png'
    img.file_format = 'PNG'
    img.save()

    # ---- front projection UVs (camera looks along +Y at the -Y face)
    co = np.array([v.co[:] for v in fox.data.vertices])
    xmin, xmax, zmin, zmax = co[:, 0].min(), co[:, 0].max(), co[:, 2].min(), co[:, 2].max()
    uv = fox.data.uv_layers.new(name='UV')
    for p in fox.data.polygons:
        facing_front = p.normal.y < -0.4  # only faces that look at the camera get the eyes
        for li in p.loop_indices:
            vco = fox.data.vertices[fox.data.loops[li].vertex_index].co
            u = u0 + (vco.x - xmin) / (xmax - xmin) * (u1 - u0)
            v = v0 + (vco.z - zmin) / (zmax - zmin) * (v1 - v0)
            if facing_front:
                uv.data[li].uv = (u * 0.5, v)
            else:  # back half of the atlas, mirrored so left/right fur stays on its side
                uv.data[li].uv = (0.5 + u * 0.5, v)

    mat = bpy.data.materials.new('FoxMat')
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.8
    fox.data.materials.clear()
    fox.data.materials.append(mat)

    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', export_yup=True)
    print('wrote', OUT, len(fox.data.polygons), 'faces', os.path.getsize(OUT) // 1024, 'KB')


main()

"""Build the 3D prototype fox in Blender and export assets/fox3d/fox.glb.

usage: blender -b --factory-startup --python tools/blender/make_fox.py [-- out.glb] [--blend out.blend]

Everything is procedural so the model can be regenerated after tweaking numbers here.
- FoxRig: root / body / head / ear.L / ear.R / leg.* bones; body parts are rigidly bone-parented.
- Eye.L / Eye.R / Mouth carry shape keys (→ glTF morph targets): Blink, Happy, Wide, Angry / Open.
- Blush.L / Blush.R: cheek discs the app shows for "love".
- TailAnchor: empty on the hip; the app clones Tail (own 5-bone skinned rig) 1–9 times onto it.
- Actions (→ glTF animations): Idle, Hop, Jump, Eat, Sleep, Tilt.
Blender: Z up, fox faces -Y. glTF: Y up, fox faces +Z.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = next((a for a in argv if a.endswith('.glb')), os.path.join(ROOT, 'assets', 'fox3d', 'fox.glb'))
BLEND = argv[argv.index('--blend') + 1] if '--blend' in argv else None

COLORS = {
    'Fur': (0.94, 0.54, 0.24), 'Cream': (1.0, 0.96, 0.90), 'Dark': (0.29, 0.18, 0.16),
    'Eye': (0.13, 0.08, 0.07), 'Shine': (1.0, 1.0, 1.0), 'Pink': (0.97, 0.70, 0.66),
    'Mouth': (0.62, 0.25, 0.24), 'Blush': (1.0, 0.55, 0.55),
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    rgb = [srgb_to_linear(c) for c in COLORS[name]]
    bsdf = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = 0.6
    m.diffuse_color = (*rgb, 1)
    return m


def finish(obj, name, mat):
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material(mat))
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def ball(name, loc, scale, mat, rot=(0, 0, 0), segs=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(o, name, mat)


def cone(name, loc, rot, r, depth, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r, radius2=0, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, name, mat)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- armature
def build_rig():
    arm_data = bpy.data.armatures.new('FoxRig')
    arm = bpy.data.objects.new('FoxRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head, b.tail = head, tail
        b.roll = 0
        if parent:
            b.parent = eb[parent]
        return b

    bone('root', (0, 0, 0), (0, 0, 0.1))
    bone('body', (0, 0.2, 0.3), (0, -0.15, 0.38), 'root')
    bone('head', (0, -0.12, 0.5), (0, -0.12, 0.8), 'body')
    for s, x in (('L', 1), ('R', -1)):
        bone(f'ear.{s}', (0.16 * x, -0.12, 0.86), (0.22 * x, -0.10, 1.08), 'head')
        bone(f'leg.F{s}', (0.12 * x, -0.12, 0.26), (0.12 * x, -0.12, 0.02), 'body')
        bone(f'leg.B{s}', (0.13 * x, 0.20, 0.26), (0.13 * x, 0.20, 0.02), 'body')
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    return arm


def attach(obj, arm, bone):
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = mw


# ---------------------------------------------------------------- body parts
def build_body(arm):
    parts = {
        'body': [
            ball('Body', (0, 0.05, 0.32), (0.24, 0.30, 0.23), 'Fur'),
            ball('Chest', (0, -0.15, 0.37), (0.15, 0.10, 0.17), 'Cream'),
        ],
        'head': [
            ball('Head', (0, -0.12, 0.68), (0.30, 0.26, 0.25), 'Fur'),
            ball('Cheek.L', (0.17, -0.24, 0.59), (0.14, 0.11, 0.10), 'Cream'),
            ball('Cheek.R', (-0.17, -0.24, 0.59), (0.14, 0.11, 0.10), 'Cream'),
            ball('Muzzle', (0, -0.31, 0.60), (0.13, 0.11, 0.09), 'Cream'),
            ball('Nose', (0, -0.415, 0.645), (0.035, 0.025, 0.026), 'Eye', segs=16),
        ],
    }
    for s, x in (('L', 1), ('R', -1)):
        tilt = (math.radians(-6), math.radians(18 * x), 0)
        ear = cone(f'Ear.{s}', (0.18 * x, -0.11, 0.95), tilt, 0.10, 0.28, 'Fur')
        ear.data.materials.append(material('Dark'))
        for p in ear.data.polygons:  # dark ear tips
            if p.center.z > 0.05:
                p.material_index = 1
        inner = cone(f'EarIn.{s}', (0.18 * x, -0.145, 0.935), tilt, 0.06, 0.19, 'Pink')
        inner.scale.y = 0.35
        parts[f'ear.{s}'] = [ear, inner]
        for leg, y, z in (('F', -0.12, 0.13), ('B', 0.20, 0.13)):
            xx = (0.12 if leg == 'F' else 0.13) * x
            parts[f'leg.{leg}{s}'] = [
                ball(f'Leg.{leg}{s}', (xx, y, z), (0.07, 0.075, 0.13), 'Fur', segs=20),
                ball(f'Paw.{leg}{s}', (xx, y - 0.02, 0.035), (0.075, 0.09, 0.045), 'Dark', segs=20),
            ]
    for bone, objs in parts.items():
        for o in objs:
            attach(o, arm, bone)


def shape_keys(obj, keys):
    """keys: {name: fn(co: Vector, is_shine: bool) -> Vector} in object space."""
    obj.shape_key_add(name='Basis')
    shine = obj.vertex_groups.get('shine')
    sh = {v.index for v in obj.data.vertices if shine and any(g.group == shine.index for g in v.groups)}
    for name, fn in keys.items():
        k = obj.shape_key_add(name=name)
        for v in obj.data.vertices:
            k.data[v.index].co = fn(v.co.copy(), v.index in sh)


def build_face(arm):
    for s, x in (('L', 1), ('R', -1)):
        cx, cy, cz = 0.11 * x, -0.355, 0.715
        eye = ball(f'Eye.{s}', (cx, cy, cz), (0.05, 0.03, 0.068), 'Eye')
        shine = ball('shine', (cx + 0.016 * x, cy - 0.028, cz + 0.025), (0.017, 0.008, 0.017), 'Shine', segs=12)
        shine.vertex_groups.new(name='shine').add(range(len(shine.data.vertices)), 1.0, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        shine.select_set(True)
        eye.select_set(True)
        bpy.context.view_layer.objects.active = eye
        bpy.ops.object.join()
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        c = Vector((cx, cy, cz)) - eye.location  # eye centre in object space

        def hide(co):  # tuck the highlight inside the eye
            return c + (co - c) * 0.2 + Vector((0, 0.02, 0))

        def blink(co, is_shine):  # closed: thin downward-curved line ( ‿ )
            if is_shine:
                return hide(co)
            u = (co.x - c.x) / 0.05
            return Vector((co.x, co.y, c.z - 0.012 + (co.z - c.z) * 0.12 - 0.02 * (1 - u * u)))

        def happy(co, is_shine):  # ^ ^
            if is_shine:
                return hide(co)
            u = (co.x - c.x) / 0.05
            return Vector((co.x, co.y, c.z - 0.01 + (co.z - c.z) * 0.15 + 0.03 * (1 - u * u)))

        def wide(co, is_shine):
            return c + (co - c) * Vector((1.12, 1.0, 1.18))

        def angry(co, is_shine):  # inner-top corner pulled down
            d = co - c
            inner = max(0.0, -d.x * x / 0.05 + 0.3)
            return co - Vector((0, 0, 0.035 * inner * max(0.0, d.z / 0.068))) if not is_shine else co

        shape_keys(eye, {'Blink': blink, 'Happy': happy, 'Wide': wide, 'Angry': angry})
        attach(eye, arm, 'head')

        blush = ball(f'Blush.{s}', (0.19 * x, -0.31, 0.60), (0.05, 0.012, 0.03), 'Blush', rot=(0, 0, math.radians(-30 * x)), segs=16)
        attach(blush, arm, 'head')

    mouth = ball('Mouth', (0, -0.418, 0.578), (0.032, 0.014, 0.008), 'Mouth', segs=20)
    mouth.data.materials.append(material('Dark'))
    mc = mouth.location.copy()

    def open_(co, _):
        d = co - mc
        return mc + Vector((d.x * 1.3, d.y * 1.2, d.z * 4.5)) + Vector((0, 0.004, -0.018))

    def smile(co, _):
        d = co - mc
        u = d.x / 0.032
        return co + Vector((d.x * 0.3, 0, 0.012 * u * u))

    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    mc = Vector((0, 0, 0))
    shape_keys(mouth, {'Open': open_, 'Smile': smile})
    attach(mouth, arm, 'head')

    anchor = bpy.data.objects.new('TailAnchor', None)
    anchor.location = (0, 0.30, 0.28)
    bpy.context.collection.objects.link(anchor)
    attach(anchor, arm, 'body')


# ---------------------------------------------------------------- tail (own rig, cloned by the app)
TAIL_PTS = [Vector(p) for p in [(0, 0, 0), (0, 0.10, 0.07), (0, 0.18, 0.19), (0, 0.22, 0.33), (0, 0.20, 0.47), (0, 0.13, 0.58)]]
TAIL_BONES = 5


def tail_point(t):
    """Catmull-Rom through TAIL_PTS, t in [0, 1]."""
    n = len(TAIL_PTS) - 1
    f = min(t * n, n - 1e-6)
    i = int(f)
    u = f - i
    p0, p1, p2, p3 = (TAIL_PTS[max(0, min(n, j))] for j in (i - 1, i, i + 1, i + 2))
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


def tail_radius(t):
    return (0.035 + 0.115 * math.sin(math.pi * t ** 0.75)) * (1 - t ** 5) ** 0.6


def build_tail():
    arm_data = bpy.data.armatures.new('TailRig')
    arm = bpy.data.objects.new('Tail', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    prev = None
    for i in range(TAIL_BONES):
        b = arm_data.edit_bones.new(f'tail{i}')
        b.head, b.tail = tail_point(i / TAIL_BONES), tail_point((i + 1) / TAIL_BONES)
        b.roll = 0
        if prev:
            b.parent = prev
            b.use_connect = True
        prev = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'

    rings, segs = 48, 20
    bm = bmesh.new()
    X = Vector((1, 0, 0))
    ring_verts, ts = [], []
    for r in range(rings + 1):
        t = r / rings
        p = tail_point(t)
        tan = (tail_point(min(1, t + 0.01)) - tail_point(max(0, t - 0.01))).normalized()
        nrm = tan.cross(X).normalized()
        rad = tail_radius(t)
        row = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            row.append(bm.verts.new(p + rad * (math.cos(a) * X + math.sin(a) * nrm)))
        ring_verts.append(row)
        ts.append(t)
    tip = bm.verts.new(tail_point(1.0))
    faces = []
    for r in range(rings):
        for s in range(segs):
            a, b = ring_verts[r][s], ring_verts[r][(s + 1) % segs]
            c, d = ring_verts[r + 1][(s + 1) % segs], ring_verts[r + 1][s]
            faces.append((bm.faces.new((a, b, c, d)), ts[r]))
    for s in range(segs):
        faces.append((bm.faces.new((ring_verts[rings][s], ring_verts[rings][(s + 1) % segs], tip)), 1.0))
    bm.faces.new(list(reversed(ring_verts[0])))
    for f, t in faces:
        f.material_index = 1 if t >= 0.74 else 0
        f.smooth = True
    me = bpy.data.meshes.new('TailMesh')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material('Fur'))
    me.materials.append(material('Cream'))
    mesh = bpy.data.objects.new('TailMesh', me)
    bpy.context.collection.objects.link(mesh)
    mesh.parent = arm

    groups = [mesh.vertex_groups.new(name=f'tail{i}') for i in range(TAIL_BONES)]
    for v in me.vertices:  # weight by closest param along the chain, blended between neighbours
        t = min(range(rings + 1), key=lambda r: (tail_point(r / rings) - v.co).length_squared) / rings
        f = t * TAIL_BONES - 0.5
        i = max(0, min(TAIL_BONES - 1, math.floor(f)))
        w = max(0.0, min(1.0, f - i))
        groups[i].add([v.index], 1 - w, 'REPLACE')
        if i + 1 < TAIL_BONES and w > 0:
            groups[i + 1].add([v.index], w, 'REPLACE')
    mod = mesh.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


# ---------------------------------------------------------------- actions
def make_actions(arm):
    arm.animation_data_create()
    pb = arm.pose.bones
    D = math.radians

    def act(name, frames, keys):
        a = bpy.data.actions.new(name)
        a.use_fake_user = True
        arm.animation_data.action = a
        for f, bone, prop, val in keys:
            setattr(pb[bone], prop, val)
            pb[bone].keyframe_insert(prop, frame=f)
        for b in pb:  # back to rest so the next action starts clean
            b.location, b.rotation_euler, b.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, a)
        track.mute = True

    # bone local axes: Y runs along the bone. root/head point up, body points forward.
    idle = []
    for f, s in ((1, 1.0), (25, 1.035), (49, 1.0)):
        idle += [(f, 'body', 'scale', (s, 1, s))]
    for f, r in ((1, 0), (25, D(-3)), (49, 0)):
        idle += [(f, 'head', 'rotation_euler', (r, 0, 0))]
    act('Idle', 48, idle)

    hop = []
    for f, z in ((1, 0), (7, 0.08), (13, 0)):
        hop += [(f, 'root', 'location', (0, z, 0))]
    act('Hop', 12, hop)

    jump = []
    for f, z, sq in ((1, 0, 0.9), (5, 0.18, 1.08), (10, 0.30, 1.0), (15, 0.18, 1.05), (19, 0, 0.88), (23, 0, 1.0)):
        jump += [(f, 'root', 'location', (0, z, 0)), (f, 'root', 'scale', (1 / sq ** 0.5, sq, 1 / sq ** 0.5))]
    for f, r in ((1, 0), (10, D(-35)), (19, 0)):
        for leg in ('leg.FL', 'leg.FR'):
            jump += [(f, leg, 'rotation_euler', (r, 0, 0))]
        for leg in ('leg.BL', 'leg.BR'):
            jump += [(f, leg, 'rotation_euler', (-r, 0, 0))]
    act('Jump', 22, jump)

    eat = []
    for f, r in ((1, D(10)), (7, D(28)), (13, D(10))):
        eat += [(f, 'head', 'rotation_euler', (r, 0, 0))]
    act('Eat', 12, eat)

    sleep = []
    for f, s in ((1, 1.0), (37, 1.05), (73, 1.0)):
        sleep += [(f, 'root', 'location', (0, -0.13, 0)), (f, 'body', 'scale', (s, 1, s)),
                  (f, 'head', 'rotation_euler', (D(22), 0, D(8))), (f, 'head', 'location', (0, -0.05, 0))]
        for leg in ('leg.FL', 'leg.FR'):
            sleep += [(f, leg, 'rotation_euler', (D(70), 0, 0))]
        for leg in ('leg.BL', 'leg.BR'):
            sleep += [(f, leg, 'rotation_euler', (D(-70), 0, 0))]
    act('Sleep', 72, sleep)

    tilt = []
    for f, r in ((1, 0), (8, D(-18)), (40, D(-18)), (48, 0)):
        tilt += [(f, 'head', 'rotation_euler', (0, 0, r))]
    act('Tilt', 48, tilt)


# ---------------------------------------------------------------- main
def main():
    reset()
    arm = build_rig()
    build_body(arm)
    build_face(arm)
    build_tail()
    make_actions(arm)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', export_apply=False, export_yup=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_morph=True,
        export_skins=True, export_def_bones=False, export_force_sampling=True,
    )
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()

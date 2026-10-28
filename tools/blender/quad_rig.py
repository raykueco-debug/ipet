"""Four-legged skeleton for the standing fox, laid out like Rigify's wolf metarig (canine — a fox is one).

Same bone names and parenting as Rigify's wolf (spine.004 hips … spine.011 head, shoulder / front_thigh /
front_shin / front_foot / front_toe, thigh / shin / foot / toe, ear.L / ear.R), without the face and toe
bones (the face is decals + 3D mouth). Each bone is placed from landmarks measured on the fox itself — a
chibi has a big head and short legs, so scaling the wolf wouldn't fit. Skinned with Blender's automatic
(bone heat) weights. Legs are driven by IK targets (non-deform bones), so clips only say where paws and
body go and the knees bend by themselves; the glTF exporter samples the evaluated pose, IK included.
Rigify can still turn this layout into a full animator rig later.
"""
import math

import bpy
import numpy as np
from mathutils import Quaternion, Vector

HEAD = 'spine.011'
HIPS = 'spine.004'
CHEST = 'spine.008'
NECK = ('spine.009', 'spine.010')
LEGS = {  # IK chain end (the bone carrying the IK constraint) per leg
    'FL': 'front_shin.L', 'FR': 'front_shin.R', 'BL': 'shin.L', 'BR': 'shin.R'}


def landmarks(fox, chin_z):
    me = fox.data
    co = np.array([v.co[:] for v in me.vertices])
    nrm = np.array([v.normal[:] for v in me.vertices])
    centre = np.abs(co[:, 0]) < 0.03
    low = co[co[:, 2] < 0.06]
    ymin, ymax = low[:, 1].min(), low[:, 1].max()
    split = (ymin + ymax) / 2
    paws = {}
    for s, sx in (('L', 1), ('R', -1)):
        for leg, sel in (('F', low[:, 1] < split), ('B', low[:, 1] >= split)):
            pts = low[sel & (low[:, 0] * sx > 0.015)]
            paws[leg + s] = pts.mean(0) if len(pts) else np.array([0.09 * sx, ymin if leg == 'F' else ymax, 0])
    y_front = (paws['FL'][1] + paws['FR'][1]) / 2
    y_back = (paws['BL'][1] + paws['BR'][1]) / 2
    # the big chibi head hangs over the front half and higher than the back: measure the back over the hind
    # legs and the belly between the two pairs of legs (above the ground, facing down)
    rear = centre & (co[:, 1] > y_back - 0.10) & (co[:, 1] < y_back + 0.06)
    gap = centre & (np.abs(co[:, 1] - (y_front + y_back) / 2) < 0.10) & (nrm[:, 2] < -0.3) & (co[:, 2] > 0.08)
    back = float(co[rear, 2].max()) if rear.any() else 0.4
    belly = float(co[gap, 2].min()) if gap.any() else 0.14
    zc = (belly + back) / 2
    body = centre & (np.abs(co[:, 2] - zc) < 0.05)
    rump, chest = float(co[body, 1].max()), float(co[body, 1].min())
    headv = co[co[:, 2] > chin_z]
    head_top = float(co[centre & (co[:, 2] > chin_z), 2].max())
    ears = {}
    for s, sx in (('L', 1), ('R', -1)):
        side = co[(co[:, 0] * sx > 0.05) & (co[:, 2] > head_top - 0.02)]
        tip = side[side[:, 2].argmax()] if len(side) else np.array([0.15 * sx, float(headv[:, 1].mean()), 1.0])
        ears[s] = (np.array([tip[0] * 0.7, tip[1], head_top - 0.04]), tip)
    return dict(paws=paws, belly=belly, back=back, zc=zc, rump=rump, chest=chest, chin=chin_z,
                head_y=float(headv[:, 1].mean()), head_top=head_top, ears=ears)


def build(fox, chin_z):
    L = landmarks(fox, chin_z)
    print('quad: belly', round(L['belly'], 3), 'back', round(L['back'], 3), 'rump', round(L['rump'], 3),
          'chest', round(L['chest'], 3), 'paws', {k: tuple(round(float(c), 3) for c in v) for k, v in L['paws'].items()})
    arm_data = bpy.data.armatures.new('FoxRig')
    arm = bpy.data.objects.new('FoxRig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, deform=True, connect=False):
        b = eb.new(name)
        b.head, b.tail, b.roll = Vector(head), Vector(tail), 0
        b.use_deform = deform
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    zc, belly = L['zc'], L['belly']
    ys = np.linspace(L['rump'] - 0.05, L['chest'] + 0.06, 5)
    bone(HIPS, (0, ys[0], zc), (0, ys[1], zc))
    for i, name in enumerate(('spine.005', 'spine.006', 'spine.007')):
        bone(name, (0, ys[i + 1], zc), (0, ys[i + 2], zc), HIPS if i == 0 else f'spine.00{4 + i}', connect=True)
    neck_base = (0, L['chest'] + 0.04, L['chin'] - 0.03)
    bone(CHEST, (0, ys[4], zc), neck_base, 'spine.007', connect=True)
    pivot = (0, L['head_y'] + 0.02, L['chin'] + 0.04)
    neck_mid = (0, (neck_base[1] + pivot[1]) / 2, (neck_base[2] + pivot[2]) / 2)
    bone(NECK[0], neck_base, neck_mid, CHEST, connect=True)
    bone(NECK[1], eb[NECK[0]].tail, pivot, NECK[0], connect=True)
    bone(HEAD, pivot, (0, L['head_y'] - 0.04, L['head_top']), NECK[1], connect=True)
    for s in ('L', 'R'):
        base, tip = L['ears'][s]
        bone(f'ear.{s}', base, tip, HEAD)

    for s, sx in (('L', 1), ('R', -1)):
        px, py, _ = L['paws']['F' + s]
        top = belly + 0.06
        bone(f'shoulder.{s}', (0.05 * sx, py + 0.02, zc + 0.05), (px, py + 0.01, top), CHEST)
        bone(f'front_thigh.{s}', (px, py + 0.01, top), (px, py + 0.025, top * 0.5), f'shoulder.{s}', connect=True)
        bone(f'front_shin.{s}', (px, py + 0.025, top * 0.5), (px, py, 0.06), f'front_thigh.{s}', connect=True)
        bone(f'front_foot.{s}', (px, py, 0.06), (px, py - 0.02, 0.02), f'front_shin.{s}', connect=True)
        bone(f'front_toe.{s}', (px, py - 0.02, 0.02), (px, py - 0.06, 0.0), f'front_foot.{s}', connect=True)
        px, py, _ = L['paws']['B' + s]
        bone(f'thigh.{s}', (px, py - 0.01, zc), (px, py - 0.035, belly * 0.55), HIPS)
        bone(f'shin.{s}', (px, py - 0.035, belly * 0.55), (px, py + 0.03, 0.09), f'thigh.{s}', connect=True)
        bone(f'foot.{s}', (px, py + 0.03, 0.09), (px, py + 0.005, 0.03), f'shin.{s}', connect=True)
        bone(f'toe.{s}', (px, py + 0.005, 0.03), (px, py - 0.04, 0.0), f'foot.{s}', connect=True)

    # IK targets (at the wrist / hock) and pole targets, not deforming, not parented: clips move them freely
    for leg, shin in LEGS.items():
        end = eb[shin].tail.copy()
        bone(f'ik.{leg}', end, end + Vector((0, 0, 0.05)), deform=False)
        pole_y = 0.3 if leg[0] == 'F' else -0.3  # elbows point back, knees forward
        knee = eb[shin].head.copy()
        bone(f'pole.{leg}', knee + Vector((0, pole_y, 0)), knee + Vector((0, pole_y, 0.05)), deform=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for leg, shin in LEGS.items():
        c = arm.pose.bones[shin].constraints.new('IK')
        c.target, c.subtarget = arm, f'ik.{leg}'
        c.pole_target, c.pole_subtarget = arm, f'pole.{leg}'
        c.chain_count = 2
        # the pole angle that leaves the leg exactly as modelled at rest depends on the bones' roll: try them
        upper = arm.pose.bones[shin].parent
        best = None
        for deg in range(-180, 180, 15):
            c.pole_angle = math.radians(deg)
            bpy.context.view_layer.update()
            err = sum(abs(a - b) for pb in (upper, arm.pose.bones[shin])  # posed vs. modelled matrices
                      for ra, rb in zip(pb.matrix, pb.bone.matrix_local) for a, b in zip(ra, rb))
            if best is None or err < best[0]:
                best = (err, deg)
        c.pole_angle = math.radians(best[1])
        print('quad: pole', leg, best[1], 'deg, rest error', round(best[0], 4))

    # automatic weights (bone heat) for the body
    bpy.ops.object.select_all(action='DESELECT')
    fox.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    weighted = sum(1 for v in fox.data.vertices if v.groups)
    print('quad: weighted', weighted, 'of', len(fox.data.vertices), 'verts')
    return arm, L


# ---------------------------------------------------------------- clips
class Keys:
    """Keyframes in armature (world) terms, turned into each pose bone's own rest frame."""

    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}

    def loc(self, name, frame, offset):
        pb = self.arm.pose.bones[name]
        pb.location = self.rest[name].inverted() @ Vector(offset)
        pb.keyframe_insert('location', frame=frame)

    def rot(self, name, frame, *turns):
        """turns: (world axis, degrees) applied in order."""
        pb = self.arm.pose.bones[name]
        q = Quaternion()
        inv = self.rest[name].inverted()
        for axis, deg in turns:
            q = q @ Quaternion(inv @ Vector(axis), math.radians(deg))
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame)

    def scale(self, name, frame, s):
        pb = self.arm.pose.bones[name]
        pb.scale = s
        pb.keyframe_insert('scale', frame=frame)


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)  # Blender: fox faces -Y; +X rotation tips the nose down


def make_actions(arm, L):
    K = Keys(arm)
    arm.animation_data_create()

    def act(name, build_keys):
        a = bpy.data.actions.new(name)
        a.use_fake_user = True
        arm.animation_data.action = a
        build_keys()
        for pb in arm.pose.bones:
            pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, a)
        track.mute = True

    def paws(frame, **moves):  # paw IK targets: offset per leg (default planted)
        for leg in LEGS:
            K.loc(f'ik.{leg}', frame, moves.get(leg, (0, 0, 0)))

    def body(frame, up=0.0, fwd=0.0, pitch=0.0):  # hips offset; pitch + = nose down
        K.loc(HIPS, frame, (0, -fwd, up))
        K.rot(HIPS, frame, (X, pitch))

    def head(frame, nod=0.0, roll=0.0, neck=0.0):
        K.rot(NECK[0], frame, (X, neck))
        K.rot(HEAD, frame, (X, nod), (Y, roll))

    def idle():
        for f, s, n in ((1, 1.0, 0), (25, 1.03, -3), (49, 1.0, 0)):
            K.scale(CHEST, f, (s, 1, s))
            head(f, nod=n)
            paws(f)
            body(f)
    act('Idle', idle)

    def walk():  # diagonal pairs; each paw: back → lift → forward → plant
        cycle = {0: (0, 0.035, 0), 4: (0, 0, 0.045), 8: (0, -0.035, 0), 12: (0, 0, 0)}
        for f in range(1, 18):
            ph = (f - 1) % 16
            moves = {}
            for leg, off in (('FL', 0), ('BR', 0), ('FR', 8), ('BL', 8)):
                p = (ph + off) % 16
                k0 = (p // 4) * 4
                a, b = cycle[k0 % 16], cycle[(k0 + 4) % 16]
                t = (p - k0) / 4
                moves[leg] = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
            if f in (1, 5, 9, 13, 17):
                paws(f, **moves)
                bob = 0.012 if f in (5, 13) else 0
                body(f, up=bob)
                head(f, nod=-2 if bob else 1)
    act('Walk', walk)

    def hop():
        for f, up, tuck in ((1, 0, 0), (4, -0.02, 0), (7, 0.07, 0.04), (10, 0.0, 0), (13, 0, 0)):
            body(f, up=up)
            paws(f, **{leg: (0, 0, max(0.0, up - 0.03) + tuck) for leg in LEGS})
            head(f, nod=-4 if up > 0 else 2)
    act('Hop', hop)

    def jump():  # crouch → launch → tuck in the air → front paws land → absorb → settle
        keys = [
            (1, 0.0, 0, {}, 0),
            (5, -0.06, 6, {}, 6),                                                    # crouch, nose down
            (8, 0.08, -14, {'FL': (0, -0.05, 0.09), 'FR': (0, -0.05, 0.09),          # launch: nose up,
                            'BL': (0, 0.05, 0.02), 'BR': (0, 0.05, 0.02)}, -8),      # hind legs push back
            (12, 0.22, -4, {'FL': (0, -0.02, 0.20), 'FR': (0, -0.02, 0.20),          # apex: legs tucked
                            'BL': (0, 0.0, 0.17), 'BR': (0, 0.0, 0.17)}, -4),
            (16, 0.10, 8, {'FL': (0, -0.05, 0.03), 'FR': (0, -0.05, 0.03),           # reach for the ground
                           'BL': (0, 0.03, 0.10), 'BR': (0, 0.03, 0.10)}, 4),
            (18, 0.02, 10, {'FL': (0, -0.04, 0), 'FR': (0, -0.04, 0),                # front paws land
                            'BL': (0, 0.01, 0.04), 'BR': (0, 0.01, 0.04)}, 6),
            (20, -0.05, 4, {'FL': (0, -0.02, 0), 'FR': (0, -0.02, 0)}, 4),           # absorb
            (24, 0.0, 0, {}, 0),
        ]
        for f, up, pitch, moves, nod in keys:
            body(f, up=up, pitch=pitch)
            paws(f, **moves)
            head(f, nod=nod)
    act('Jump', jump)

    def eat():
        for f, n in ((1, 22), (7, 34), (13, 22)):
            head(f, nod=n * 0.6, neck=n)
            body(f, up=-0.015, pitch=3)
            paws(f)
    act('Eat', eat)

    def sleep():  # lie down: belly to the ground, legs folded (IK bends them), head resting
        drop = -(L['belly'] - 0.02)
        for f, s in ((1, 1.0), (37, 1.04), (73, 1.0)):
            body(f, up=drop)
            K.scale(CHEST, f, (s, 1, s))
            paws(f, FL=(0, -0.10, 0.0), FR=(0, -0.10, 0.0), BL=(0, -0.06, 0.0), BR=(0, -0.06, 0.0))
            head(f, nod=24, roll=8, neck=12)
    act('Sleep', sleep)

    def tilt():
        for f, r in ((1, 0), (8, -15), (40, -15), (48, 0)):
            head(f, roll=r)
            paws(f)
            body(f)
    act('Tilt', tilt)

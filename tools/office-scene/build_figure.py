"""Build the faceless office figure for the VerbaTrace 3D landing scene.

A smooth, matte shop-mannequin in office clothes: no facial features, real
human proportions, seated at a desk, wearing a call-centre headset. The mesh
is skinned to a small named armature so the web app can drive the arms with
two-bone IK at runtime; three short clips (idle / type / click) are baked.

Run headless from PowerShell:

  & "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b `
      --python tools/office-scene/build_figure.py -- --render --export [--out DIR] [--pose-test]

Geometry is generated in code (no .blend files): every body part is a closed
loft (capsule / egg / band) that gets its own Catmull-Clark pass BEFORE the
parts are joined. Joining unmerged shells keeps the "seams" a mannequin has and
avoids the spikes a subdivision surface produces on non-manifold joins.

Axes (Blender): +Z up, the figure faces -Y ("forward"), its LEFT side is +X, so
the RIGHT hand (mouse hand) sits at negative X. The glTF exporter converts this
to Y-up with the figure facing +Z.
"""

import argparse
import json
import math
import os
import struct
import sys
from math import acos, cos, pi, radians, sin

import bmesh
import bpy
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Parameters (metres, degrees, sRGB colours)
# ---------------------------------------------------------------------------
DEFAULT_OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "..", "public", "assets", "scene"
))

# Proportions of a ~1.75 m adult. The figure is built directly in the seated
# pose, so the armature's rest pose IS the seated pose (the web app rotates
# bones relative to it).
SEAT_HEIGHT = 0.445          # top of the (external) chair seat the pelvis rests on
HIP_Z = 0.52                 # hip joint / thigh axis height (seat + half thigh)
HIP_HALF_SPACING = 0.086     # hip joints at +-x (thighs touch at the centre line)
KNEE_SPREAD = 0.11           # knees slightly wider than the hips
THIGH_LENGTH = 0.44          # hip -> knee, horizontal
ANKLE_Z = 0.07               # knee -> ankle is vertical, shin ends here
FOOT_LENGTH = 0.28

SHOULDER_JOINT_X = 0.155     # shoulder joints at +-x; deltoids bring the width to ~0.43
SHOULDER_Z = 0.99
NECK_BASE_Z = 1.03
NECK_TOP_Z = 1.13
HEAD_CENTER_Z = 1.225
HEAD_HALF_W = 0.078          # half width  -> 0.156 wide
HEAD_HALF_D = 0.095          # half depth  -> 0.19 deep
HEAD_HALF_H = 0.115          # half height -> 0.23 tall (chin at 1.12, crown at 1.35)
HEAD_CHIN_TAPER = 0.17       # narrows the lower half of the egg toward the chin

UPPER_ARM_LENGTH = 0.30
FOREARM_LENGTH = 0.26
TORSO_LEAN_DEG = 6.0         # torso pitched forward toward the desk; head stays level

DESK_HEIGHT = 0.74
# Hand targets in Blender space: (x, y, z). Right hand on a mouse, left over
# the keyboard. These are exported as empties "hand_r_target"/"hand_l_target".
HAND_R_TARGET = (-0.30, -0.35, DESK_HEIGHT)
HAND_L_TARGET = (0.10, -0.30, DESK_HEIGHT)
# The target is the centre of the palm on the desk; the wrist sits behind and
# above it, the finger tips ahead and slightly higher (a hand domed on a mouse).
HAND_WRIST_OFFSET = (0.0, 0.08, 0.035)
HAND_TIP_OFFSET = (0.0, -0.085, 0.015)
# Pole hints for the elbow: out to the side, back and down (relaxed arms).
ELBOW_POLE_R = (-0.30, 1.0, -0.5)
ELBOW_POLE_L = (0.30, 1.0, -0.5)

# Colours in sRGB (converted to linear for the shader).
SKIN_COLOR = (0.86, 0.69, 0.58)      # single warm neutral tone, matte
SHIRT_COLOR = (0.66, 0.77, 0.90)     # light blue office shirt
TROUSER_COLOR = (0.23, 0.25, 0.30)   # charcoal
SHOE_COLOR = (0.11, 0.09, 0.08)
BELT_COLOR = (0.13, 0.11, 0.10)
HEADSET_COLOR = (0.15, 0.15, 0.16)   # dark grey
HEADSET_MIC_SIDE = +1                # +1 = figure's left (+X), -1 = right

# Mesh resolution. Triangle budget for the web is < 25k after subdivision.
SIDES = 12                   # ring segments for limbs
TORSO_SIDES = 16
HEAD_SIDES = 16
HEAD_LAT = 12
THIN_SIDES = 8               # thumbs, mic boom, headband
CAP_RINGS = 2                # latitude rings per capsule cap
BODY_RINGS = 1               # intermediate rings along a capsule body
SUBSURF_LEVELS = 1

# Rendering / animation.
RENDER_W, RENDER_H = 1280, 800
RENDER_SAMPLES = 32
FPS = 24
IDLE_FRAMES = 48             # 2.0 s loop
TYPE_FRAMES = 12             # 0.5 s loop
CLICK_FRAMES = 6             # 0.25 s

FIGURE_NAME = "Figure"
RIG_NAME = "FigureRig"

X = Vector((1, 0, 0))
Y = Vector((0, 1, 0))
Z = Vector((0, 0, 1))

PARTS = []      # mesh objects that get joined into the figure
HELPERS = []    # render-only objects (never exported)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def srgb_to_linear(c):
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return tuple(f(u) for u in c)


def make_material(name, srgb, roughness=0.65, specular=0.3):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    lin = srgb_to_linear(srgb)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        for key in ("Specular IOR Level", "Specular"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = specular
                break
    mat.diffuse_color = (*lin, 1.0)
    mat.roughness = roughness
    return mat


def perp_basis(n):
    """Orthonormal (u, v) around axis n; v is the 'vertical-ish' one so that a
    squash factor on v flattens hands and shoes against the desk/floor."""
    n = n.normalized()
    ref = Z if abs(n.dot(Z)) < 0.9 else X
    u = n.cross(ref).normalized()
    v = n.cross(u).normalized()
    return u, v


def ring(center, U, V, n):
    return [center + U * cos(2 * pi * i / n) + V * sin(2 * pi * i / n) for i in range(n)]


def loft_mesh(rings, cap_start=None, cap_end=None, close_loop=False):
    n = len(rings[0])
    verts = [v for r in rings for v in r]
    faces = []
    count = len(rings)
    pairs = [(i, i + 1) for i in range(count - 1)]
    if close_loop:
        pairs.append((count - 1, 0))
    for r0, r1 in pairs:
        for i in range(n):
            j = (i + 1) % n
            faces.append((r0 * n + i, r0 * n + j, r1 * n + j, r1 * n + i))
    if cap_start is not None:
        p = len(verts)
        verts.append(cap_start)
        faces += [(p, (i + 1) % n, i) for i in range(n)]
    if cap_end is not None:
        p = len(verts)
        verts.append(cap_end)
        base = (count - 1) * n
        faces += [(p, base + i, base + (i + 1) % n) for i in range(n)]
    return verts, faces


def add_part(name, verts, faces, material, smooth=True, subsurf=True, xform=None, register=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if xform is not None:
        me.transform(xform)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    me.materials.append(material)
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if subsurf and SUBSURF_LEVELS > 0:
        # Subdivide each closed shell on its own: the parts overlap but are
        # never merged, so there are no open edges for Catmull-Clark to pinch.
        mod = obj.modifiers.new("subsurf", "SUBSURF")
        mod.levels = SUBSURF_LEVELS
        mod.render_levels = SUBSURF_LEVELS
        deps = bpy.context.evaluated_depsgraph_get()
        new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
        obj.modifiers.clear()
        obj.data = new_me
        bpy.data.meshes.remove(me)
        me = new_me
        if not me.materials:
            me.materials.append(material)
    me.polygons.foreach_set("use_smooth", [smooth] * len(me.polygons))
    me.update()
    if register:
        PARTS.append(obj)
    else:
        HELPERS.append(obj)
    return obj


def capsule(name, a, b, ra, rb, material, squash=1.0, sides=None, xform=None):
    """Tapered capsule from a to b with hemispherical caps; squash < 1 flattens it
    vertically (hands, shoes)."""
    a, b = Vector(a), Vector(b)
    n = (b - a).normalized()
    u, v = perp_basis(n)
    v = v * squash
    sides = sides or SIDES
    rings = []
    for k in range(1, CAP_RINGS + 1):
        t = (pi / 2) * k / CAP_RINGS
        rings.append(ring(a - n * (ra * cos(t)), u * (ra * sin(t)), v * (ra * sin(t)), sides))
    for k in range(1, BODY_RINGS + 1):
        f = k / (BODY_RINGS + 1)
        r = ra + (rb - ra) * f
        rings.append(ring(a.lerp(b, f), u * r, v * r, sides))
    for k in range(CAP_RINGS, 0, -1):
        t = (pi / 2) * k / CAP_RINGS
        rings.append(ring(b + n * (rb * cos(t)), u * (rb * sin(t)), v * (rb * sin(t)), sides))
    verts, faces = loft_mesh(rings, cap_start=a - n * ra, cap_end=b + n * rb)
    return add_part(name, verts, faces, material, xform=xform)


def egg(name, center, rx, ry, rz, material, chin=0.0, sides=None, lat=None, xform=None):
    """Ellipsoid built from latitude rings; chin > 0 narrows the lower half."""
    c = Vector(center)
    sides = sides or SIDES
    lat = lat or max(6, CAP_RINGS * 4)
    rings = []
    for k in range(1, lat):
        t = pi * k / lat
        z = -rz * cos(t)
        s = sin(t)
        taper = 1.0
        if chin > 0 and z < 0:
            taper = 1.0 - chin * (-z / rz) ** 1.5
        rings.append(ring(c + Z * z, X * (rx * s * taper), Y * (ry * s * taper), sides))
    verts, faces = loft_mesh(rings, cap_start=c - Z * rz, cap_end=c + Z * rz)
    return add_part(name, verts, faces, material, xform=xform)


def sphere(name, center, r, material, xform=None):
    return egg(name, center, r, r, r, material, xform=xform)


def loft_z(name, profile, material, cap_bottom=True, cap_top=True, sides=None, xform=None):
    """Torso-style loft: profile = [(z, rx, ry, y_offset), ...] bottom to top."""
    sides = sides or TORSO_SIDES
    rings = [ring(Vector((0, yo, z)), X * rx, Y * ry, sides) for (z, rx, ry, yo) in profile]
    cs = Vector((0, profile[0][3], profile[0][0])) if cap_bottom else None
    ce = Vector((0, profile[-1][3], profile[-1][0])) if cap_top else None
    verts, faces = loft_mesh(rings, cap_start=cs, cap_end=ce)
    return add_part(name, verts, faces, material, xform=xform)


def band(name, a, b, r_outer, r_inner, material, sides=None, xform=None):
    """Closed ring with thickness (cuff, belt, collar band): a squarish torus."""
    a, b = Vector(a), Vector(b)
    n = (b - a).normalized()
    u, v = perp_basis(n)
    sides = sides or SIDES
    rings = [
        ring(a, u * r_outer, v * r_outer, sides),
        ring(b, u * r_outer, v * r_outer, sides),
        ring(b, u * r_inner, v * r_inner, sides),
        ring(a, u * r_inner, v * r_inner, sides),
    ]
    verts, faces = loft_mesh(rings, close_loop=True)
    return add_part(name, verts, faces, material, xform=xform)


def band_z(name, z0, z1, rx_o, ry_o, rx_i, ry_i, material, sides=None, xform=None):
    """Elliptical version of band() around the Z axis (belt, collar)."""
    sides = sides or TORSO_SIDES
    rings = [
        ring(Vector((0, 0, z0)), X * rx_o, Y * ry_o, sides),
        ring(Vector((0, 0, z1)), X * rx_o, Y * ry_o, sides),
        ring(Vector((0, 0, z1)), X * rx_i, Y * ry_i, sides),
        ring(Vector((0, 0, z0)), X * rx_i, Y * ry_i, sides),
    ]
    verts, faces = loft_mesh(rings, close_loop=True)
    return add_part(name, verts, faces, material, xform=xform)


def prism(name, pts, thickness, material, xform=None):
    """Thin flat triangle with thickness (collar flaps). Flat shaded, no subsurf."""
    p0, p1, p2 = [Vector(p) for p in pts]
    nrm = (p1 - p0).cross(p2 - p0).normalized()
    verts = [p0, p1, p2, p0 + nrm * thickness, p1 + nrm * thickness, p2 + nrm * thickness]
    faces = [(0, 1, 2), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    return add_part(name, verts, faces, material, smooth=False, subsurf=False, xform=xform)


def tube_along(name, points, radius, material, sides=None, xform=None, ring_fn=None):
    """Loft small rings along a polyline (mic boom, headband)."""
    sides = sides or THIN_SIDES
    rings = []
    for i, p in enumerate(points):
        nxt = points[min(i + 1, len(points) - 1)]
        prv = points[max(i - 1, 0)]
        tangent = (nxt - prv).normalized()
        if ring_fn is not None:
            rings.append(ring_fn(p, tangent, sides))
        else:
            u, v = perp_basis(tangent)
            rings.append(ring(p, u * radius, v * radius, sides))
    verts, faces = loft_mesh(rings, cap_start=points[0], cap_end=points[-1])
    return add_part(name, verts, faces, material, xform=xform)


def box(name, center, size, material):
    c = Vector(center)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    verts = [c + Vector((sx * hx, sy * hy, sz * hz)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return add_part(name, verts, faces, material, smooth=False, subsurf=False, register=False)


def solve_elbow(shoulder, wrist, l1, l2, pole):
    """Analytic two-bone IK: the elbow lies in the plane spanned by the
    shoulder->wrist line and the pole hint, on the pole side."""
    d = wrist - shoulder
    dist = min(d.length, (l1 + l2) * 0.999)
    dn = d.normalized()
    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    a = acos(cos_a)
    p = Vector(pole)
    p = p - dn * p.dot(dn)
    p.normalize()
    return shoulder + dn * (l1 * cos(a)) + p * (l1 * sin(a))


def bezier(p0, c, p1, t):
    return p0 * (1 - t) ** 2 + c * (2 * (1 - t) * t) + p1 * (t * t)


# ---------------------------------------------------------------------------
# Figure geometry
# ---------------------------------------------------------------------------
def build_figure(mats):
    """Creates all body parts as separate objects and returns the joint
    positions (world space) used to place the armature."""
    skin, shirt, trousers, shoes, belt, headset = (
        mats["Skin"], mats["Shirt"], mats["Trousers"], mats["Shoes"], mats["Belt"], mats["Headset"],
    )
    J = {}

    # The upper body is modelled upright and then pitched forward around the
    # hips; the head is pitched back by the same angle around the neck top so
    # the figure looks level at the monitor.
    pivot = Vector((0, 0, HIP_Z))
    lean = Matrix.Translation(pivot) @ Matrix.Rotation(radians(TORSO_LEAN_DEG), 4, "X") @ Matrix.Translation(-pivot)
    neck_top = lean @ Vector((0, 0, NECK_TOP_Z))
    head_xf = (
        Matrix.Translation(neck_top)
        @ Matrix.Rotation(-radians(TORSO_LEAN_DEG), 4, "X")
        @ Matrix.Translation(-neck_top)
        @ lean
    )

    # --- pelvis, belt, shirt torso ---------------------------------------
    loft_z("pelvis", [
        (SEAT_HEIGHT - 0.005, 0.15, 0.10, 0.0),
        (SEAT_HEIGHT + 0.015, 0.18, 0.125, 0.0),
        (0.50, 0.19, 0.13, 0.0),
        (0.55, 0.180, 0.123, 0.0),
        (0.60, 0.172, 0.118, 0.0),
    ], trousers, xform=lean)
    band_z("belt", 0.585, 0.62, 0.177, 0.123, 0.150, 0.100, belt, xform=lean)
    loft_z("shirt", [
        (0.595, 0.166, 0.114, 0.0),
        (0.68, 0.162, 0.112, 0.0),
        (0.78, 0.172, 0.120, 0.0),
        (0.88, 0.188, 0.128, 0.0),
        (0.95, 0.196, 0.130, 0.0),
        (0.985, 0.185, 0.126, 0.0),
        (1.01, 0.168, 0.115, 0.0),
        (1.035, 0.125, 0.095, 0.0),
        (1.06, 0.075, 0.065, 0.0),
    ], shirt, xform=lean)
    # Collar: a stand-up band around the neck plus two folded points on the chest.
    band_z("collar_band", 1.04, 1.085, 0.064, 0.060, 0.052, 0.049, shirt, xform=lean)
    for s, sfx in ((1, ".L"), (-1, ".R")):
        prism(f"collar_flap{sfx}", [
            (s * 0.008, -0.060, 1.078),
            (s * 0.070, -0.112, 0.995),
            (s * 0.055, -0.048, 1.066),
        ], 0.006, shirt, xform=lean)

    # --- neck and head ----------------------------------------------------
    capsule("neck", (0, 0.0, NECK_BASE_Z), (0, 0.0, NECK_TOP_Z + 0.01), 0.056, 0.053, skin, xform=lean)
    egg("head", (0, 0, HEAD_CENTER_Z), HEAD_HALF_W, HEAD_HALF_D, HEAD_HALF_H, skin,
        chin=HEAD_CHIN_TAPER, sides=HEAD_SIDES, lat=HEAD_LAT, xform=head_xf)

    # --- headset ----------------------------------------------------------
    ear_y = 0.008
    ear_z = HEAD_CENTER_Z - 0.008
    band_rx = HEAD_HALF_W + 0.014
    band_rz = HEAD_HALF_H + 0.009

    def band_ring(p, tangent, n):
        radial = Vector((p.x, 0, p.z - HEAD_CENTER_Z)).normalized()
        return ring(p, Y * 0.011, radial * 0.005, n)

    samples = 24
    arc = []
    for i in range(samples + 1):
        phi = radians(14) + (pi - 2 * radians(14)) * i / samples
        arc.append(Vector((cos(phi) * band_rx, ear_y, HEAD_CENTER_Z + sin(phi) * band_rz)))
    tube_along("headband", arc, 0.005, headset, sides=THIN_SIDES, xform=head_xf, ring_fn=band_ring)
    for s, sfx in ((1, ".L"), (-1, ".R")):
        capsule(f"earcup{sfx}", (s * (HEAD_HALF_W - 0.008), ear_y, ear_z), (s * (HEAD_HALF_W + 0.026), ear_y, ear_z),
                0.036, 0.030, headset, sides=SIDES, xform=head_xf)
    # Mic boom: from the front-bottom of one ear cup around the cheek to just
    # in front of where the mouth would be.
    ms = HEADSET_MIC_SIDE
    b0 = Vector((ms * (HEAD_HALF_W + 0.014), ear_y - 0.024, ear_z - 0.024))
    bc = Vector((ms * 0.105, -0.075, HEAD_CENTER_Z - 0.050))
    b1 = Vector((ms * 0.036, -0.112, HEAD_CENTER_Z - 0.060))
    boom = [bezier(b0, bc, b1, i / 12) for i in range(13)]
    tube_along("mic_boom", boom, 0.0045, headset, sides=THIN_SIDES, xform=head_xf)
    tdir = (b1 - boom[-2]).normalized()
    capsule("mic", b1 - tdir * 0.004, b1 + tdir * 0.016, 0.009, 0.008, headset, sides=THIN_SIDES, xform=head_xf)

    # --- legs (built in place, no lean) -----------------------------------
    for s, sfx in ((1, ".L"), (-1, ".R")):
        H = Vector((s * HIP_HALF_SPACING, 0.0, HIP_Z))
        K = Vector((s * KNEE_SPREAD, -THIGH_LENGTH, HIP_Z))
        A = Vector((s * KNEE_SPREAD, -THIGH_LENGTH, ANKLE_Z))
        heel = Vector((s * (KNEE_SPREAD + 0.004), -THIGH_LENGTH + 0.03, 0.035))
        toe = Vector((s * (KNEE_SPREAD + 0.022), -THIGH_LENGTH - (FOOT_LENGTH - 0.12), 0.030))
        capsule(f"thigh{sfx}", H, K, 0.082, 0.066, trousers)
        sphere(f"knee{sfx}", K, 0.064, trousers)
        capsule(f"shin{sfx}", K, A, 0.062, 0.046, trousers)
        capsule(f"shoe{sfx}", heel, toe, 0.047, 0.040, shoes, squash=0.70)
        J["H" + sfx], J["K" + sfx], J["A" + sfx] = H, K, A
        J["F" + sfx] = Vector((s * (KNEE_SPREAD + 0.015), -THIGH_LENGTH - 0.14, 0.03))
    # Lap filler: closes the V between the two thigh cylinders in front of the
    # pelvis so the lap reads as trousers, not as two separate tubes.
    egg("lap", (0.0, -0.09, HIP_Z - 0.015), 0.105, 0.14, 0.062, trousers)

    # --- arms: solved so the hands land on the desk targets ---------------
    for s, sfx in ((1, ".L"), (-1, ".R")):
        S = lean @ Vector((s * SHOULDER_JOINT_X, 0.0, SHOULDER_Z))
        target = Vector(HAND_L_TARGET if s > 0 else HAND_R_TARGET)
        W = target + Vector(HAND_WRIST_OFFSET)
        T = target + Vector(HAND_TIP_OFFSET)
        pole = Vector(ELBOW_POLE_L if s > 0 else ELBOW_POLE_R)
        E = solve_elbow(S, W, UPPER_ARM_LENGTH, FOREARM_LENGTH, pole)
        # Deltoid: an egg hanging below the joint so the shoulder slopes down
        # from the trapezius instead of reading as an epaulette. The upper-arm
        # capsule starts a little down its axis for the same reason: its round
        # cap would otherwise poke out above the shoulder line.
        egg(f"deltoid{sfx}", S + Z * -0.025, 0.064, 0.066, 0.062, shirt)
        n_ua = (E - S).normalized()
        capsule(f"upper_arm{sfx}", S + n_ua * 0.035, E, 0.054, 0.046, shirt)
        sphere(f"elbow{sfx}", E, 0.047, shirt)
        capsule(f"forearm{sfx}", E, W, 0.046, 0.036, shirt)
        n_fa = (E - W).normalized()
        band(f"cuff{sfx}", W + n_fa * 0.035, W + n_fa * 0.005, 0.041, 0.032, shirt)
        hand_dir = (T - W).normalized()
        capsule(f"hand{sfx}", W, T, 0.042, 0.036, skin, squash=0.42)
        # Thumb on the inner side (toward the body) of a palm-down hand.
        inner = Vector((-s, 0, 0))
        tb = W + hand_dir * 0.045 + inner * 0.030
        tt = tb + hand_dir * 0.050 + inner * 0.032 + Z * -0.004
        capsule(f"thumb{sfx}", tb, tt, 0.014, 0.011, skin, sides=THIN_SIDES)
        J["S" + sfx], J["E" + sfx], J["W" + sfx], J["T" + sfx] = S, E, W, T

    # --- spine chain --------------------------------------------------------
    J["hips"] = lean @ Vector((0, 0, 0.50))
    J["spine"] = lean @ Vector((0, 0, 0.60))
    J["chest"] = lean @ Vector((0, 0, 0.80))
    J["neck"] = lean @ Vector((0, 0, NECK_BASE_Z))
    J["head"] = lean @ Vector((0, 0, NECK_TOP_Z))
    J["head_top"] = head_xf @ Vector((0, 0, NECK_TOP_Z + 0.21))
    return J


def join_parts(name):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in PARTS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    with bpy.context.temp_override(active_object=PARTS[0], selected_objects=list(PARTS),
                                   selected_editable_objects=list(PARTS)):
        bpy.ops.object.join()
    obj = PARTS[0]
    obj.name = name
    obj.data.name = name
    return obj


# ---------------------------------------------------------------------------
# Armature, skinning, animation
# ---------------------------------------------------------------------------
def build_armature(J):
    arm_data = bpy.data.armatures.new(RIG_NAME)
    arm = bpy.data.objects.new(RIG_NAME, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
        bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def B(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        if parent is not None:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    B("hips", J["hips"], J["spine"])
    B("spine", J["spine"], J["chest"], "hips", True)
    B("chest", J["chest"], J["neck"], "spine", True)
    B("neck", J["neck"], J["head"], "chest", True)
    B("head", J["head"], J["head_top"], "neck", True)
    for sfx in (".L", ".R"):
        B("upper_arm" + sfx, J["S" + sfx], J["E" + sfx], "chest")
        B("forearm" + sfx, J["E" + sfx], J["W" + sfx], "upper_arm" + sfx, True)
        B("hand" + sfx, J["W" + sfx], J["T" + sfx], "forearm" + sfx, True)
        B("thigh" + sfx, J["H" + sfx], J["K" + sfx], "hips")
        B("shin" + sfx, J["K" + sfx], J["A" + sfx], "thigh" + sfx, True)
        B("foot" + sfx, J["A" + sfx], J["F" + sfx], "shin" + sfx, True)
    with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
        bpy.ops.object.mode_set(mode="OBJECT")
    arm.hide_render = True
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    return arm


def seg_dist(p, a, b):
    ab = b - a
    t = 0.0 if ab.length_squared == 0 else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def nearest_bone_weights(mesh_obj, arm, indices):
    """Fallback for vertices bone-heat left unweighted: bind to the closest bone."""
    bones = [(b.name, arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones]
    mw = mesh_obj.matrix_world
    for i in indices:
        p = mw @ mesh_obj.data.vertices[i].co
        best = min(bones, key=lambda b: seg_dist(p, b[1], b[2]))
        vg = mesh_obj.vertex_groups.get(best[0]) or mesh_obj.vertex_groups.new(name=best[0])
        vg.add([i], 1.0, "REPLACE")


def skin_mesh(mesh_obj, arm):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    mesh_obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[mesh_obj, arm],
                                   selected_editable_objects=[mesh_obj, arm]):
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    unweighted = [v.index for v in mesh_obj.data.vertices if sum(g.weight for g in v.groups) < 1e-4]
    if unweighted:
        print(f"[figure] bone heat left {len(unweighted)} of {len(mesh_obj.data.vertices)} vertices unweighted; "
              "binding them to the nearest bone")
        nearest_bone_weights(mesh_obj, arm, unweighted)
        per_bone = {}
        for i in unweighted:
            for g in mesh_obj.data.vertices[i].groups:
                per_bone[mesh_obj.vertex_groups[g.group].name] = per_bone.get(mesh_obj.vertex_groups[g.group].name, 0) + 1
        print(f"[figure] fallback bindings per bone: {per_bone}")
    groups = sorted(vg.name for vg in mesh_obj.vertex_groups)
    print(f"[figure] vertex groups: {groups}")


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
        pb.location = (0.0, 0.0, 0.0)


def pitch_sign_down(arm, bone):
    """Sign of a local-X rotation that lowers the bone tip (so a 'tap' goes down)."""
    pb = arm.pose.bones[bone]
    base = (arm.matrix_world @ pb.tail).z
    pb.rotation_euler = (radians(10), 0, 0)
    bpy.context.view_layer.update()
    lowered = (arm.matrix_world @ pb.tail).z < base
    pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    return 1.0 if lowered else -1.0


def make_action(arm, name, last_frame, keys):
    """keys: [(bone, frame, attr, value)] with attr in rotation_euler / scale / location.
    The action is stashed on a muted NLA track so the glTF exporter (ACTIONS
    mode) exports it as a clip named after the action."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    slot = None
    if hasattr(act, "slots"):
        slot = act.slots[0] if len(act.slots) else act.slots.new("OBJECT", arm.name)
        try:
            ad.action_slot = slot
        except Exception as exc:  # pragma: no cover - depends on Blender version
            print("[figure] action slot:", exc)
    for bone, frame, attr, value in keys:
        pb = arm.pose.bones[bone]
        setattr(pb, attr, value)
        pb.keyframe_insert(attr, frame=frame)
    try:
        act.use_frame_range = True
        act.frame_start = 1
        act.frame_end = last_frame
    except Exception as exc:
        print("[figure] frame range:", exc)
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, act)
    if slot is not None and hasattr(strip, "action_slot"):
        try:
            strip.action_slot = slot
        except Exception as exc:
            print("[figure] strip slot:", exc)
    track.mute = True
    ad.action = None
    reset_pose(arm)
    return act


def build_animations(arm):
    r = radians
    down_l = pitch_sign_down(arm, "hand.L")
    down_r = pitch_sign_down(arm, "hand.R")
    down_fa_l = pitch_sign_down(arm, "forearm.L")
    down_fa_r = pitch_sign_down(arm, "forearm.R")

    # idle: breathing. Chest swells a little and pitches back, the head sways.
    half = IDLE_FRAMES // 2 + 1
    end = IDLE_FRAMES + 1
    idle = [
        ("chest", 1, "scale", (1.0, 1.0, 1.0)),
        ("chest", half, "scale", (1.012, 1.015, 1.02)),
        ("chest", end, "scale", (1.0, 1.0, 1.0)),
        ("chest", 1, "rotation_euler", (0, 0, 0)),
        ("chest", half, "rotation_euler", (r(-0.8), 0, 0)),
        ("chest", end, "rotation_euler", (0, 0, 0)),
        ("head", 1, "rotation_euler", (0, 0, 0)),
        ("head", IDLE_FRAMES // 3, "rotation_euler", (r(0.6), 0, r(0.8))),
        ("head", 2 * IDLE_FRAMES // 3, "rotation_euler", (r(-0.4), 0, r(-0.6))),
        ("head", end, "rotation_euler", (0, 0, 0)),
    ]
    make_action(arm, "idle", end, idle)

    # type: two taps of the left hand per loop with a small wrist bounce and a
    # sideways shift, as if reaching different keys.
    q = TYPE_FRAMES // 4
    typ = []
    for i, f in enumerate((1, 1 + q, 1 + 2 * q, 1 + 3 * q, TYPE_FRAMES + 1)):
        tap = i % 2 == 1
        yaw = r(3.0) if i == 1 else (r(-3.0) if i == 3 else 0.0)
        typ.append(("hand.L", f, "rotation_euler", (down_l * r(9.0) if tap else 0.0, 0.0, yaw)))
        typ.append(("forearm.L", f, "rotation_euler", (down_fa_l * r(1.5) if tap else 0.0, 0.0, 0.0)))
    make_action(arm, "type", TYPE_FRAMES + 1, typ)

    # click: quick press of the right hand on the mouse.
    clk = [
        ("hand.R", 1, "rotation_euler", (0, 0, 0)),
        ("hand.R", 1 + CLICK_FRAMES // 3, "rotation_euler", (down_r * r(6.0), 0, 0)),
        ("hand.R", CLICK_FRAMES + 1, "rotation_euler", (0, 0, 0)),
        ("forearm.R", 1, "rotation_euler", (0, 0, 0)),
        ("forearm.R", 1 + CLICK_FRAMES // 3, "rotation_euler", (down_fa_r * r(0.8), 0, 0)),
        ("forearm.R", CLICK_FRAMES + 1, "rotation_euler", (0, 0, 0)),
    ]
    make_action(arm, "click", CLICK_FRAMES + 1, clk)


def add_empty(name, location):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "SPHERE"
    e.empty_display_size = 0.03
    e.location = location
    bpy.context.scene.collection.objects.link(e)
    return e


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_render_scene(scene):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = RENDER_W
    scene.render.resolution_y = RENDER_H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.fps = FPS
    try:
        scene.eevee.taa_render_samples = RENDER_SAMPLES
    except AttributeError:
        pass
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except TypeError:
        pass

    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.55, 0.58, 0.63, 1.0)
        bg.inputs[1].default_value = 0.8

    def light(name, kind, loc, energy, size=None, target=(0, -0.1, 0.8)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        if size is not None and kind == "AREA":
            ld.size = size
        if kind == "SUN":
            ld.angle = radians(3)
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        scene.collection.objects.link(lo)
        aim(lo, target)
        return lo

    light("key", "AREA", (-2.2, -2.6, 3.0), 220, size=2.5)
    light("fill", "AREA", (2.8, -1.8, 1.8), 70, size=3.0)
    light("rim", "AREA", (0.5, 2.5, 2.5), 90, size=2.0)
    light("sun", "SUN", (1.5, 1.0, 4.0), 0.35)

    ground = make_material("Ground", (0.72, 0.72, 0.74), roughness=0.9)
    g = add_part("ground", [Vector((-4, -4, 0)), Vector((4, -4, 0)), Vector((4, 4, 0)), Vector((-4, 4, 0))],
                 [(0, 1, 2, 3)], ground, smooth=False, subsurf=False, register=False)
    g.hide_render = False

    # Render-only props so the hand placement can be judged: a translucent
    # desk slab, a mouse under the right hand, a keyboard under the left.
    desk = make_material("DeskHelper", (0.35, 0.30, 0.26), roughness=0.8)
    desk_bsdf = desk.node_tree.nodes.get("Principled BSDF")
    if desk_bsdf is not None and "Alpha" in desk_bsdf.inputs:
        desk_bsdf.inputs["Alpha"].default_value = 0.3
    for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
        try:
            setattr(desk, attr, value)
        except Exception:
            pass
    box("desk_helper", (-0.05, -0.48, DESK_HEIGHT - 0.012), (1.0, 0.56, 0.024), desk)
    prop = make_material("PropHelper", (0.25, 0.26, 0.28), roughness=0.6)
    box("mouse_helper", (HAND_R_TARGET[0], HAND_R_TARGET[1], DESK_HEIGHT + 0.017), (0.062, 0.105, 0.034), prop)
    box("keyboard_helper", (HAND_L_TARGET[0] - 0.05, HAND_L_TARGET[1], DESK_HEIGHT + 0.007), (0.42, 0.14, 0.014), prop)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_view(scene, cam, filename, loc, target, lens=50.0):
    cam.location = loc
    cam.data.lens = lens
    aim(cam, target)
    scene.render.filepath = os.path.join(OUT_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print(f"[figure] rendered {scene.render.filepath}")


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
def inspect_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise RuntimeError("not a GLB file")
    chunk_len, _chunk_type = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20:20 + chunk_len].decode("utf-8"))
    nodes = js.get("nodes", [])
    anims = [a.get("name") for a in js.get("animations", [])]
    for a in js.get("animations", []):
        duration = max(js["accessors"][s["input"]]["max"][0] for s in a["samplers"])
        targets = sorted({nodes[c["target"]["node"]].get("name") for c in a["channels"]})
        print(f"[figure] clip '{a.get('name')}': {duration:.3f} s, {len(a['channels'])} channels on {targets}")
    joints = [nodes[j].get("name") for j in js["skins"][0]["joints"]] if js.get("skins") else []
    tris = 0
    for m in js.get("meshes", []):
        for p in m.get("primitives", []):
            if p.get("mode", 4) != 4:
                continue
            acc = js["accessors"][p["indices"]] if "indices" in p else js["accessors"][p["attributes"]["POSITION"]]
            tris += acc["count"] // 3
    exts = js.get("extensionsUsed", [])
    print(f"[figure] GLB nodes: {[n.get('name') for n in nodes]}")
    print(f"[figure] GLB joints: {joints}")
    print(f"[figure] GLB animations: {anims}")
    print(f"[figure] GLB triangles: {tris}, extensions: {exts}, size: {len(data)} bytes ({len(data) / 1e6:.2f} MB)")
    return anims, joints, tris


def export_glb(path, objects, mode="ACTIONS"):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_texcoords=False,
        export_colors=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_skins=True,
        export_def_bones=False,
        export_rest_position_armature=True,
        export_animations=True,
        export_animation_mode=mode,
        export_frame_range=False,
        export_force_sampling=True,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        # Drop constant channels: an idle clip that also pins the arm bones to
        # rest would fight the runtime two-bone IK.
        export_optimize_animation_keep_anim_armature=False,
        export_anim_single_armature=True,
        # No Draco, for the same reason as the office: decoding cost far more
        # than the bytes it saved.
        export_draco_mesh_compression_enable=False,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
    )
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    dropped = [k for k in kwargs if k not in props]
    if dropped:
        print(f"[figure] exporter ignores unknown options: {dropped}")
    kwargs = {k: v for k, v in kwargs.items() if k in props}
    bpy.ops.export_scene.gltf(**kwargs)
    print(f"[figure] exported {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--export", action="store_true")
    ap.add_argument("--pose-test", action="store_true", help="extra render with the right arm rotated to judge skinning")
    ap.add_argument("--out", default=DEFAULT_OUT_DIR)
    return ap.parse_args(argv)


def main():
    global OUT_DIR
    args = parse_args()
    OUT_DIR = args.out
    os.makedirs(OUT_DIR, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS

    mats = {
        "Skin": make_material("Skin", SKIN_COLOR, roughness=0.7, specular=0.25),
        "Shirt": make_material("Shirt", SHIRT_COLOR, roughness=0.75, specular=0.2),
        "Trousers": make_material("Trousers", TROUSER_COLOR, roughness=0.8, specular=0.2),
        "Shoes": make_material("Shoes", SHOE_COLOR, roughness=0.35, specular=0.5),
        "Belt": make_material("Belt", BELT_COLOR, roughness=0.45, specular=0.4),
        "Headset": make_material("Headset", HEADSET_COLOR, roughness=0.45, specular=0.4),
    }

    joints = build_figure(mats)
    figure = join_parts(FIGURE_NAME)
    tris = sum(len(p.vertices) - 2 for p in figure.data.polygons)
    print(f"[figure] mesh: {len(figure.data.vertices)} vertices, {len(figure.data.polygons)} faces, {tris} triangles")

    arm = build_armature(joints)
    skin_mesh(figure, arm)
    build_animations(arm)
    targets = [add_empty("hand_r_target", HAND_R_TARGET), add_empty("hand_l_target", HAND_L_TARGET)]

    if args.render or args.pose_test:
        cam = setup_render_scene(scene)
        if args.render:
            render_view(scene, cam, "front.png", (0.0, -3.3, 0.95), (0.0, -0.2, 0.72))
            # Figure's right is -X: three-quarter from the front-right.
            render_view(scene, cam, "three_quarter.png", (-2.5, -2.3, 1.35), (0.0, -0.2, 0.72))
            # Behind the right shoulder, looking at where the monitor would stand.
            render_view(scene, cam, "over_shoulder.png", (-0.95, 1.2, 1.62), (0.05, -0.9, 0.95), lens=35.0)
        if args.pose_test:
            ua = arm.pose.bones["upper_arm.R"]
            fa = arm.pose.bones["forearm.R"]
            ua.rotation_euler = (radians(-25), 0, radians(15))
            fa.rotation_euler = (radians(-35), 0, 0)
            bpy.context.view_layer.update()
            render_view(scene, cam, "pose_test.png", (-2.7, -2.5, 1.35), (0.0, -0.2, 0.72))
            reset_pose(arm)

    if args.export:
        for o in HELPERS:
            o.hide_set(True)
        path = os.path.join(OUT_DIR, "figure.glb")
        export_glb(path, [figure, arm] + targets, mode="ACTIONS")
        anims, _joints, _tris = inspect_glb(path)
        if not {"idle", "type", "click"} <= set(anims):
            print("[figure] ACTIONS mode missed the stashed clips; re-exporting with NLA_TRACKS")
            export_glb(path, [figure, arm] + targets, mode="NLA_TRACKS")
            inspect_glb(path)


OUT_DIR = DEFAULT_OUT_DIR
if __name__ == "__main__":
    main()

"""
build_office.py -- parametric 3D office for the VerbaTrace scroll-driven landing page.

Groundwork only: geometry, materials, lighting for previews, five named cameras,
preview renders and a Draco-compressed GLB. No characters, no baking.

Run headless from PowerShell:

    & "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b --python build_office.py -- `
        --out <output folder> --render --export --blend

Everything after "--" belongs to this script. Outputs go to --out (renders as
<camera>.png, office.glb, office.blend); the script never writes next to itself.

Conventions:
- Z is up, metres. The glTF exporter converts to Y-up on export.
- Floor 1 sits at z=0, floor 2 at z=F2_Z. The window wall runs along X at y=ROOM_Y.
- A workstation's local frame has the seated person facing +Y (toward its partition).
- Repeated furniture (chairs, monitors, keyboards...) shares mesh data, so the GLB
  stores each piece once and instances it via nodes.
- Screens are separate quads named screen_<index> with UVs and their own material,
  so the web app can swap them for a live UI texture.
"""

import argparse
import math
import os
import random
import sys
import time

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# =============================================================================
# Parameters (metres, degrees where noted)
# =============================================================================

# --- Floor-1 workstation layout ---
ROWS = 4                    # desk rows, parallel to the window wall (along X)
PODS_PER_ROW = 3            # a pod = two desks facing each other across a partition
HERO_WS_INDEX = 8           # workstation the camera approaches (index = (row*PODS_PER_ROW + pod)*2 + side)
RANDOM_SEED = 7             # chair rotation and desk clutter are seeded so builds are reproducible

# --- Building envelope ---
ROOM_X = 21.5               # interior length; the window wall runs along X
ROOM_Y = 17.0               # interior depth; the window wall is at y = ROOM_Y
WALL_T = 0.2                # outer wall thickness
CEIL_H = 3.0                # floor-1 ceiling height (underside of the floor-2 slab)
SLAB_T = 0.4                # floor-2 slab thickness
F2_Z = CEIL_H + SLAB_T      # floor-2 finished floor level
F2_CEIL_H = 3.0             # floor-2 ceiling height
ROOF_T = 0.4
TILE = 0.6                  # carpet tile size
MULLION_PITCH = 1.5         # window mullion spacing
COLUMN_SIZE = 0.4
COLUMN_POSITIONS = ((7.0, 5.0), (7.0, 12.0), (15.0, 5.0), (15.0, 12.0))

# --- Atrium void in the floor-2 slab and the straight stair inside it ---
VOID_X = (0.0, 6.0)         # starts at the west wall so the stair can hug the wall
VOID_Y = (4.0, 10.0)
STAIR_X0 = 0.1              # stair runs along +Y next to the west wall (10 cm shadow gap)
STAIR_W = 1.2
STAIR_Y0 = 4.4              # first riser
STEP_TREAD = 0.28
STEP_COUNT = 20             # rise = F2_Z / STEP_COUNT = 0.17 m
BALUSTRADE_H = 1.1

# --- Desk pods ---
DESK_W = 1.6
DESK_D = 0.8
DESK_H = 0.74               # top surface height
DESK_TOP_T = 0.028
POD_GAP = 0.06              # gap between neighbouring pods in a row (bench style)
ROW_PITCH = 3.4             # row-to-row distance; leaves ~1.3 m aisles between chairs
ROW_Y0 = 3.6                # first row centre line
DESK_ZONE_X = (7.0, 16.0)   # desks are centred in this X span (between atrium zone and leader office)
PARTITION_H = 0.5           # acoustic screen height above the desk top
PARTITION_T = 0.04
MONITOR_DIAG_IN = 24        # call-centre monitors
LEADER_MONITOR_DIAG_IN = 27 # managers get two 27" monitors
CHAIR_SETBACK = 0.62        # chair centre behind the desk centre line
PLANT_CHANCE = 0.2          # share of desks with a small plant
CUP_CHANCE = 0.5
NOTEBOOK_CHANCE = 0.3
BIN_CHANCE = 0.6
ACCENT_CHAIR_WS = 3         # the single orange chair (product accent, used sparingly)

# --- Leader's glass office (floor 1, far end, window corner) ---
LEADER_OFFICE = (16.0, ROOM_X, 10.5, ROOM_Y)   # x0, x1, y0, y1
LEADER_DOOR_T = 0.5         # door position along the west glass wall, from its y0 end
DOOR_W = 0.95
DOOR_H = 2.1
DOOR_OPEN_DEG = 35          # doors stand slightly open so they read as doors
GLASS_POST_PITCH = 1.25
GLASS_T = 0.012             # pane thickness
GLASS_PREVIEW_ALPHA = 0.22  # preview-only alpha for glass; the GLB gets alpha = 1 + transmission
GLASS_MATERIALS = []        # filled by make_material so export_glb can strip the preview alpha

# --- Floor-2 rooms (both have glass fronts toward the atrium) ---
OWNER_ROOM = (0.0, 7.0, 11.0, ROOM_Y)          # corner office north of the void, glass front at y=11
DEPUTY_ROOM = (7.6, 12.6, 4.0, 10.0)           # east of the void, glass front at x=7.6

# --- Cameras (16:10) ---
CAM_OTS_OFFSET = (0.45, -1.75, 1.7)    # over-the-shoulder camera in workstation space
CAM_OTS_TARGET = (-0.02, 0.5, 0.92)    # aim just past the monitor so the room behind stays in frame
CAM_OTS_LENS = 32
CAM_WIDE_LENS = 20
CAM_WIDE_POS = (0.6, 0.6, 2.35)        # below the first light panel row, high corner by the stair
CAM_WIDE_TARGET = (13.0, 11.0, 0.6)
RENDER_RES = (1280, 800)
RENDER_SAMPLES = 32

# --- Lighting (preview renders only; the GLB ships without lights) ---
SUN_DIR = (-0.55, -0.6, -0.42)  # low afternoon sun from the window side and +X: the lit strip reaches
                                # ~6 m into the room (two desk rows) and mullion shadows run diagonally
SUN_STRENGTH = 4.0
AREA_GRID = (3, 2)              # area lights per floor; each one casts shadows, so keep the count low
AREA_POWER = 170.0
AREA_SIZE = (2.4, 0.8)
WORLD_COLOR = (0.66, 0.72, 0.82)  # overcast-blue sky seen through the glazing
WORLD_STRENGTH = 0.7
SHADOW_POOL_MB = "1024"         # EEVEE shadow atlas; 13 shadow casters overflow the default
SCREEN_EMISSION = 1.0
PANEL_EMISSION = 6.0
LIGHT_PANEL_PITCH = (3.0, 2.4)

# --- Palette (calm neutrals; orange only as an accent) ---
ACCENT_ORANGE = (0.93, 0.42, 0.12)

# =============================================================================
# Small helpers
# =============================================================================

rad = math.radians


def log(msg):
    print("[office] " + msg, flush=True)


def safe_set(obj, attr, value):
    """Blender's EEVEE settings drift between versions; a missing attribute is not fatal."""
    if not hasattr(obj, attr):
        log("skip missing attribute %s.%s" % (type(obj).__name__, attr))
        return
    try:
        setattr(obj, attr, value)
    except (TypeError, ValueError) as exc:
        log("skip %s.%s=%r: %s" % (type(obj).__name__, attr, value, exc))


COLLECTIONS = {}


def collection(name):
    col = COLLECTIONS.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        COLLECTIONS[name] = col
    return col


def add_object(name, mesh, col, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    ob.rotation_euler = rot
    collection(col).objects.link(ob)
    return ob


def add_empty(name, col, loc, rot=(0, 0, 0), props=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = "ARROWS"
    ob.empty_display_size = 0.2
    ob.location = loc
    ob.rotation_euler = rot
    for k, v in (props or {}).items():
        ob[k] = v
    collection(col).objects.link(ob)
    return ob


def frame_matrix(loc, yaw):
    """World matrix of a local frame at loc rotated by yaw (radians) around Z."""
    return Matrix.Translation(Vector((loc[0], loc[1], loc[2] if len(loc) > 2 else 0.0))) @ Matrix.Rotation(yaw, 4, "Z")


def place(ob, matrix):
    loc, rot, _ = matrix.decompose()
    ob.location = loc
    ob.rotation_euler = rot.to_euler()


def look_at(ob, target):
    direction = Vector(target) - ob.location
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# =============================================================================
# Materials
# =============================================================================


def make_material(name, color, roughness=0.5, metallic=0.0, emission=None, emission_strength=1.0,
                  transmission=0.0, ior=1.45, double_sided=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
        mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["IOR"].default_value = ior
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        # EEVEE's screen-space refraction cannot see the room behind a pane (the pane itself owns
        # the depth buffer), so raytraced transmission renders interior glass as opaque grey.
        # For the previews the panes are alpha-blended instead; export_glb() restores alpha = 1
        # so the GLB carries clean KHR_materials_transmission glass.
        bsdf.inputs["Alpha"].default_value = GLASS_PREVIEW_ALPHA
        safe_set(mat, "surface_render_method", "BLENDED")
        safe_set(mat, "use_transparent_shadow", True)
        safe_set(mat, "show_transparent_back", False)
        safe_set(mat, "use_transparency_overlap", False)
        GLASS_MATERIALS.append(mat)
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.use_backface_culling = not double_sided
    mat.diffuse_color = (*color, 1.0)
    return mat


class Palette:
    pass


MAT = Palette()


def build_materials():
    m = MAT
    m.carpet_a = make_material("carpet_a", (0.30, 0.31, 0.33), roughness=0.95)
    m.carpet_b = make_material("carpet_b", (0.335, 0.345, 0.365), roughness=0.95)
    m.wall = make_material("wall_paint", (0.86, 0.86, 0.85), roughness=0.75)
    m.ceiling = make_material("ceiling_white", (0.93, 0.93, 0.93), roughness=0.8)
    m.concrete = make_material("column_paint", (0.78, 0.78, 0.76), roughness=0.7)
    m.ground = make_material("ground_outside", (0.42, 0.42, 0.41), roughness=0.95)
    m.exterior = make_material("exterior_render", (0.52, 0.51, 0.49), roughness=0.85)
    m.panel_frame = make_material("light_panel_frame", (0.9, 0.9, 0.9), roughness=0.5)
    m.panel_light = make_material("light_panel_diffuser", (1.0, 1.0, 1.0), roughness=0.6,
                                  emission=(1.0, 0.98, 0.94), emission_strength=PANEL_EMISSION)
    m.laminate = make_material("desk_laminate_oak", (0.56, 0.42, 0.27), roughness=0.45)
    m.walnut = make_material("wood_walnut", (0.20, 0.12, 0.07), roughness=0.4)
    m.white_lam = make_material("laminate_white", (0.9, 0.9, 0.88), roughness=0.4)
    m.frame = make_material("metal_dark", (0.08, 0.08, 0.09), roughness=0.4, metallic=0.9)
    m.chrome = make_material("metal_chrome", (0.8, 0.8, 0.82), roughness=0.2, metallic=1.0)
    m.plastic_black = make_material("plastic_black", (0.03, 0.03, 0.035), roughness=0.5)
    m.plastic_dark = make_material("plastic_dark_grey", (0.12, 0.12, 0.13), roughness=0.6)
    m.plastic_grey = make_material("plastic_grey", (0.5, 0.5, 0.52), roughness=0.55)
    m.fabric = make_material("chair_fabric_grey", (0.16, 0.17, 0.19), roughness=0.9)
    m.fabric_accent = make_material("chair_fabric_orange", ACCENT_ORANGE, roughness=0.9)
    m.leather = make_material("chair_leather_black", (0.04, 0.04, 0.045), roughness=0.45)
    m.sofa = make_material("sofa_fabric", (0.36, 0.35, 0.34), roughness=0.9)
    m.partition = make_material("partition_fabric", (0.56, 0.60, 0.64), roughness=0.95)
    m.glass = make_material("glass_clear", (0.92, 0.96, 0.97), roughness=0.02, transmission=1.0, ior=1.45,
                            double_sided=True)
    m.leaf = make_material("plant_leaf", (0.12, 0.34, 0.14), roughness=0.6, double_sided=True)
    m.pot = make_material("plant_pot", (0.78, 0.76, 0.72), roughness=0.5)
    m.soil = make_material("plant_soil", (0.12, 0.09, 0.06), roughness=1.0)
    m.ceramic = make_material("ceramic_white", (0.95, 0.95, 0.93), roughness=0.3)
    m.paper = make_material("paper", (0.95, 0.94, 0.9), roughness=0.9)
    m.accent = make_material("accent_orange", ACCENT_ORANGE, roughness=0.6)
    m.logo_panel = make_material("logo_panel_dark", (0.14, 0.15, 0.17), roughness=0.6)
    m.stair = make_material("stair_concrete", (0.66, 0.65, 0.63), roughness=0.8)
    m.stair_tread = make_material("stair_tread_oak", (0.62, 0.49, 0.33), roughness=0.5)
    m.rubber = make_material("rubber_black", (0.02, 0.02, 0.02), roughness=0.8)


def screen_material(name):
    # Off-white with a faint blue cast and mild emission so the preview reads as a lit display.
    return make_material(name, (0.05, 0.06, 0.08), roughness=0.25,
                         emission=(0.80, 0.85, 0.93), emission_strength=SCREEN_EMISSION)


# =============================================================================
# Mesh builder: accumulates primitives into one mesh with material slots
# =============================================================================


class MeshBuilder:
    def __init__(self):
        self.bm = bmesh.new()
        self.materials = []

    def _slot(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def _merge(self, part, mat, rot=(0, 0, 0), center=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(part, faces=part.faces)
        m = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(part, matrix=m, verts=part.verts)
        idx = self._slot(mat)
        tmp = bpy.data.meshes.new("_part")
        part.to_mesh(tmp)
        part.free()
        for p in tmp.polygons:
            p.material_index = idx
        # from_mesh appends, which is how several parts end up in one mesh
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    def box(self, size, center=(0, 0, 0), mat=None, bevel=0.0, segments=2, rot=(0, 0, 0)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            bevel = min(bevel, min(size) * 0.45)
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segments, affect="EDGES",
                            profile=0.5, clamp_overlap=True)
            for f in bm.faces:
                f.smooth = True
        self._merge(bm, mat, rot, center)

    def cylinder(self, radius, depth, segments=16, center=(0, 0, 0), mat=None, axis="Z", radius2=None,
                 rot=(0, 0, 0), smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                              radius2=radius if radius2 is None else radius2, depth=depth)
        if smooth:
            for f in bm.faces:
                f.smooth = len(f.verts) <= 4
            for e in bm.edges:
                if any(len(f.verts) > 4 for f in e.link_faces):
                    e.smooth = False
        axis_rot = {"Z": (0, 0, 0), "X": (0, rad(90), 0), "Y": (rad(90), 0, 0)}[axis]
        m = Euler(axis_rot, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
        self._merge(bm, mat, rot, center)

    def sphere(self, radius, center=(0, 0, 0), mat=None, u=12, v=8, scale=(1, 1, 1), rot=(0, 0, 0)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=radius)
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
        for f in bm.faces:
            f.smooth = True
        self._merge(bm, mat, rot, center)

    def torus_arc(self, major, minor, angle_deg, seg_major=12, seg_minor=6, center=(0, 0, 0), mat=None,
                  rot=(0, 0, 0), start_deg=0.0):
        """Tube swept along an arc in the XY plane (rotate it into place with rot)."""
        bm = bmesh.new()
        rings = []
        for i in range(seg_major + 1):
            a = rad(start_deg + angle_deg * i / seg_major)
            ring = []
            for j in range(seg_minor):
                b = 2 * math.pi * j / seg_minor
                r = major + minor * math.cos(b)
                ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
            rings.append(ring)
        for i in range(seg_major):
            for j in range(seg_minor):
                f = bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % seg_minor],
                                  rings[i][(j + 1) % seg_minor]))
                f.smooth = True
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
        self._merge(bm, mat, rot, center)

    def face(self, verts, mat):
        """A single flat polygon from explicit world-space points."""
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(Vector(v)) for v in verts])
        self._merge(bm, mat)

    def leaf(self, base, length, width, yaw_deg, tilt_deg, curl, mat, segments=3):
        """Tapered strip that droops along its length; cheap but reads as a broad leaf."""
        bm = bmesh.new()
        rows = []
        for k in range(segments + 1):
            t = k / segments
            y = length * t
            z = -curl * length * t * t
            if k == segments:
                rows.append([bm.verts.new((0.0, y, z))])
            else:
                w = width * max(0.18, math.sin(math.pi * (0.1 + 0.9 * t)))
                rows.append([bm.verts.new((-w / 2, y, z)), bm.verts.new((w / 2, y, z))])
        for k in range(segments):
            a, b = rows[k], rows[k + 1]
            if len(b) == 1:
                f = bm.faces.new((a[0], a[1], b[0]))
            else:
                f = bm.faces.new((a[0], a[1], b[1], b[0]))
            f.smooth = True
        self._merge(bm, mat, (rad(tilt_deg), 0, rad(yaw_deg)), base)

    def build(self, name):
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.materials:
            mesh.materials.append(m)
        mesh.validate()
        mesh.update()
        return mesh


def screen_mesh(name, w, h):
    """Flat quad facing -Y with 0..1 UVs; the web app maps a live UI texture onto it."""
    mesh = bpy.data.meshes.new(name)
    verts = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="UVMap")
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for i, loop in enumerate(mesh.loops):
        uv.data[i].uv = uvs[loop.vertex_index]
    mesh.materials.append(screen_material(name))
    mesh.update()
    return mesh


def tile_floor(name, rects, z, col, mats):
    """Carpet tiles as a checker of two near-identical greys, clipped to the given rectangles."""
    verts, faces, mat_idx = [], [], []
    for (x0, x1, y0, y1) in rects:
        i0, i1 = math.floor(x0 / TILE), math.ceil(x1 / TILE)
        j0, j1 = math.floor(y0 / TILE), math.ceil(y1 / TILE)
        for i in range(i0, i1):
            for j in range(j0, j1):
                ax, bx = max(x0, i * TILE), min(x1, (i + 1) * TILE)
                ay, by = max(y0, j * TILE), min(y1, (j + 1) * TILE)
                if bx - ax < 1e-4 or by - ay < 1e-4:
                    continue
                base = len(verts)
                verts += [(ax, ay, z), (bx, ay, z), (bx, by, z), (ax, by, z)]
                faces.append((base, base + 1, base + 2, base + 3))
                mat_idx.append((i + j) % 2)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    for m in mats:
        mesh.materials.append(m)
    for p, mi in zip(mesh.polygons, mat_idx):
        p.material_index = mi
    mesh.update()
    return add_object(name, mesh, col)


# =============================================================================
# Furniture templates (built once, instanced by linking mesh data)
# =============================================================================


def monitor_size(diag_in):
    """16:9 panel: returns (screen_w, screen_h, body_w, body_h)."""
    d = diag_in * 0.0254
    w = d * 16 / math.sqrt(16 ** 2 + 9 ** 2)
    h = w * 9 / 16
    return w, h, w + 0.028, h + 0.034


MON_Y = 0.20              # monitor stand position along the desk depth (local +Y = away from the person)
MON_BODY_T = 0.024
MON_SCREEN_CENTER_ABOVE_DESK = 0.26   # puts the top of a 24" screen about at seated eye level


def build_monitor(diag_in):
    """Slim bezel display on a slim neck and a flat foot; screen faces -Y (the person)."""
    sw, sh, bw, bh = monitor_size(diag_in)
    b = MeshBuilder()
    zc = MON_SCREEN_CENTER_ABOVE_DESK + sh * 0.05   # bezel is a touch taller at the bottom (chin)
    b.box((bw, MON_BODY_T, bh), (0, MON_Y, zc), MAT.plastic_black, bevel=0.004, segments=1)
    b.box((bw * 0.5, 0.03, bh * 0.6), (0, MON_Y + MON_BODY_T / 2 + 0.012, zc), MAT.plastic_dark)
    b.box((0.06, 0.022, zc), (0, MON_Y + MON_BODY_T / 2 + 0.03, zc / 2 + 0.005), MAT.plastic_dark)
    b.box((0.26, 0.20, 0.012), (0, MON_Y + 0.04, 0.006), MAT.plastic_dark, bevel=0.005, segments=1)
    return b.build("monitor_%din" % diag_in), sw, sh, zc


def build_desk(w, d, top_mat, name):
    """Laminate top on two T-shaped steel legs with a rear cable rail."""
    b = MeshBuilder()
    b.box((w, d, DESK_TOP_T), (0, 0, DESK_H - DESK_TOP_T / 2), top_mat, bevel=0.004, segments=1)
    leg_h = DESK_H - DESK_TOP_T
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.12)
        b.box((0.06, 0.06, leg_h - 0.04), (x, 0, (leg_h - 0.04) / 2 + 0.02), MAT.frame)
        b.box((0.07, d - 0.16, 0.03), (x, 0, 0.015), MAT.frame)               # foot
        b.box((0.07, d - 0.2, 0.03), (x, 0, leg_h - 0.015), MAT.frame)        # top bracket
    b.box((w - 0.4, 0.05, 0.10), (0, d / 2 - 0.12, leg_h - 0.08), MAT.frame)  # cable tray / modesty rail
    return b.build(name)


def build_keyboard():
    b = MeshBuilder()
    b.box((0.44, 0.145, 0.018), (0, 0, 0.009), MAT.plastic_black, bevel=0.003, segments=1)
    b.box((0.42, 0.12, 0.008), (0, 0.004, 0.02), MAT.plastic_dark)
    return b.build("keyboard")


def build_mouse():
    b = MeshBuilder()
    b.sphere(1.0, (0, 0, 0.016), MAT.plastic_black, u=12, v=8, scale=(0.031, 0.055, 0.02))
    return b.build("mouse")


def build_headset_stand():
    """Small stand with the headset hanging on its hook."""
    b = MeshBuilder()
    b.cylinder(0.06, 0.01, 16, (0, 0, 0.005), MAT.frame)
    b.box((0.014, 0.014, 0.25), (0, 0, 0.135), MAT.frame)
    b.box((0.05, 0.03, 0.012), (0, 0, 0.264), MAT.frame)
    R = 0.085
    zc = 0.27 - R                 # band top rests on the hook
    b.torus_arc(R, 0.009, 180, 14, 6, (0, 0, zc), MAT.plastic_black, rot=(rad(90), 0, 0))
    for sx in (-1, 1):
        b.cylinder(0.038, 0.03, 14, (sx * R, 0, zc - 0.012), MAT.plastic_black, axis="X")
        b.cylinder(0.031, 0.012, 12, (sx * (R - 0.019), 0, zc - 0.012), MAT.fabric, axis="X")
    b.cylinder(0.004, 0.10, 6, (-R - 0.02, 0.05, zc - 0.03), MAT.plastic_black, axis="Y")
    return b.build("headset_stand")


def build_cup():
    b = MeshBuilder()
    b.cylinder(0.04, 0.095, 16, (0, 0, 0.0475), MAT.ceramic)
    b.torus_arc(0.024, 0.005, 180, 8, 6, (0.04, 0, 0.05), MAT.ceramic, rot=(rad(90), rad(90), 0))
    return b.build("cup")


def build_bin():
    b = MeshBuilder()
    b.cylinder(0.12, 0.30, 14, (0, 0, 0.15), MAT.plastic_dark, radius2=0.135)
    return b.build("waste_bin")


def build_notebook():
    b = MeshBuilder()
    b.box((0.21, 0.29, 0.012), (0, 0, 0.006), MAT.paper, rot=(0, 0, rad(8)))
    b.box((0.14, 0.006, 0.006), (0.02, 0.05, 0.015), MAT.plastic_black, rot=(0, 0, rad(-20)))  # pen
    return b.build("notebook")


def build_plant(name, pot_r, pot_h, leaf_len, leaf_w, leaves, rng):
    b = MeshBuilder()
    b.cylinder(pot_r * 0.8, pot_h, 20, (0, 0, pot_h / 2), MAT.pot, radius2=pot_r)
    b.cylinder(pot_r * 0.94, 0.02, 20, (0, 0, pot_h - 0.02), MAT.soil)
    for i in range(leaves):
        yaw = 360 * i / leaves + rng.uniform(-15, 15)
        tilt = rng.uniform(35, 65)
        b.leaf((0, 0, pot_h - 0.01), leaf_len * rng.uniform(0.8, 1.15), leaf_w, yaw, tilt, 0.55, MAT.leaf)
    return b.build(name)


def build_task_chair(name, fabric):
    """Five-star office chair facing +Y (the person's front); origin on the floor under the column."""
    b = MeshBuilder()
    b.cylinder(0.045, 0.06, 16, (0, 0, 0.09), MAT.plastic_black)                # hub
    for i in range(5):
        a = rad(90 + i * 72)
        c = math.cos(a), math.sin(a)
        b.box((0.30, 0.05, 0.035), (c[0] * 0.17, c[1] * 0.17, 0.075), MAT.plastic_black, rot=(0, 0, a))
        b.box((0.035, 0.028, 0.045), (c[0] * 0.31, c[1] * 0.31, 0.055), MAT.plastic_black, rot=(0, 0, a))
        b.cylinder(0.03, 0.024, 10, (c[0] * 0.31, c[1] * 0.31, 0.03), MAT.rubber, axis="Y", rot=(0, 0, a))
    b.cylinder(0.036, 0.13, 16, (0, 0, 0.155), MAT.plastic_black)              # column sleeve
    b.cylinder(0.028, 0.30, 16, (0, 0, 0.25), MAT.chrome)                      # gas lift
    b.box((0.28, 0.28, 0.05), (0, 0, 0.385), MAT.plastic_black)                # mechanism
    b.box((0.50, 0.50, 0.08), (0, 0, 0.45), fabric, bevel=0.025, segments=2)    # seat, top at 0.49
    b.box((0.08, 0.06, 0.22), (0, -0.24, 0.50), MAT.plastic_black)             # back support
    b.box((0.46, 0.06, 0.52), (0, -0.26, 0.80), fabric, bevel=0.02, segments=2, rot=(rad(8), 0, 0))
    for sx in (-1, 1):
        b.box((0.03, 0.05, 0.22), (sx * 0.27, -0.05, 0.56), MAT.plastic_black)
        b.box((0.06, 0.26, 0.025), (sx * 0.27, -0.02, 0.68), MAT.plastic_black, bevel=0.008, segments=1)
    return b.build(name)


def build_side_chair(name):
    """Simple four-leg visitor chair facing +Y."""
    b = MeshBuilder()
    b.box((0.44, 0.44, 0.05), (0, 0, 0.445), MAT.fabric, bevel=0.015, segments=2)
    b.box((0.42, 0.035, 0.36), (0, -0.2, 0.66), MAT.fabric, bevel=0.012, segments=2, rot=(rad(6), 0, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cylinder(0.012, 0.42, 8, (sx * 0.19, sy * 0.19, 0.21), MAT.frame)
    return b.build(name)


def build_partition(w):
    b = MeshBuilder()
    b.box((w, PARTITION_T, PARTITION_H), (0, 0, DESK_H - 0.02 + PARTITION_H / 2), MAT.partition)
    b.box((w + 0.01, PARTITION_T + 0.01, 0.02), (0, 0, DESK_H - 0.02 + PARTITION_H + 0.01), MAT.frame)
    return b.build("partition")


def build_light_panel():
    """Linear ceiling luminaire: white housing with a slightly proud emissive diffuser."""
    b = MeshBuilder()
    b.box((1.22, 0.17, 0.05), (0, 0, -0.025), MAT.panel_frame)
    b.box((1.18, 0.13, 0.02), (0, 0, -0.052), MAT.panel_light)
    return b.build("light_panel")


def build_sofa(name, w, seats):
    """Two-seat sofa (or armchair when seats=1) facing +Y."""
    b = MeshBuilder()
    d = 0.85
    b.box((w, d, 0.2), (0, 0, 0.22), MAT.sofa, bevel=0.02, segments=1)
    cw = (w - 0.3) / seats
    for i in range(seats):
        x = -w / 2 + 0.15 + cw * (i + 0.5)
        b.box((cw - 0.03, 0.6, 0.16), (x, 0.08, 0.40), MAT.sofa, bevel=0.04, segments=2)
    b.box((w, 0.22, 0.44), (0, -d / 2 + 0.11, 0.54), MAT.sofa, bevel=0.04, segments=2)
    for sx in (-1, 1):
        b.box((0.14, d, 0.30), (sx * (w / 2 - 0.07), 0, 0.47), MAT.sofa, bevel=0.03, segments=2)
        for sy in (-1, 1):
            b.cylinder(0.015, 0.12, 8, (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), 0.06), MAT.chrome)
    return b.build(name)


def build_coffee_table():
    b = MeshBuilder()
    b.cylinder(0.4, 0.03, 24, (0, 0, 0.415), MAT.walnut)
    b.cylinder(0.03, 0.38, 12, (0, 0, 0.21), MAT.frame)
    b.cylinder(0.25, 0.02, 20, (0, 0, 0.01), MAT.frame)
    return b.build("coffee_table")


def build_meeting_table():
    b = MeshBuilder()
    b.cylinder(0.5, 0.03, 28, (0, 0, DESK_H - 0.015), MAT.white_lam)
    b.cylinder(0.04, DESK_H - 0.05, 12, (0, 0, (DESK_H - 0.05) / 2 + 0.02), MAT.chrome)
    b.cylinder(0.3, 0.02, 24, (0, 0, 0.01), MAT.frame)
    return b.build("meeting_table")


def build_cabinet(name, w, d, h, mat):
    """Two-door sideboard; the doors are suggested by a shadow gap and two handles."""
    b = MeshBuilder()
    b.box((w, d, h - 0.08), (0, 0, (h - 0.08) / 2 + 0.06), mat, bevel=0.003, segments=1)
    b.box((w + 0.02, d + 0.02, 0.02), (0, 0, h - 0.01), mat)
    b.box((0.006, 0.01, h - 0.16), (0, -d / 2 - 0.002, (h - 0.08) / 2 + 0.06), MAT.plastic_black)
    for sx in (-1, 1):
        b.cylinder(0.006, 0.12, 8, (sx * 0.06, -d / 2 - 0.012, h * 0.55), MAT.chrome)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.04, 0.04, 0.06), (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0.03), MAT.frame)
    return b.build(name)


def build_column():
    b = MeshBuilder()
    b.box((COLUMN_SIZE, COLUMN_SIZE, CEIL_H), (0, 0, CEIL_H / 2), MAT.concrete)
    return b.build("column")


TEMPLATES = {}


def build_templates(rng):
    t = TEMPLATES
    t["monitor_24"] = build_monitor(MONITOR_DIAG_IN)
    t["monitor_27"] = build_monitor(LEADER_MONITOR_DIAG_IN)
    t["desk"] = build_desk(DESK_W, DESK_D, MAT.laminate, "desk_pod")
    t["desk_leader"] = build_desk(1.8, 0.9, MAT.white_lam, "desk_leader")
    t["desk_exec"] = build_desk(2.0, 0.9, MAT.walnut, "desk_exec")
    t["desk_deputy"] = build_desk(1.8, 0.8, MAT.white_lam, "desk_deputy")
    t["keyboard"] = build_keyboard()
    t["mouse"] = build_mouse()
    t["headset"] = build_headset_stand()
    t["cup"] = build_cup()
    t["notebook"] = build_notebook()
    t["bin"] = build_bin()
    t["plant_desk"] = build_plant("plant_desk", 0.055, 0.11, 0.16, 0.07, 6, rng)
    t["plant_floor"] = build_plant("plant_floor", 0.2, 0.42, 0.55, 0.22, 9, rng)
    t["chair"] = build_task_chair("chair_task", MAT.fabric)
    t["chair_accent"] = build_task_chair("chair_task_orange", MAT.fabric_accent)
    t["chair_exec"] = build_task_chair("chair_exec", MAT.leather)
    t["chair_side"] = build_side_chair("chair_side")
    t["partition"] = build_partition(DESK_W + POD_GAP)
    t["light_panel"] = build_light_panel()
    t["sofa"] = build_sofa("sofa_2seat", 1.7, 2)
    t["armchair"] = build_sofa("armchair", 0.85, 1)
    t["coffee_table"] = build_coffee_table()
    t["meeting_table"] = build_meeting_table()
    t["cabinet"] = build_cabinet("cabinet_white", 1.2, 0.45, 1.1, MAT.white_lam)
    t["cabinet_walnut"] = build_cabinet("cabinet_walnut", 1.6, 0.45, 0.8, MAT.walnut)
    t["column"] = build_column()


# =============================================================================
# Placement helpers
# =============================================================================


def instance(template_key, name, col, frame, local=(0, 0, 0), yaw_deg=0.0):
    """Link a template mesh into a new object positioned in a local frame (matrix)."""
    mesh = TEMPLATES[template_key]
    if isinstance(mesh, tuple):
        mesh = mesh[0]
    ob = bpy.data.objects.new(name, mesh)
    place(ob, frame @ frame_matrix(local, rad(yaw_deg)))
    collection(col).objects.link(ob)
    return ob


def place_monitor(diag_key, screen_name, col, frame, local=(0, 0, 0), yaw_deg=0.0):
    """Monitor body (instanced) plus its own screen quad. Returns the screen centre in world space."""
    mesh, sw, sh, zc = TEMPLATES[diag_key]
    m = frame @ frame_matrix(local, rad(yaw_deg))
    body = bpy.data.objects.new(screen_name.replace("screen", "monitor", 1), mesh)
    place(body, m)
    collection(col).objects.link(body)
    screen = bpy.data.objects.new(screen_name, screen_mesh(screen_name, sw, sh))
    screen_local = Vector((0, MON_Y - MON_BODY_T / 2 - 0.002, zc))
    place(screen, m @ Matrix.Translation(screen_local))
    collection(col).objects.link(screen)
    return m @ screen_local, m


def solid_wall(name, p0, p1, z0, z1, thickness, mat, col):
    """Box wall centred on the segment p0-p1."""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    L = d.length
    yaw = math.atan2(d.y, d.x)
    b = MeshBuilder()
    mid = p0 + d / 2 + Vector((0, 0, (z0 + z1) / 2))
    b.box((L, thickness, z1 - z0), mid, mat, rot=(0, 0, yaw))
    return add_object(name, b.build(name), col)


def glass_wall(name, p0, p1, z0, z1, col, door_t=None, post_pitch=GLASS_POST_PITCH, rail=0.05,
               casts_shadow=False):
    """Framed glass partition: dark posts and rails, thin glass panels, optional door with transom.

    door_t is the distance along the wall (from p0) of the door's hinge side.
    Frame and glass are separate objects so glass can be excluded from shadow casting.
    """
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    L = d.length
    d.normalize()
    yaw = math.atan2(d.y, d.x)
    rot = (0, 0, yaw)
    frame, glass = MeshBuilder(), MeshBuilder()

    def at(t, z):
        return p0 + d * t + Vector((0, 0, z))

    frame.box((L, rail, rail), at(L / 2, z0 + rail / 2), MAT.frame, rot=rot)
    frame.box((L, rail, rail), at(L / 2, z1 - rail / 2), MAT.frame, rot=rot)
    segments = [(0.0, L)]
    if door_t is not None:
        segments = [(0.0, door_t), (door_t + DOOR_W, L)]
        # header over the door and a fixed transom light above it
        frame.box((DOOR_W, rail, rail), at(door_t + DOOR_W / 2, DOOR_H + rail / 2), MAT.frame, rot=rot)
        glass.box((DOOR_W, 0.012, z1 - DOOR_H - 2 * rail), at(door_t + DOOR_W / 2, (DOOR_H + rail + z1 - rail) / 2),
                  MAT.glass, rot=rot)
    for (a, b_) in segments:
        span = b_ - a
        if span < 0.05:
            continue
        n = max(1, round(span / post_pitch))
        pitch = span / n
        for i in range(n + 1):
            frame.box((rail, rail, z1 - z0), at(a + i * pitch, (z0 + z1) / 2), MAT.frame, rot=rot)
        for i in range(n):
            glass.box((pitch - rail, 0.012, z1 - z0 - 2 * rail), at(a + (i + 0.5) * pitch, (z0 + z1) / 2),
                      MAT.glass, rot=rot)
    add_object(name + "_frame", frame.build(name + "_frame"), col)
    g = add_object(name + "_glass", glass.build(name + "_glass"), col)
    g.visible_shadow = casts_shadow
    if door_t is not None:
        door = build_door(name + "_door")
        ob = add_object(name + "_door", door, col)
        # Hinge at the door_t end; the leaf swings toward the wall's +normal side (interior).
        place(ob, frame_matrix(at(door_t, 0), yaw + rad(DOOR_OPEN_DEG)))
        ob.visible_shadow = False
    return g


def build_door(name):
    """Framed glass door leaf in its own frame: hinge at the origin, leaf along +X."""
    b = MeshBuilder()
    w, h = DOOR_W, DOOR_H
    stile, t = 0.05, 0.045
    b.box((stile, t, h), (stile / 2, 0, h / 2), MAT.frame)
    b.box((stile, t, h), (w - stile / 2, 0, h / 2), MAT.frame)
    b.box((w, t, 0.06), (w / 2, 0, 0.03), MAT.frame)
    b.box((w, t, 0.06), (w / 2, 0, h - 0.03), MAT.frame)
    b.box((w - 2 * stile, 0.01, h - 0.12), (w / 2, 0, h / 2), MAT.glass)
    for sy in (-1, 1):
        b.cylinder(0.011, 0.32, 10, (w - 0.11, sy * 0.045, 1.05), MAT.chrome)
        b.cylinder(0.008, 0.03, 8, (w - 0.11, sy * 0.03, 1.05 + 0.12), MAT.chrome, axis="Y")
        b.cylinder(0.008, 0.03, 8, (w - 0.11, sy * 0.03, 1.05 - 0.12), MAT.chrome, axis="Y")
    return b.build(name)


def balustrade(name, p0, p1, z, col, skip=None):
    """Glass balustrade with a dark handrail along p0-p1 at floor level z.

    skip: (t0, t1) span left open, used where the stair lands.
    """
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    L = d.length
    d.normalize()
    yaw = math.atan2(d.y, d.x)
    rot = (0, 0, yaw)
    frame, glass = MeshBuilder(), MeshBuilder()

    def at(t, zz):
        return p0 + d * t + Vector((0, 0, z + zz))

    spans = [(0.0, L)]
    if skip:
        spans = [(0.0, skip[0]), (skip[1], L)]
    for (a, b_) in spans:
        span = b_ - a
        if span < 0.05:
            continue
        n = max(1, round(span / 1.5))
        pitch = span / n
        frame.box((span, 0.05, 0.04), at(a + span / 2, BALUSTRADE_H - 0.02), MAT.frame, rot=rot)
        frame.box((span, 0.06, 0.06), at(a + span / 2, 0.03), MAT.frame, rot=rot)
        for i in range(n + 1):
            frame.box((0.04, 0.04, BALUSTRADE_H - 0.06), at(a + i * pitch, BALUSTRADE_H / 2), MAT.frame, rot=rot)
        for i in range(n):
            glass.box((pitch - 0.05, 0.012, BALUSTRADE_H - 0.1), at(a + (i + 0.5) * pitch, BALUSTRADE_H / 2 + 0.01),
                      MAT.glass, rot=rot)
    add_object(name + "_frame", frame.build(name + "_frame"), col)
    g = add_object(name + "_glass", glass.build(name + "_glass"), col)
    g.visible_shadow = False


# =============================================================================
# Building envelope
# =============================================================================


def build_building():
    col_f1, col_f2 = "Building_F1", "Building_F2"
    roof_top = F2_Z + F2_CEIL_H + ROOF_T

    # Carpet: whole floor 1; floor 2 minus the atrium void (three strips around it).
    tile_floor("floor1_carpet", [(0, ROOM_X, 0, ROOM_Y)], 0.0, col_f1, (MAT.carpet_a, MAT.carpet_b))
    f2_rects = [
        (0, ROOM_X, 0, VOID_Y[0]),
        (0, ROOM_X, VOID_Y[1], ROOM_Y),
        (VOID_X[1], ROOM_X, VOID_Y[0], VOID_Y[1]),
    ]
    tile_floor("floor2_carpet", f2_rects, F2_Z + 0.001, col_f2, (MAT.carpet_a, MAT.carpet_b))

    # Slabs: floor-2 slab as three boxes framing the void (its underside is the floor-1 ceiling,
    # its inner faces are the atrium fascia); the roof slab is one box.
    b = MeshBuilder()
    for (x0, x1, y0, y1) in f2_rects:
        b.box((x1 - x0, y1 - y0, SLAB_T), ((x0 + x1) / 2, (y0 + y1) / 2, CEIL_H + SLAB_T / 2), MAT.ceiling)
    add_object("slab_floor2", b.build("slab_floor2"), col_f2)
    b = MeshBuilder()
    b.box((ROOM_X + 2 * WALL_T, ROOM_Y + 2 * WALL_T, ROOF_T),
          (ROOM_X / 2, ROOM_Y / 2, F2_Z + F2_CEIL_H + ROOF_T / 2), MAT.ceiling)
    add_object("slab_roof", b.build("slab_roof"), col_f2)

    # Ground and a few neighbouring blocks outside, so the glazing has something to show through.
    b = MeshBuilder()
    b.box((160, 160, 0.05), (ROOM_X / 2, ROOM_Y / 2, -0.03), MAT.ground)
    add_object("ground", b.build("ground"), "Exterior")
    # Blocks stay low and far enough not to shade the windows: the sun enters at ~37 deg elevation,
    # so anything under 12 m at 40+ m away is below its path.
    b = MeshBuilder()
    rng = random.Random(RANDOM_SEED + 1)
    x = -40.0
    while x < ROOM_X + 50:
        w = rng.uniform(9, 16)
        h = rng.uniform(5, 12)
        depth = rng.uniform(10, 16)
        y = ROOM_Y + rng.uniform(24, 34)
        b.box((w, depth, h), (x + w / 2, y + depth / 2, h / 2), MAT.exterior)
        for k in range(int(h // 3.2)):
            # dark glazing bands on every storey read as windows from a distance
            b.box((w - 1.0, 0.1, 1.6), (x + w / 2, y - 0.02, 1.9 + k * 3.2), MAT.logo_panel)
        x += w + rng.uniform(3, 7)
    add_object("exterior_blocks", b.build("exterior_blocks"), "Exterior")

    # Solid outer walls: south, west, east (full height). The north side is the window wall.
    t = WALL_T
    solid_wall("wall_south", (-t, -t / 2), (ROOM_X + t, -t / 2), 0, roof_top, t, MAT.wall, col_f1)
    solid_wall("wall_west", (-t / 2, 0), (-t / 2, ROOM_Y + t), 0, roof_top, t, MAT.wall, col_f1)
    solid_wall("wall_east", (ROOM_X + t / 2, 0), (ROOM_X + t / 2, ROOM_Y + t), 0, roof_top, t, MAT.wall, col_f1)

    # Window wall along y = ROOM_Y: low sill, glazed band per floor, spandrel hiding the slab.
    bands = [(0.0, 0.3), (CEIL_H, F2_Z + 0.3), (F2_Z + F2_CEIL_H, roof_top)]
    b = MeshBuilder()
    for (z0, z1) in bands:
        b.box((ROOM_X + 2 * t, t, z1 - z0), (ROOM_X / 2, ROOM_Y + t / 2, (z0 + z1) / 2), MAT.wall)
    add_object("wall_north_spandrels", b.build("wall_north_spandrels"), col_f1)
    for floor_name, z0, z1, colname in (("f1", 0.3, CEIL_H, col_f1), ("f2", F2_Z + 0.3, F2_Z + F2_CEIL_H, col_f2)):
        mull = MeshBuilder()
        yc = ROOM_Y - 0.075
        n = round(ROOM_X / MULLION_PITCH)
        pitch = ROOM_X / n
        for i in range(n + 1):
            mull.box((0.08, 0.15, z1 - z0), (i * pitch, yc, (z0 + z1) / 2), MAT.frame)
        mull.box((ROOM_X, 0.15, 0.08), (ROOM_X / 2, yc, z0 + 0.04), MAT.frame)
        mull.box((ROOM_X, 0.15, 0.08), (ROOM_X / 2, yc, z1 - 0.04), MAT.frame)
        mull.box((ROOM_X, 0.15, 0.06), (ROOM_X / 2, yc, z0 + (z1 - z0) * 0.78), MAT.frame)  # transom
        add_object("window_%s_mullions" % floor_name, mull.build("window_%s_mullions" % floor_name), colname)
        g = MeshBuilder()
        g.box((ROOM_X, 0.012, z1 - z0), (ROOM_X / 2, yc, (z0 + z1) / 2), MAT.glass)
        ob = add_object("window_%s_glass" % floor_name, g.build("window_%s_glass" % floor_name), colname)
        ob.visible_shadow = False   # sunlight must pass through the glazing

    # Columns on both floors, ceiling light panels on both floors.
    for (cx, cy) in COLUMN_POSITIONS:
        instance("column", "column_f1_%d_%d" % (cx, cy), col_f1, frame_matrix((cx, cy, 0), 0))
        instance("column", "column_f2_%d_%d" % (cx, cy), col_f2, frame_matrix((cx, cy, F2_Z), 0))
    for floor_name, z, colname in (("f1", CEIL_H, col_f1), ("f2", F2_Z + F2_CEIL_H, col_f2)):
        nx = int(ROOM_X // LIGHT_PANEL_PITCH[0])
        ny = int(ROOM_Y // LIGHT_PANEL_PITCH[1])
        x_start = (ROOM_X - (nx - 1) * LIGHT_PANEL_PITCH[0]) / 2
        y_start = (ROOM_Y - (ny - 1) * LIGHT_PANEL_PITCH[1]) / 2
        k = 0
        for i in range(nx):
            for j in range(ny):
                x = x_start + i * LIGHT_PANEL_PITCH[0]
                y = y_start + j * LIGHT_PANEL_PITCH[1]
                over_void = VOID_X[0] - 0.7 < x < VOID_X[1] + 0.7 and VOID_Y[0] - 0.3 < y < VOID_Y[1] + 0.3
                if floor_name == "f1" and over_void:
                    continue   # the floor-1 ceiling has the atrium hole here
                instance("light_panel", "light_%s_%02d" % (floor_name, k), colname, frame_matrix((x, y, z), 0))
                k += 1

    # Logo wall at the far end (floor 1, outside the leader's office): dark panel, small orange mark.
    b = MeshBuilder()
    b.box((0.04, 3.2, 1.9), (ROOM_X - 0.02, 5.0, 1.85), MAT.logo_panel)
    b.box((0.02, 0.5, 0.5), (ROOM_X - 0.05, 4.0, 1.85), MAT.accent)
    b.box((0.02, 1.6, 0.12), (ROOM_X - 0.05, 5.4, 1.85), MAT.panel_frame)   # word-mark placeholder
    add_object("logo_wall", b.build("logo_wall"), col_f1)


# =============================================================================
# Floor 1: workstations
# =============================================================================


def pod_positions():
    """Centre of each pod (row, pod) -> (x, y). Rows run along X, parallel to the window wall."""
    pod_pitch = DESK_W + POD_GAP
    cluster_w = PODS_PER_ROW * pod_pitch - POD_GAP
    x0 = (DESK_ZONE_X[0] + DESK_ZONE_X[1]) / 2 - cluster_w / 2 + DESK_W / 2
    out = {}
    for r in range(ROWS):
        for p in range(PODS_PER_ROW):
            out[(r, p)] = (x0 + p * pod_pitch, ROW_Y0 + r * ROW_PITCH)
    return out


def build_workstation(index, frame, rng, hero, col="Workstations"):
    """Everything on and around one desk in its local frame (person faces +Y)."""
    tag = "ws%02d" % index
    instance("desk", "%s_desk" % tag, col, frame)
    screen_pos, _ = place_monitor("monitor_24", "screen_%d" % index, col, frame, (0, 0, DESK_H))
    instance("keyboard", "%s_keyboard" % tag, col, frame, (0.02, -0.16, DESK_H), rng.uniform(-3, 3))
    instance("mouse", "%s_mouse" % tag, col, frame, (0.33 + rng.uniform(-0.03, 0.03), -0.14, DESK_H),
             rng.uniform(-25, 25))
    instance("headset", "%s_headset" % tag, col, frame, (-0.58, 0.14, DESK_H), rng.uniform(-20, 20))
    if rng.random() < CUP_CHANCE:
        instance("cup", "%s_cup" % tag, col, frame, (0.55, 0.05, DESK_H), rng.uniform(0, 360))
    if rng.random() < PLANT_CHANCE:
        instance("plant_desk", "%s_plant" % tag, col, frame, (0.63, 0.27, DESK_H), rng.uniform(0, 360))
    if rng.random() < NOTEBOOK_CHANCE:
        instance("notebook", "%s_notebook" % tag, col, frame, (-0.33, -0.12, DESK_H), rng.uniform(-10, 10))
    if rng.random() < BIN_CHANCE:
        instance("bin", "%s_bin" % tag, col, frame, (DESK_W / 2 - 0.2, -0.05, 0))
    chair_key = "chair_accent" if index == ACCENT_CHAIR_WS else "chair"
    if hero:
        # The hero chair is where the camera and a future character sit: keep it squarely at the desk.
        chair_pos, chair_yaw = (0.0, -CHAIR_SETBACK - 0.05, 0), 0.0
    else:
        chair_pos = (rng.uniform(-0.08, 0.08), -CHAIR_SETBACK - rng.uniform(0, 0.25), 0)
        chair_yaw = rng.uniform(-25, 25)
    instance(chair_key, "%s_chair" % tag, col, frame, chair_pos, chair_yaw)
    yaw = frame.to_euler().z
    add_empty("ws_%d" % index, "Anchors", screen_pos, (0, 0, yaw),
              {"kind": "workstation", "ws_index": index, "hero": hero})


def build_workstations(rng):
    hero_frame = None
    for (r, p), (x, y) in pod_positions().items():
        instance("partition", "partition_r%d_p%d" % (r, p), "Workstations", frame_matrix((x, y, 0), 0))
        for side in (0, 1):
            index = (r * PODS_PER_ROW + p) * 2 + side
            yaw = 0.0 if side == 0 else math.pi
            dy = -(DESK_D / 2 + PARTITION_T / 2 + 0.01) if side == 0 else (DESK_D / 2 + PARTITION_T / 2 + 0.01)
            frame = frame_matrix((x, y + dy, 0), yaw)
            hero = index == HERO_WS_INDEX
            build_workstation(index, frame, rng, hero)
            if hero:
                hero_frame = frame
    if hero_frame is None:
        raise SystemExit("HERO_WS_INDEX %d is outside the layout" % HERO_WS_INDEX)
    return hero_frame


# =============================================================================
# Floor 1: team leader's glass office and the far-end lounge
# =============================================================================


MANAGER_SEAT_X = 0.34   # the sitter is at the right-hand screen, not in the middle of the desk


def manager_desk(desk_key, mon_key, tag, col, frame, chair_key="chair_exec"):
    """Desk with two monitors, keyboard, mouse, chair. Returns the LEFT screen's centre.

    Every manager works at the right-hand screen: the chair, the keyboard and the
    mouse are all over there, and a <tag>_seat anchor marks where they sit. The
    left-hand screen is the one the landing's camera flies to, and it has to be
    free — the camera parks a hand's width from the glass, which is exactly where
    a head would be. Both screens are the same person's, so nothing is pretended.
    """
    instance(desk_key, "%s_desk" % tag, col, frame)
    first = None
    # Two monitors toed in toward the person.
    for i, (x, yaw) in enumerate(((-0.34, 12), (0.34, -12))):
        pos, _ = place_monitor(mon_key, "screen_%s_%d" % (tag, i), col, frame, (x, 0.03, DESK_H), yaw)
        if first is None:
            first = pos
    seat_local = (MANAGER_SEAT_X, -CHAIR_SETBACK - 0.12, 0)
    instance("keyboard", "%s_keyboard" % tag, col, frame, (MANAGER_SEAT_X, -0.2, DESK_H))
    instance("mouse", "%s_mouse" % tag, col, frame, (MANAGER_SEAT_X + 0.32, -0.18, DESK_H), -10)
    instance("notebook", "%s_notebook" % tag, col, frame, (-0.56, -0.12, DESK_H), 6)
    instance("cup", "%s_cup" % tag, col, frame, (-0.78, 0.12, DESK_H))
    instance(chair_key, "%s_chair" % tag, col, frame, seat_local, 6)
    add_empty("%s_seat" % tag, "Anchors", frame @ Vector(seat_local), (0, 0, frame.to_euler().z),
              {"kind": "seat", "who": tag})
    return first


def build_leader_office():
    col = "LeaderOffice"
    x0, x1, y0, y1 = LEADER_OFFICE
    # Glass on the two interior sides; the other two are the building's east and window walls.
    # The west wall is traced from y1 to y0 so the door swings inward (toward +X).
    glass_wall("leader_glass_w", (x0, y1), (x0, y0), 0, CEIL_H, col, door_t=(y1 - y0) - LEADER_DOOR_T - DOOR_W)
    glass_wall("leader_glass_s", (x0, y0), (x1, y0), 0, CEIL_H, col)
    frame = frame_matrix(((x0 + x1) / 2 + 0.7, (y0 + y1) / 2 + 0.3, 0), rad(90))   # leader faces -X (the floor)
    screen = manager_desk("desk_leader", "monitor_27", "leader", col, frame)
    add_empty("leader_desk", "Anchors", screen, (0, 0, rad(90)), {"kind": "leader"})
    instance("meeting_table", "leader_meeting_table", col, frame_matrix((x0 + 1.6, y1 - 1.7, 0), 0))
    instance("chair_side", "leader_meeting_chair_0", col, frame_matrix((x0 + 1.6, y1 - 2.45, 0), 0))
    instance("chair_side", "leader_meeting_chair_1", col, frame_matrix((x0 + 1.6, y1 - 0.95, 0), math.pi))
    instance("cabinet", "leader_cabinet", col, frame_matrix((x1 - 0.25, y0 + 1.3, 0), rad(-90)))
    instance("plant_floor", "leader_plant", col, frame_matrix((x1 - 0.45, y1 - 0.5, 0), rad(30)))
    return frame


def build_lounge():
    """Small breakout corner in front of the logo wall so the far end is not empty."""
    col = "Building_F1"
    instance("armchair", "lounge_armchair_0", col, frame_matrix((ROOM_X - 1.6, 4.1, 0), rad(90)))
    instance("armchair", "lounge_armchair_1", col, frame_matrix((ROOM_X - 1.6, 6.1, 0), rad(90)))
    instance("coffee_table", "lounge_table", col, frame_matrix((ROOM_X - 2.6, 5.1, 0), 0))
    instance("plant_floor", "lounge_plant", col, frame_matrix((ROOM_X - 0.6, 7.6, 0), rad(120)))
    instance("plant_floor", "entry_plant", col, frame_matrix((0.8, 0.9, 0), rad(200)))
    instance("plant_floor", "aisle_plant", col, frame_matrix((6.5, 15.8, 0), rad(60)))


# =============================================================================
# Atrium: stair, void balustrades
# =============================================================================


def build_atrium():
    col = "Atrium_Stairs"
    rise = F2_Z / STEP_COUNT
    run = STEP_COUNT * STEP_TREAD
    b = MeshBuilder()
    x0, x1 = STAIR_X0, STAIR_X0 + STAIR_W
    xc = (x0 + x1) / 2
    for i in range(STEP_COUNT):
        y = STAIR_Y0 + i * STEP_TREAD
        top = (i + 1) * rise
        # solid block stair: each step is a box down to the floor, treads capped in oak
        b.box((STAIR_W, STEP_TREAD, top - 0.03), (xc, y + STEP_TREAD / 2, (top - 0.03) / 2), MAT.stair)
        b.box((STAIR_W, STEP_TREAD + 0.02, 0.03), (xc, y + STEP_TREAD / 2 - 0.01, top - 0.015), MAT.stair_tread)
    add_object("stair", b.build("stair"), col)

    # Sloped glass balustrade on the open (east) side of the stair, plus wall handrail.
    y_top = STAIR_Y0 + run
    g = MeshBuilder()
    g.face([(x1, STAIR_Y0, 0.02), (x1, y_top, F2_Z + 0.02), (x1, y_top, F2_Z + BALUSTRADE_H - 0.05),
            (x1, STAIR_Y0, BALUSTRADE_H - 0.05)], MAT.glass)
    ob = add_object("stair_balustrade_glass", g.build("stair_balustrade_glass"), col)
    ob.visible_shadow = False
    f = MeshBuilder()
    slope = math.atan2(F2_Z, run)
    length = math.hypot(F2_Z, run)
    for x in (x1, 0.04):   # open side handrail and a wall-mounted one
        f.box((0.05, length, 0.04), (x, STAIR_Y0 + run / 2, F2_Z / 2 + BALUSTRADE_H - 0.02), MAT.frame,
              rot=(slope, 0, 0))
    for i in range(0, STEP_COUNT + 1, 4):
        y = STAIR_Y0 + i * STEP_TREAD
        z = i * rise
        f.box((0.04, 0.04, BALUSTRADE_H - 0.06), (x1, y, z + BALUSTRADE_H / 2 - 0.02), MAT.frame)
    add_object("stair_balustrade_frame", f.build("stair_balustrade_frame"), col)

    # Floor-2 balustrades around the void; the stair lands on the north edge.
    vx0, vx1 = VOID_X
    vy0, vy1 = VOID_Y
    balustrade("void_rail_s", (vx0, vy0), (vx1, vy0), F2_Z, col)
    balustrade("void_rail_e", (vx1, vy0), (vx1, vy1), F2_Z, col)
    balustrade("void_rail_n", (vx1, vy1), (vx0, vy1), F2_Z, col, skip=(vx1 - x1 - 0.05, vx1 - x0 + 0.05))


# =============================================================================
# Floor 2: deputy's room and the owner's corner office
# =============================================================================


def build_floor2():
    col = "Floor2_Rooms"
    z = F2_Z
    zc = F2_Z + F2_CEIL_H
    # Owner's corner office: glass front toward the void (y = y0), solid east wall.
    x0, x1, y0, y1 = OWNER_ROOM
    glass_wall("owner_glass", (x0, y0), (x1, y0), z, zc, col, door_t=x1 - x0 - DOOR_W - 0.5)
    solid_wall("owner_wall_e", (x1 + 0.075, y0), (x1 + 0.075, y1), z, zc, 0.15, MAT.wall, col)
    frame = frame_matrix(((x0 + x1) / 2, y0 + 2.6, z), math.pi)   # owner faces -Y: the glass front and the void
    screen = manager_desk("desk_exec", "monitor_27", "owner", col, frame)
    add_empty("owner_desk", "Anchors", screen, (0, 0, math.pi), {"kind": "owner"})
    instance("sofa", "owner_sofa", col, frame_matrix((x0 + 1.4, y1 - 0.75, z), math.pi))
    instance("coffee_table", "owner_table", col, frame_matrix((x0 + 1.4, y1 - 2.0, z), 0))
    instance("armchair", "owner_armchair", col, frame_matrix((x0 + 3.2, y1 - 1.3, z), rad(90)))
    instance("cabinet_walnut", "owner_cabinet", col, frame_matrix((x0 + 0.25, y0 + 1.8, z), rad(90)))
    instance("plant_floor", "owner_plant", col, frame_matrix((x1 - 0.55, y1 - 0.55, z), rad(80)))
    owner_frame = frame

    # Deputy's room east of the void: glass front at x = x0 facing the void.
    x0, x1, y0, y1 = DEPUTY_ROOM
    glass_wall("deputy_glass", (x0, y1), (x0, y0), z, zc, col, door_t=y1 - y0 - DOOR_W - 0.3)
    solid_wall("deputy_wall_e", (x1 + 0.075, y0 - 0.15), (x1 + 0.075, y1 + 0.15), z, zc, 0.15, MAT.wall, col)
    solid_wall("deputy_wall_s", (x0, y0 - 0.075), (x1, y0 - 0.075), z, zc, 0.15, MAT.wall, col)
    solid_wall("deputy_wall_n", (x0, y1 + 0.075), (x1, y1 + 0.075), z, zc, 0.15, MAT.wall, col)
    frame = frame_matrix((x0 + 2.2, (y0 + y1) / 2, z), rad(90))   # deputy faces -X: the glass front and the void
    screen = manager_desk("desk_deputy", "monitor_24", "deputy", col, frame)
    add_empty("deputy_desk", "Anchors", screen, (0, 0, rad(90)), {"kind": "deputy"})
    instance("cabinet", "deputy_cabinet", col, frame_matrix((x1 - 0.25, y0 + 1.2, z), rad(-90)))
    instance("plant_floor", "deputy_plant", col, frame_matrix((x1 - 0.5, y1 - 0.5, z), rad(10)))
    instance("chair_side", "deputy_visitor_chair", col, frame_matrix((x0 + 1.0, (y0 + y1) / 2 + 0.9, z), rad(-90)))
    deputy_frame = frame

    # Open floor-2 area: a hot-desk bench and plants so the upper floor does not read as empty.
    bench = frame_matrix((16.5, 8.0, z), 0)
    instance("partition", "f2_bench_partition", col, bench)
    for side, yaw in ((0, 0.0), (1, math.pi)):
        dy = -(DESK_D / 2 + PARTITION_T / 2 + 0.01) if side == 0 else (DESK_D / 2 + PARTITION_T / 2 + 0.01)
        f = frame_matrix((16.5, 8.0 + dy, z), yaw)
        instance("desk", "f2_bench_desk_%d" % side, col, f)
        instance("chair", "f2_bench_chair_%d" % side, col, f, (0, -CHAIR_SETBACK - 0.1, 0), 15 - 30 * side)
        instance("notebook", "f2_bench_notebook_%d" % side, col, f, (0.2, -0.1, DESK_H), 20 * side)
    instance("plant_floor", "f2_plant_0", col, frame_matrix((ROOM_X - 0.7, 0.8, z), rad(45)))
    instance("plant_floor", "f2_plant_1", col, frame_matrix((ROOM_X - 0.7, ROOM_Y - 0.8, z), rad(160)))
    instance("plant_floor", "f2_plant_2", col, frame_matrix((7.2, 1.0, z), rad(300)))
    instance("sofa", "f2_sofa", col, frame_matrix((18.5, ROOM_Y - 1.2, z), math.pi))
    instance("coffee_table", "f2_table", col, frame_matrix((18.5, ROOM_Y - 2.6, z), 0))
    return owner_frame, deputy_frame


# =============================================================================
# Lights (preview only) and cameras
# =============================================================================


def build_lights():
    col = "Lights"
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = SUN_STRENGTH
    sun_data.angle = rad(1.5)
    sun = add_object("sun", sun_data, col, loc=(ROOM_X / 2, ROOM_Y + 10, 12))
    sun.rotation_euler = Vector(SUN_DIR).to_track_quat("-Z", "Y").to_euler()
    for floor_name, z in (("f1", CEIL_H - 0.12), ("f2", F2_Z + F2_CEIL_H - 0.12)):
        nx, ny = AREA_GRID
        for i in range(nx):
            for j in range(ny):
                x = ROOM_X * (i + 0.5) / nx
                y = ROOM_Y * (j + 0.5) / ny
                data = bpy.data.lights.new("area_%s_%d_%d" % (floor_name, i, j), "AREA")
                data.shape = "RECTANGLE"
                data.size, data.size_y = AREA_SIZE
                data.energy = AREA_POWER
                data.color = (1.0, 0.97, 0.92)
                safe_set(data, "shadow_resolution_scale", 0.5)   # soft fills; the sun carries the crisp shadows
                add_object(data.name, data, col, loc=(x, y, z))


def make_camera(name, loc, target, lens):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36
    data.clip_start = 0.05
    data.clip_end = 200
    cam = add_object(name, data, "Cameras", loc=loc)
    look_at(cam, target)
    return cam


def ots_camera(name, frame):
    """Over-the-shoulder camera for a workstation frame."""
    loc = frame @ Vector(CAM_OTS_OFFSET)
    target = frame @ Vector(CAM_OTS_TARGET)
    return make_camera(name, loc, target, CAM_OTS_LENS)


def build_cameras(hero_frame, leader_frame, deputy_frame, owner_frame):
    cams = [
        make_camera("cam_hero_wide", CAM_WIDE_POS, CAM_WIDE_TARGET, CAM_WIDE_LENS),
        ots_camera("cam_employee", hero_frame),
        ots_camera("cam_leader", leader_frame),
        ots_camera("cam_deputy", deputy_frame),
        ots_camera("cam_owner", owner_frame),
    ]
    return cams


# =============================================================================
# Stats, render, export
# =============================================================================


def tri_count(mesh):
    return sum(max(len(p.vertices) - 2, 0) for p in mesh.polygons)


def print_stats():
    total = 0
    log("triangles per collection (instances counted):")
    for col in bpy.context.scene.collection.children:
        n = sum(tri_count(ob.data) for ob in col.all_objects if ob.type == "MESH")
        objs = sum(1 for ob in col.all_objects if ob.type == "MESH")
        total += n
        log("  %-16s %8d tris  (%d mesh objects)" % (col.name, n, objs))
    log("  %-16s %8d tris" % ("TOTAL", total))
    unique = sum(tri_count(m) for m in bpy.data.meshes if m.users > 0)
    log("unique mesh data: %d tris in %d meshes (what the GLB stores; the rest is instancing)"
        % (unique, sum(1 for m in bpy.data.meshes if m.users > 0)))
    log("objects: %d, materials: %d" % (len(bpy.data.objects), len(bpy.data.materials)))
    return total


def setup_render(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = RENDER_RES
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    ee = scene.eevee
    safe_set(ee, "taa_render_samples", RENDER_SAMPLES)
    safe_set(ee, "use_raytracing", True)
    safe_set(ee, "use_shadows", True)
    safe_set(ee, "shadow_ray_count", 2)
    safe_set(ee, "shadow_step_count", 4)
    safe_set(ee, "use_fast_gi", True)
    safe_set(ee, "shadow_pool_size", SHADOW_POOL_MB)
    if hasattr(ee, "ray_tracing_options"):
        safe_set(ee.ray_tracing_options, "use_denoise", True)
        safe_set(ee.ray_tracing_options, "resolution_scale", "2")
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.0
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*WORLD_COLOR, 1.0)
    bg.inputs[1].default_value = WORLD_STRENGTH
    scene.world = world


def render_cameras(scene, cams, out_dir):
    for cam in cams:
        scene.camera = cam
        path = os.path.join(out_dir, cam.name + ".png")
        scene.render.filepath = path
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        log("rendered %s in %.1fs" % (path, time.time() - t0))


def export_glb(out_dir):
    path = os.path.join(out_dir, "office.glb")
    # Lights are preview-only; cameras and anchors (with their custom props) ship in the GLB.
    # Glass loses its preview alpha so the exporter writes opaque + transmission, not alpha blend.
    for mat in GLASS_MATERIALS:
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Alpha"].default_value = 1.0
        safe_set(mat, "surface_render_method", "DITHERED")
    t0 = time.time()
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=False,               # keep shared mesh data so repeated furniture is instanced
        # No Draco: the browser spent ten seconds decoding ninety-odd
        # compressed primitives before the room appeared, and a server's gzip
        # gets most of those bytes back anyway.
        export_draco_mesh_compression_enable=False,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_lights=False,
        export_cameras=True,
        export_extras=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_yup=True,
        export_image_format="NONE",
    )
    size = os.path.getsize(path)
    log("exported %s: %.2f MB (%d bytes) in %.1fs" % (path, size / 1e6, size, time.time() - t0))
    return path


# =============================================================================
# Main
# =============================================================================


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(description="Build the VerbaTrace office scene")
    ap.add_argument("--out", required=True, help="output folder for renders, GLB and .blend")
    ap.add_argument("--render", action="store_true", help="render the five cameras as PNG")
    ap.add_argument("--export", action="store_true", help="export office.glb (Draco)")
    ap.add_argument("--blend", action="store_true", help="also save office.blend for inspection")
    ap.add_argument("--only", default="", help="comma-separated camera names to render (default all)")
    return ap.parse_args(argv)


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    rng = random.Random(RANDOM_SEED)

    build_materials()
    build_templates(rng)
    build_building()
    hero_frame = build_workstations(rng)
    leader_frame = build_leader_office()
    build_lounge()
    build_atrium()
    owner_frame, deputy_frame = build_floor2()
    build_lights()
    cams = build_cameras(hero_frame, leader_frame, deputy_frame, owner_frame)
    setup_render(scene)
    log("scene built in %.1fs" % (time.time() - t0))
    print_stats()

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, "office.blend"))
    if args.render:
        wanted = [c for c in cams if not args.only or c.name in args.only.split(",")]
        render_cameras(scene, wanted, args.out)
    if args.export:
        export_glb(args.out)
    log("done in %.1fs" % (time.time() - t0))


if __name__ == "__main__":
    main()

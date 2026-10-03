"""Authored office kit, independent of the user's interactive Blender session.

Used by build_office.py --detail. All dimensions are metres. Texture sources
are recorded in materials/sources.json. No network calls or paid services.
"""
import json
import math
import os
import random
import time

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(__file__)
SOURCE = os.path.join(ROOT, "materials")
o = None
ORIGINAL = {}
TEXTURED = {}


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def image_node(mat, path, data=False):
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    if data:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def pbr(mat, asset, scale, normal=0.25, base=True):
    """One shared texture set; scale lives in metric UVs, not shader mapping."""
    bsdf = principled(mat)
    if base:
        img = image_node(mat, os.path.join(SOURCE, asset + "-Diffuse.jpg"))
        mat.node_tree.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    rough = image_node(mat, os.path.join(SOURCE, asset + "-Rough.jpg"), True)
    mat.node_tree.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    tex = image_node(mat, os.path.join(SOURCE, asset + "-nor_gl.jpg"), True)
    norm = mat.node_tree.nodes.new("ShaderNodeNormalMap")
    norm.inputs["Strength"].default_value = normal
    mat.node_tree.links.new(tex.outputs["Color"], norm.inputs["Color"])
    mat.node_tree.links.new(norm.outputs["Normal"], bsdf.inputs["Normal"])
    TEXTURED[mat.name] = scale


def procedural_image(name, pixels, directory, data=False):
    """Author an original seamless texture, not a modification of a reference."""
    height, width = pixels.shape[:2]
    img = bpy.data.images.new(name, width=width, height=height, alpha=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    img.filepath_raw = os.path.abspath(os.path.join(directory, name + ".png"))
    img.file_format = "PNG"
    img.save()
    return img


def material_textures():
    ORIGINAL["materials"]()
    m = o.MAT
    for name, color in (("carpet_a", (.30, .31, .33)), ("carpet_b", (.335, .345, .365)),
                        ("frame", (.06, .065, .07)), ("fabric", (.23, .24, .24)),
                        ("sofa", (.34, .30, .25)), ("pot", (.095, .10, .095)),
                        ("wall", (.76, .70, .61)), ("ceiling", (.88, .855, .81)),
                        ("white_lam", (.77, .745, .68)), ("ground", (.14, .235, .075))):
        principled(getattr(m, name)).inputs["Base Color"].default_value = (*color, 1)
    principled(m.frame).inputs["Metallic"].default_value = .32
    principled(m.chrome).inputs["Roughness"].default_value = .3
    m.mesh = o.make_material("chair_mesh", (.14, .15, .15), .9, double_sided=True)
    m.brass = o.make_material("brushed_brass", (.48, .32, .12), .34, .72)
    m.coffee = o.make_material("coffee", (.035, .017, .007), .27)
    m.edge = o.make_material("oak_edge", (.51, .34, .17), .55)
    m.book_blue = o.make_material("book_blue", (.16, .23, .27), .8)
    m.book_tan = o.make_material("book_tan", (.49, .43, .34), .8)
    m.book_dark = o.make_material("book_dark", (.11, .12, .13), .8)
    m.warm_strip = o.make_material("shelf_warm_diffuser", (.94, .73, .43), .6,
                                 emission=(1, .68, .32), emission_strength=1.6)
    m.leaf_light = o.make_material("leaf_light", (.15, .29, .095), .67, double_sided=True)
    m.stem = o.make_material("plant_stem", (.13, .22, .055), .85)
    m.wall_sage = o.make_material("wall_sage_greige", (.66, .69, .635), .82)
    m.wall_sand = o.make_material("wall_sand", (.75, .665, .54), .82)
    pbr(m.walnut, "wood_table_001", 1.3, .15)
    # Oak is authored below. Retain the CC0 fine wood normal/roughness only.
    pbr(m.laminate, "fine_grained_wood", 1.15, .035, base=False)
    for mat in (m.fabric, m.fabric_accent, m.sofa, m.partition, m.mesh):
        pbr(mat, "fabric_pattern_07", .32, .22, base=False)


def stem(builder, start, end, radius=.008):
    start, end = Vector(start), Vector(end)
    direction = end - start
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    builder.cylinder(radius, direction.length, 6, (start + end) / 2,
                     o.MAT.stem, rot=rotation, radius2=radius * .7)


def cup():
    b = o.MeshBuilder()
    # Actual interior and lip, rather than the original capped solid cylinder.
    b.torus_arc(.037, .003, 360, 24, 6, (0, 0, .095), o.MAT.ceramic)
    rings = []
    for z, radius in ((.003, .031), (.09, .037), (.09, .031), (.009, .027)):
        rings.append([(radius * math.cos(i * math.tau / 24), radius * math.sin(i * math.tau / 24), z) for i in range(24)])
    for ring1, ring2 in zip(rings, rings[1:]):
        for i in range(24):
            j = (i + 1) % 24
            b.face((ring1[i], ring1[j], ring2[j], ring2[i]), o.MAT.ceramic)
    b.cylinder(.027, .004, 24, (0, 0, .009), o.MAT.ceramic)
    b.cylinder(.03, .001, 24, (0, 0, .074), o.MAT.coffee)
    b.torus_arc(.025, .005, 240, 14, 6, (.038, 0, .053), o.MAT.ceramic,
                rot=(o.rad(90), 0, o.rad(90)), start_deg=-120)
    return b.build("cup_open")


def keyboard():
    b = o.MeshBuilder()
    b.box((.44, .145, .012), (0, 0, .008), o.MAT.plastic_black, bevel=.003, segments=2)
    # Rows, space bar, arrows and number pad are separate caps in one mesh.
    for row in range(5):
        for col in range(14):
            if row == 0 and 3 <= col <= 7:
                continue
            width = .014 if row == 4 else .018
            b.box((width, .016, .006), (-.202 + col * .022, -.051 + row * .023, .018 + row * .0006), o.MAT.plastic_dark)
    b.box((.104, .016, .006), (-.092, -.051, .018), o.MAT.plastic_dark)
    for row in range(4):
        for col in range(4):
            b.box((.017, .017, .007), (.123 + col * .022, -.05 + row * .026, .019), o.MAT.plastic_dark)
    return b.build("keyboard_full")


def mouse():
    b = o.MeshBuilder()
    b.sphere(1, (0, 0, .018), o.MAT.plastic_black, u=16, v=10, scale=(.031, .052, .023))
    b.box((.0015, .035, .003), (0, .025, .037), o.MAT.plastic_dark)
    b.cylinder(.006, .004, 10, (0, .014, .041), o.MAT.rubber, axis="X")
    return b.build("mouse_wheel")


def headset():
    b = o.MeshBuilder()
    b.cylinder(.060, .008, 20, (0, 0, .004), o.MAT.frame)
    b.cylinder(.007, .246, 10, (0, 0, .131), o.MAT.frame)
    b.box((.046, .03, .012), (0, 0, .26), o.MAT.plastic_dark, bevel=.003)
    b.torus_arc(.088, .008, 195, 20, 6, (0, 0, .172), o.MAT.plastic_black, rot=(o.rad(90), 0, 0), start_deg=-7.5)
    b.torus_arc(.081, .006, 165, 18, 6, (0, 0, .174), o.MAT.fabric, rot=(o.rad(90), 0, 0), start_deg=7.5)
    for side in (-1, 1):
        b.box((.012, .026, .06), (side * .085, 0, .166), o.MAT.chrome, bevel=.003)
        b.sphere(1, (side * .09, 0, .133), o.MAT.plastic_black, u=14, v=8, scale=(.022, .041, .050))
        b.sphere(1, (side * .073, 0, .133), o.MAT.fabric, u=14, v=8, scale=(.012, .034, .040))
    # Visible articulated boom and microphone capsule.
    b.cylinder(.003, .07, 8, (-.101, -.045, .118), o.MAT.plastic_black, axis="Y", rot=(o.rad(-20), 0, 0))
    b.cylinder(.003, .045, 8, (-.085, -.097, .101), o.MAT.plastic_black, axis="Y", rot=(0, 0, o.rad(-35)))
    b.sphere(.008, (-.072, -.115, .102), o.MAT.rubber, u=10, v=6, scale=(1, 1.6, 1))
    return b.build("headset_articulated")


def plant(name, pot_r, pot_h, leaf_len, leaf_w, leaves, rng, shrub=False):
    b = o.MeshBuilder()
    b.cylinder(pot_r * .82, pot_h, 24, (0, 0, pot_h / 2), o.MAT.pot, radius2=pot_r)
    b.torus_arc(pot_r * .965, .008 if pot_r > .1 else .003, 360, 24, 5, (0, 0, pot_h), o.MAT.pot)
    b.cylinder(pot_r * .92, .012, 24, (0, 0, pot_h - .015), o.MAT.soil)
    tall = pot_h > .2
    count = 24 if shrub else 12
    height = .58 if shrub else 1.45 if tall else .18
    for i in range(count):
        yaw = i * 137.508 + rng.uniform(-7, 7)
        angle = o.rad(yaw)
        root = (.035 * math.cos(angle), .035 * math.sin(angle), pot_h - .01)
        tip_z = pot_h + height * (.25 + .75 * (i + 1) / count)
        spread = (.17 if tall else .023) * math.sin(i * 1.7)
        tip = (spread * math.cos(angle), spread * math.sin(angle), tip_z)
        stem(b, root, tip, .007 if tall else .002)
        length = (.38 if shrub else .60 if tall else .10) * rng.uniform(.75, 1.2)
        width = (.18 if shrub else .24 if tall else .045) * rng.uniform(.8, 1.1)
        b.leaf(tip, length, width, yaw, rng.uniform(10, 40), .14,
               o.MAT.leaf if i % 3 else o.MAT.leaf_light, segments=6)
    return b.build(name)


def chair(name, fabric, managerial=False):
    base = ORIGINAL["chair"](name, fabric)
    # Replace the flat back slab with a curved, framed mesh/fabric panel.
    # Rebuild this part only, retaining the proven chair/figure support heights.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(base)
    verts = [v for v in bm.verts if v.co.z > .73 and v.co.y < -.10]
    bmesh.ops.delete(bm, geom=verts, context="VERTS")
    bm.to_mesh(base)
    bm.free()
    b = o.MeshBuilder()
    nx, nz = 8, 9
    for iz in range(nz):
        for ix in range(nx):
            pts = []
            for j, k in ((ix, iz), (ix + 1, iz), (ix + 1, iz + 1), (ix, iz + 1)):
                x = (j / nx - .5) * .45
                z = .56 + k / nz * .52
                y = -.25 - .07 * ((z - .56) / .52) - .025 * (x / .225) ** 2
                pts.append((x, y, z))
            b.face(pts, o.MAT.mesh if "exec" not in name else fabric)
    for side in (-1, 1):
        b.box((.025, .034, .53), (side * .23, -.29, .82), o.MAT.plastic_black,
              bevel=.008, segments=2, rot=(o.rad(8), 0, 0))
    b.box((.45, .034, .025), (0, -.328, 1.078), o.MAT.plastic_black, bevel=.008)
    b.box((.30, .04, .08), (0, -.27, .64), o.MAT.plastic_dark, bevel=.014)
    if managerial:
        # Leader: adjustable fabric headrest and raised arm pads; task chairs
        # for the deputy and operators retain their lower mesh silhouette.
        for x in (-.12, .12):
            b.box((.018, .022, .17), (x, -.32, 1.105), o.MAT.chrome, bevel=.005)
        b.box((.36, .075, .14), (0, -.315, 1.19), fabric, bevel=.035, segments=3)
        for x in (-.27, .27):
            b.box((.07, .27, .035), (x, -.02, .71), o.MAT.plastic_dark, bevel=.014, segments=3)
    # Join once at authoring time, never as separate components at runtime.
    back = b.build(name + "_back")
    bm = bmesh.new()
    bm.from_mesh(base)
    for mat in back.materials:
        if mat not in base.materials[:]:
            base.materials.append(mat)
    indices = [list(base.materials).index(mat) for mat in back.materials]
    for poly in back.polygons:
        poly.material_index = indices[poly.material_index]
    bm.from_mesh(back)
    bm.to_mesh(base)
    bm.free()
    bpy.data.meshes.remove(back)
    return base


def executive_chair():
    """Owner: broad padded high back, upholstered arms and polished star base."""
    b = o.MeshBuilder()
    for i in range(5):
        angle = o.rad(90 + i * 72)
        x, y = math.cos(angle), math.sin(angle)
        b.box((.32, .055, .03), (x * .17, y * .17, .08), o.MAT.chrome, bevel=.01, segments=2, rot=(0, 0, angle))
        b.cylinder(.035, .035, 14, (x * .32, y * .32, .035), o.MAT.rubber, axis="Y", rot=(0, 0, angle))
    b.cylinder(.035, .34, 20, (0, 0, .255), o.MAT.chrome)
    b.box((.32, .32, .05), (0, 0, .40), o.MAT.plastic_black, bevel=.01)
    b.box((.56, .52, .08), (0, 0, .45), o.MAT.sofa, bevel=.036, segments=4)
    b.box((.08, .10, .34), (0, -.26, .55), o.MAT.chrome, bevel=.012)
    for i in range(3):
        b.box((.535, .11, .19), (0, -.275 - i * .018, .67 + i * .19), o.MAT.sofa,
              bevel=.04, segments=4, rot=(o.rad(9), 0, 0))
    b.box((.49, .13, .19), (0, -.335, 1.23), o.MAT.sofa, bevel=.052, segments=4)
    for x in (-.30, .30):
        b.box((.025, .035, .25), (x, -.09, .56), o.MAT.chrome, bevel=.008)
        b.box((.08, .32, .055), (x, -.04, .70), o.MAT.sofa, bevel=.026, segments=3)
    return b.build("chair_owner_highback")


def desk(w, d, mat, name):
    mesh = ORIGINAL["desk"](w, d, mat, name)
    # Thick walnut executive legs/drawer units are added as separate shared kit.
    return mesh


def detailed_desk(w, d, mat, name, owner=False):
    b = o.MeshBuilder()
    thickness = .043 if owner else .030
    b.box((w, d, thickness), (0, 0, o.DESK_H - thickness / 2), mat, bevel=.005, segments=3)
    if owner:
        b.box((w - .20, .045, .38), (0, d * .30, .47), mat, bevel=.005)
    else:
        for x in (-w / 2 + .10, w / 2 - .10):
            # Open rectangular steel legs, with real feet and inset end grain.
            b.box((.07, d - .10, .025), (x, 0, .019), o.MAT.frame, bevel=.007)
            for y in (-d / 2 + .075, d / 2 - .075):
                b.box((.048, .048, o.DESK_H - .07), (x, y, (o.DESK_H - .07) / 2 + .025), o.MAT.frame, bevel=.005)
        b.box((w - .25, .04, .05), (0, d * .22, o.DESK_H - .095), o.MAT.frame, bevel=.005)
    b.box((w * .42, .16, .06), (0, d * .20, o.DESK_H - .09), o.MAT.plastic_dark, bevel=.007)
    return b.build(name)


def coffee_table():
    b = o.MeshBuilder()
    b.cylinder(.41, .024, 48, (0, 0, .418), o.MAT.frame)
    b.cylinder(.28, .39, 36, (0, 0, .205), o.MAT.frame)
    for i in range(44):
        a = i * math.tau / 44
        b.cylinder(.009, .38, 5, (.283 * math.cos(a), .283 * math.sin(a), .205), o.MAT.frame)
    return b.build("coffee_table_fluted")


def meeting_table():
    b = o.MeshBuilder()
    # Extruded ellipse, clean perimeter with an actual underside.
    loops = [[(.87 * math.cos(i * math.tau / 48), .46 * math.sin(i * math.tau / 48), z) for i in range(48)] for z in (.705, .74)]
    b.face(list(reversed(loops[0])), o.MAT.laminate)
    b.face(loops[1], o.MAT.laminate)
    for i in range(48):
        j = (i + 1) % 48
        b.face((loops[0][i], loops[0][j], loops[1][j], loops[1][i]), o.MAT.edge)
    for x in (-.52, .52):
        b.box((.06, .56, .03), (x, 0, .02), o.MAT.frame, bevel=.006)
        b.box((.045, .05, .69), (x, 0, .367), o.MAT.frame, bevel=.005)
    return b.build("meeting_table_oval")


def notebook():
    b = o.MeshBuilder()
    b.box((.21, .29, .010), (0, 0, .008), o.MAT.paper, bevel=.001)
    for z in (.002, .014):
        b.box((.215, .297, .003), (0, 0, z), o.MAT.book_tan, bevel=.001)
    b.box((.005, .295, .015), (-.106, 0, .008), o.MAT.book_dark)
    b.cylinder(.003, .14, 8, (.02, .05, .020), o.MAT.frame, axis="Y", rot=(0, 0, o.rad(20)))
    b.cylinder(.0032, .025, 8, (.047, .11, .020), o.MAT.chrome, axis="Y", rot=(0, 0, o.rad(20)))
    return b.build("notebook_bound")


def templates(rng):
    ORIGINAL["templates"](rng)
    o.TEMPLATES["desk_leader"] = detailed_desk(1.8, .9, o.MAT.laminate, "desk_leader_oak")
    o.TEMPLATES["desk_exec"] = detailed_desk(2.0, .9, o.MAT.walnut, "desk_owner_walnut", owner=True)
    o.TEMPLATES["desk_deputy"] = detailed_desk(1.8, .8, o.MAT.white_lam, "desk_deputy_light")
    o.TEMPLATES["chair_leader"] = chair("chair_leader", o.MAT.fabric, managerial=True)
    o.TEMPLATES["chair_exec"] = executive_chair()
    o.TEMPLATES["plant_stair"] = plant("plant_stair", .24, .44, .38, .18, 24, rng, shrub=True)
    # Ground-floor lounge and owner's guest armchair use orange upholstery.
    arm = o.TEMPLATES["armchair"]
    for i, mat in enumerate(arm.materials):
        if mat == o.MAT.sofa:
            arm.materials[i] = o.MAT.fabric_accent
    b = o.MeshBuilder()
    b.box((.25, .21, .003), (0, 0, .002), o.MAT.fabric, bevel=.018, segments=3)
    o.TEMPLATES["mousemat"] = b.build("mousemat")
    b = o.MeshBuilder()
    b.cylinder(.038, .004, 20, (0, 0, -.001), o.MAT.frame)
    b.cylinder(.029, .002, 20, (0, 0, .001), o.MAT.plastic_black)
    b.box((.018, .008, .003), (0, .025, .003), o.MAT.plastic_dark)
    o.TEMPLATES["grommet"] = b.build("desk_grommet")
    b = o.MeshBuilder()
    b.cylinder(.035, .09, 16, (0, 0, .045), o.MAT.plastic_dark)
    for i in range(4):
        b.cylinder(.0025, .14, 6, ((i % 2 - .5) * .022, (i // 2 - .5) * .022, .09), o.MAT.frame)
    o.TEMPLATES["penpot"] = b.build("penpot")
    b = o.MeshBuilder()
    b.box((.072, .032, .03), (0, 0, .015), o.MAT.plastic_black, bevel=.008)
    b.cylinder(.009, .003, 14, (0, -.018, .019), o.MAT.chrome, axis="Y")
    b.cylinder(.006, .004, 14, (0, -.020, .019), o.MAT.plastic_black, axis="Y")
    o.TEMPLATES["webcam"] = b.build("webcam")
    b = o.MeshBuilder()
    for z in (0, .045, .09):
        b.box((.24, .30, .008), (0, 0, .03 + z), o.MAT.frame)
        b.box((.25, .006, .03), (0, .15, .045 + z), o.MAT.frame)
        for x in (-.12, .12):
            b.box((.007, .30, .03), (x, 0, .045 + z), o.MAT.frame)
        b.box((.20, .25, .009), (0, 0, .04 + z), o.MAT.paper)
    o.TEMPLATES["document_tray"] = b.build("document_tray")
    b = o.MeshBuilder()
    b.sphere(1, (0, 0, .18), o.MAT.fabric_accent, u=14, v=10, scale=(.20, .09, .20))
    o.TEMPLATES["cushion_orange"] = b.build("cushion_orange")
    b = o.MeshBuilder()
    b.sphere(1, (0, 0, .17), o.MAT.fabric, u=14, v=10, scale=(.18, .08, .18))
    o.TEMPLATES["cushion_grey"] = b.build("cushion_grey")


def books(name, width=.58, upright=True):
    b = o.MeshBuilder()
    x = -width / 2
    rng = random.Random(sum(map(ord, name)))
    mats = (o.MAT.book_dark, o.MAT.book_tan, o.MAT.book_blue, o.MAT.paper)
    i = 0
    while x < width / 2 - .03:
        thick = rng.uniform(.025, .048)
        h = rng.uniform(.20, .285)
        mat = mats[i % len(mats)]
        b.box((thick, .19, h), (x + thick / 2, 0, h / 2), mat, bevel=.002, segments=1)
        for z in (h * .13, h * .8):
            b.box((thick * .72, .002, .004), (x + thick / 2, -.096, z), o.MAT.paper)
        x += thick + .005
        i += 1
    return b.build(name)


def add(name, builder, col, position, yaw=0):
    obj = o.add_object(name, builder.build(name) if isinstance(builder, o.MeshBuilder) else builder, col)
    o.place(obj, o.frame_matrix(position, o.rad(yaw)))
    return obj


def accessories(tag, col, frame, mouse_x=.33, mouse_y=-.14, manager=False):
    o.instance("mousemat", tag + "_mousemat", col, frame, (mouse_x, mouse_y, o.DESK_H))
    o.instance("grommet", tag + "_grommet", col, frame, (.52, .29, o.DESK_H))
    # Short visible cable bends, never a simulated wire.
    b = o.MeshBuilder()
    b.torus_arc(.065, .003, 90, 8, 5, (.475, .22, o.DESK_H + .006), o.MAT.rubber)
    b.box((.08, .015, .045), (0, .245, o.DESK_H - .05), o.MAT.plastic_dark, bevel=.005)
    add(tag + "_cable", b, col, (0, 0, 0)).matrix_world = frame
    if manager:
        o.instance("headset", tag + "_headset", col, frame, (.72, .24, o.DESK_H), 12)
        o.instance("penpot", tag + "_penpot", col, frame, (-.7, -.26, o.DESK_H))
        # Separate side pedestal: the whole foliage envelope clears both the
        # monitor bezel and the camera's approach to the left screen.
        b = o.MeshBuilder()
        b.box((.34, .36, o.DESK_H - .025), (-1.18, .12, (o.DESK_H - .025) / 2),
              o.MAT.walnut if tag == "owner" else o.MAT.white_lam, bevel=.006)
        b.box((.38, .40, .025), (-1.18, .12, o.DESK_H - .0125),
              o.MAT.walnut if tag == "owner" else o.MAT.laminate, bevel=.004)
        add(tag + "_plant_pedestal", b, col, (0, 0, 0)).matrix_world = frame
        o.instance("plant_desk", tag + "_deskplant", col, frame, (-1.18, .12, o.DESK_H))


def workstation(index, frame, rng, hero, col="Workstations"):
    ORIGINAL["workstation"](index, frame, rng, hero, col)
    accessories("ws%02d" % index, col, frame)
    if hero:
        # The featured arrangement contains every approved close-up accessory.
        for key, local in (("cup", (.55, .05, o.DESK_H)), ("notebook", (-.33, -.12, o.DESK_H)),
                           ("plant_desk", (.63, .27, o.DESK_H)), ("penpot", (-.70, -.20, o.DESK_H))):
            old = bpy.data.objects.get("ws%02d_%s" % (index, {"plant_desk": "plant"}.get(key, key)))
            if not old:
                o.instance(key, "hero_" + key, col, frame, local)


def manager(desk_key, mon_key, tag, col, frame, chair_key="chair_exec"):
    screen = ORIGINAL["manager"](desk_key, mon_key, tag, col, frame,
                                 chair_key="chair_leader" if tag == "leader" else "chair" if tag == "deputy" else "chair_exec")
    accessories(tag, col, frame, mouse_x=o.MANAGER_SEAT_X + .32, mouse_y=-.18, manager=True)
    if tag == "owner":
        b = o.MeshBuilder()
        for x in (-.72, .72):
            b.box((.42, .78, .70), (x, 0, .36), o.MAT.walnut, bevel=.005, segments=2)
            for z in (.20, .40, .59):
                b.box((.398, .016, .17), (x, -.40, z), o.MAT.walnut, bevel=.002)
                b.box((.19, .018, .01), (x, -.414, z + .035), o.MAT.frame)
        add("owner_desk_drawers", b, col, (0, 0, 0)).matrix_world = frame
        b = o.MeshBuilder()
        # Entire silhouette stays to the left of the left 27-inch monitor.
        # Its previous inward arm placed the shade inside the screen rectangle.
        b.cylinder(.075, .012, 24, (-.87, -.24, o.DESK_H + .006), o.MAT.brass)
        b.cylinder(.009, .45, 10, (-.87, -.24, o.DESK_H + .23), o.MAT.brass)
        b.cylinder(.006, .08, 10, (-.83, -.24, o.DESK_H + .45), o.MAT.brass, axis="X")
        b.cylinder(.075, .065, 20, (-.79, -.24, o.DESK_H + .41), o.MAT.frame, radius2=.045)
        b.cylinder(.068, .002, 20, (-.79, -.24, o.DESK_H + .376), o.MAT.warm_strip)
        add("owner_brass_lamp", b, col, (0, 0, 0)).matrix_world = frame
    else:
        b = o.MeshBuilder()
        # Small caster wheels support the mobile drawer unit on the floor.
        for x in (-.78, -.50):
            for y in (-.20, .18):
                b.cylinder(.033, .025, 12, (x, y, .038), o.MAT.rubber, axis="X")
                b.box((.027, .024, .063), (x, y, .0915), o.MAT.chrome, bevel=.004)
        for z in (.28, .48):
            b.box((.35, .54, .17), (-.64, -.01, z), o.MAT.white_lam if tag == "deputy" else o.MAT.laminate, bevel=.004)
            b.box((.14, .018, .012), (-.64, -.295, z + .03), o.MAT.frame, bevel=.003)
        b.box((.36, .56, .08), (-.64, -.01, .16), o.MAT.frame, bevel=.008)
        add(tag + "_mobile_drawers", b, col, (0, 0, 0)).matrix_world = frame
    if tag == "deputy":
        o.instance("webcam", "deputy_webcam", col, frame, (.34, .25, o.DESK_H + .416))
    return screen


def framed_art(name, width, height, col, position, yaw, board=False):
    b = o.MeshBuilder()
    b.box((width + .045, .038, height + .045), (0, 0, 0), o.MAT.frame, bevel=.004)
    b.box((width, .012, height), (0, -.026, 0), o.MAT.paper)
    if board:
        for i in range(1, 6):
            b.box((.002, .002, height), (-width / 2 + width * i / 6, -.034, 0), o.MAT.plastic_grey)
        for i in range(1, 4):
            b.box((width, .002, .002), (0, -.034, -height / 2 + height * i / 4), o.MAT.plastic_grey)
        for i in range(11):
            x = -width * .4 + i % 5 * width * .16
            z = height * .3 - i // 5 * height * .25
            b.box((width * .105, .003, height * .12), (x, -.036, z), o.MAT.accent if i % 3 == 0 else o.MAT.book_tan)
            b.cylinder(.012, .004, 10, (x, -.04, z + height * .05), o.MAT.frame, axis="Y")
    else:
        b.box((width * .38, .003, height * .80), (-width * .14, -.034, 0), o.MAT.accent)
        b.box((width * .36, .003, height * .48), (width * .14, -.038, -height * .17), o.MAT.logo_panel)
        b.box((width * .38, .003, height * .22), (width * .08, -.04, height * .25), o.MAT.book_tan)
    return add(name, b, col, position, yaw)


def shelving(name, col, position, yaw, width=1.6, walnut=False, levels=(1.5, 2.05)):
    b = o.MeshBuilder()
    wood = o.MAT.walnut if walnut else o.MAT.laminate
    for z in levels:
        b.box((width, .30, .035), (0, 0, z), wood, bevel=.003)
        for x in (-width * .33, width * .33):
            b.box((.025, .25, .15), (x, .02, z - .085), o.MAT.frame)
        if walnut:
            b.box((width - .05, .014, .006), (0, -.11, z - .019), o.MAT.warm_strip)
    frame = o.frame_matrix(position, o.rad(yaw))
    obj = add(name, b, col, position, yaw)
    for i, z in enumerate(levels):
        add(name + "_books_%d" % i, books(name + str(i), width * .40), col, (0, 0, 0)).matrix_world = frame @ o.frame_matrix((-.30, 0, z + .018), 0)
        o.instance("plant_desk", name + "_plant_%d" % i, col, frame, (width * .35, 0, z + .018), i * 47)
    return obj


def lounge_dressing(name, col, position):
    frame = o.frame_matrix(position, 0)
    o.instance("notebook", name + "_book", col, frame, (-.12, -.06, .435), 18)
    o.instance("cup", name + "_cup", col, frame, (.22, -.04, .435))
    o.instance("plant_desk", name + "_plant", col, frame, (.06, .18, .435))


def wall_dressing():
    """Reference-driven functional wall furniture; grouped opaque geometry."""
    col = "Building_F1"
    framed_art("hall_team_board", 2.0, 1.05, col, (12.5, .055, 1.80), 180, True)
    cabinet = o.build_cabinet("hall_bookcase_base", 2.2, .43, 1.08, o.MAT.laminate)
    add("hall_bookcase_base", cabinet, col, (16.2, .30, 0), 180)
    shelving("hall_bookcase", col, (16.2, .27, 0), 180, 2.15, False, (1.48, 2.05))
    # Second module beside the printer: different closed storage from the
    # owner's walnut furniture and the deputy's white file cabinet.
    cabinet = o.build_cabinet("hall_oak_storage_module", 1.45, .46, .72, o.MAT.laminate)
    add("hall_oak_storage_module", cabinet, col, (20.96, 7.10, 0), -90)
    bpy.data.objects["lounge_plant"].location = (20.4, 7.35, 0)
    # Open gallery wall also carries a quiet reading/filing niche.
    z = o.F2_Z
    cabinet = o.build_cabinet("gallery_storage", 2.05, .43, .82, o.MAT.white_lam)
    add("gallery_storage", cabinet, "Floor2_Rooms", (15.3, .30, z), 180)
    shelving("gallery_books", "Floor2_Rooms", (15.3, .27, z), 180, 2.0, False, (1.34, 1.97))
    framed_art("gallery_art", .83, 1.04, "Floor2_Rooms", (18.0, .055, z + 1.78), 180)
    # Balcony opposite the owner's glass front, on the southern solid strip.
    # The stair foot and the 1.25 m gallery lane along the void stay clear.
    col = "Floor2_Rooms"
    b = o.MeshBuilder()
    b.box((1.8, .48, .10), (0, 0, .40), o.MAT.laminate, bevel=.018)
    b.box((1.72, .45, .085), (0, 0, .493), o.MAT.sofa, bevel=.025, segments=3)
    for x in (-.68, .68):
        b.box((.045, .38, .35), (x, 0, .175), o.MAT.frame)
    add("balcony_reading_bench", b, col, (3.65, .52, z))
    cabinet = o.build_cabinet("balcony_book_storage", .8, .40, .78, o.MAT.laminate)
    add("balcony_book_storage", cabinet, col, (5.25, .32, z), 180)
    shelving("balcony_books", col, (5.25, .25, z), 180, .85, False, (1.28, 1.87))
    framed_art("balcony_art", 1.25, .78, col, (3.65, .055, z + 1.72), 180)
    o.instance("notebook", "balcony_notebook", col, o.frame_matrix((3.1, .52, z + .54), o.rad(8)))


def interior_dressing():
    # Hall: real slat depth, storage, printer, planters, ceiling joints/vents.
    col = "Building_F1"
    b = o.MeshBuilder()
    for i in range(138):
        y = 2.1 + i * .068
        b.box((.06, .038, 2.64), (o.ROOM_X - .03, y, 1.60), o.MAT.laminate)
    add("hall_oak_slat_wall", b, col, (0, 0, 0))
    # Move the logo face forward from the newly built slats, not coplanar.
    bpy.data.objects["logo_wall"].location.x -= .056
    o.TEMPLATES["hall_storage"] = o.build_cabinet("hall_storage", 1.7, .46, .72, o.MAT.laminate)
    o.instance("hall_storage", "hall_storage_0", col, o.frame_matrix((20.96, 8.9, 0), o.rad(-90)))
    b = o.MeshBuilder()
    b.box((.48, .40, .27), (0, 0, .135), o.MAT.plastic_grey, bevel=.025)
    b.box((.45, .32, .07), (0, .01, .287), o.MAT.plastic_black, bevel=.018)
    b.box((.34, .17, .015), (0, -.17, .08), o.MAT.plastic_black)
    b.box((.12, .04, .01), (.12, -.08, .326), o.MAT.plastic_dark)
    add("hall_printer", b, col, (20.95, 8.9, .72), -90)
    # The reference's conversational group sits at the right of the starting
    # view, ahead of the nearest column; it is not hidden at the far logo wall.
    o.place(bpy.data.objects["lounge_table"], o.frame_matrix((5.55, 2.35, 0), 0))
    o.place(bpy.data.objects["lounge_armchair_0"], o.frame_matrix((6.5, 1.35, 0), o.rad(45)))
    o.place(bpy.data.objects["lounge_armchair_1"], o.frame_matrix((6.5, 3.35, 0), o.rad(135)))
    lounge_dressing("hall_lounge", col, (5.55, 2.35, 0))
    # Hall chairs point at the table; restore the planned orange fabric.
    shrub = o.instance("plant_stair", "atrium_stair_plant", "Atrium_Stairs", o.frame_matrix((1.90, 4.10, 0), 0))
    # Keep even the widest leaf off the stair rail, while putting the pot as
    # close as that full foliage envelope allows.
    min_leaf_x = min(v.co.x for v in shrub.data.vertices)
    shrub.location.x = max(shrub.location.x, o.STAIR_X0 + o.STAIR_W + .055 - min_leaf_x)
    column_plant = o.instance("plant_floor", "hall_column_plant", col, o.frame_matrix((6.25, 5.0, 0), 0))
    max_leaf_x = max(v.co.x for v in column_plant.data.vertices)
    column_plant.location.x = 7 - .2 - .06 - max_leaf_x
    # The larger leaves need an actual camera reserve, rather than the old
    # small-plant centre 30 cm from the starting lens.
    bpy.data.objects.remove(bpy.data.objects["entry_plant"], do_unlink=True)
    # The refined foliage is wider than the old placeholder. Reserve its whole
    # envelope beside room furniture, rather than checking only the pot centre.
    bpy.data.objects["leader_plant"].location = (20.55, 16.10, 0)
    bpy.data.objects["owner_plant"].location = (5.65, 16.10, o.F2_Z)
    bpy.data.objects["deputy_plant"].location = (8.45, 8.95, o.F2_Z)

    col = "LeaderOffice"
    # Oval table, four inward-facing chairs, clear of the main desk/door.
    table = bpy.data.objects["leader_meeting_table"]
    table.location = (17.75, 15.1, 0)
    for i in (0, 1):
        bpy.data.objects.remove(bpy.data.objects["leader_meeting_chair_%d" % i], do_unlink=True)
    for i, (x, y, yaw) in enumerate(((17.15, 14.23, 0), (18.35, 14.23, 0), (17.15, 15.97, 180), (18.35, 15.97, 180))):
        o.instance("chair_side", "leader_meeting_chair_%d" % i, col, o.frame_matrix((x, y, 0), o.rad(yaw)))
    o.instance("plant_desk", "leader_meeting_plant", col, o.frame_matrix((17.75, 15.1, .74), 0))
    o.instance("notebook", "leader_meeting_book", col, o.frame_matrix((17.25, 15.1, .74), 0))
    # East wall: cabinet, shelves, framed acoustic backing and art.
    b = o.MeshBuilder()
    b.box((.033, 2.0, 1.5), (21.46, 14.05, 1.85), o.MAT.partition)
    add("leader_acoustic_panel", b, col, (0, 0, 0))
    framed_art("leader_art", .8, 1.04, col, (21.42, 14.05, 1.9), -90)
    framed_art("leader_whiteboard", 1.5, .86, col, (21.42, 15.9, 1.65), -90, True)
    shelving("leader_shelves", col, (21.28, 11.8, 0), -90, 1.6)
    o.instance("document_tray", "leader_tray", col, o.frame_matrix((21.04, 11.8, 1.1), o.rad(90)))

    col = "Floor2_Rooms"
    z = o.F2_Z
    # Owner: a larger walnut wall unit and warm inset shelves at the east wall.
    b = o.MeshBuilder()
    b.box((.04, 2.7, 2.85), (6.965, 15.35, z + 1.5), o.MAT.walnut)
    add("owner_walnut_wall", b, col, (0, 0, 0))
    o.TEMPLATES["owner_low_storage"] = o.build_cabinet("owner_low_storage", 2.6, .46, .78, o.MAT.walnut)
    o.instance("owner_low_storage", "owner_east_storage", col, o.frame_matrix((6.68, 15.3, z), o.rad(-90)))
    shelving("owner_built_in", col, (6.72, 15.25, z), -90, 2.3, True, (1.25, 1.79, 2.33))
    # The front half of this wall remains visible during the desk approach;
    # give it a separate walnut-backed composition, clear of the bookcase.
    b = o.MeshBuilder()
    b.box((.035, 1.70, 1.60), (6.965, 12.45, z + 1.82), o.MAT.walnut, bevel=.008)
    add("owner_front_art_backing", b, col, (0, 0, 0))
    framed_art("owner_front_art", 1.18, 1.22, col, (6.925, 12.45, z + 1.82), -90)
    framed_art("owner_large_art", 1.02, 1.35, col, (.045, 14.0, z + 1.8), 90)
    # Light rug, cushion silhouettes and usable conversational group.
    b = o.MeshBuilder()
    b.box((2.4, 2.35, .006), (1.7, 15.15, z + .006), o.MAT.partition, bevel=.08, segments=3)
    add("owner_lounge_rug", b, col, (0, 0, 0))
    for i, (x, mat) in enumerate(((.95, "cushion_orange"), (1.72, "cushion_grey"))):
        o.instance(mat, "owner_cushion_%d" % i, col, o.frame_matrix((x, 16.40, z + .49), 0))
    lounge_dressing("owner_lounge", col, (1.4, 15, z))
    o.instance("plant_desk", "owner_storage_plant", col, o.frame_matrix((.32, 12.9, z + .8), 0))
    # Deputy: planning board, white tall closed cabinet and document shelves.
    framed_art("deputy_planner", 1.65, .95, col, (10.95, 4.03, z + 1.82), 180, True)
    o.TEMPLATES["deputy_tall"] = o.build_cabinet("deputy_tall", .72, .43, 2.1, o.MAT.white_lam)
    o.instance("deputy_tall", "deputy_tall_storage", col, o.frame_matrix((12.3, 8.57, z), o.rad(-90)))
    shelving("deputy_shelves", col, (12.35, 5.3, z), -90, 1.8, False, (1.54, 2.12))
    o.instance("document_tray", "deputy_document_tray", col, o.frame_matrix((12.28, 5.3, z + 1.1), 0))
    o.instance("plant_desk", "deputy_tall_plant", col, o.frame_matrix((12.28, 8.57, z + 2.1), 0))
    # The north wall is exposed while the camera loops round the deputy's
    # desk. Dress that view independently of the south-wall planning board.
    # Everything stays shallow against the wall, outside the walking lane.
    b = o.MeshBuilder()
    for i in range(6):
        b.box((.465, .028, 1.38), (9.24 + i * .485, 9.975, z + 1.94),
              o.MAT.partition, bevel=.008)
    add("deputy_north_acoustic_panels", b, col, (0, 0, 0))
    framed_art("deputy_north_team_board", 1.52, .94, col, (10.03, 9.942, z + 1.97), 0, True)
    framed_art("deputy_north_art", .61, .94, col, (11.24, 9.942, z + 1.97), 0)
    b = o.MeshBuilder()
    b.box((2.44, .22, .035), (0, 0, 1.00), o.MAT.laminate, bevel=.004)
    for x in (-.82, .82):
        b.box((.025, .17, .13), (x, .015, .919), o.MAT.frame)
    add("deputy_north_book_ledge", b, col, (10.43, 9.86, z))
    add("deputy_north_books", books("deputy_north_books", .64), col,
        (9.93, 9.86, z + 1.018))
    o.instance("notebook", "deputy_north_notebook", col,
               o.frame_matrix((11.06, 9.86, z + 1.018), o.rad(90)))
    lounge_dressing("gallery_lounge", col, (18.5, 14.4, z))

    # Two floor-specific ceiling layers and flush grilles; no live shadow lights.
    for floor, ceiling in ((1, o.CEIL_H), (2, z + o.F2_CEIL_H)):
        b = o.MeshBuilder()
        for x in np.arange(1.2, o.ROOM_X, 1.2):
            if floor == 1 and x < 6:
                for y0, y1 in ((0, 4), (10, 17)):
                    b.box((.002, y1 - y0, .0015), (x, (y0 + y1) / 2, ceiling - .001), o.MAT.plastic_grey)
            else:
                b.box((.002, 17, .0015), (x, 8.5, ceiling - .001), o.MAT.plastic_grey)
        for y in np.arange(1.2, 17, 1.2):
            start = 6 if floor == 1 and 4 < y < 10 else 0
            b.box((o.ROOM_X - start, .002, .0015), ((o.ROOM_X + start) / 2, y, ceiling - .001), o.MAT.plastic_grey)
        add("ceiling_joints_%d" % floor, b, "Building_F%d" % floor, (0, 0, 0))
        b = o.MeshBuilder()
        for x, y in ((8.1, 2.0), (14, 10.2), (19, 15), (3.6, 13.5)):
            if floor == 1 and x < 6 and 4 < y < 10:
                continue
            b.box((.48, .48, .022), (x, y, ceiling - .010), o.MAT.panel_frame)
            for i in range(10):
                b.box((.39, .009, .006), (x, y - .17 + i * .038, ceiling - .024), o.MAT.plastic_grey)
        add("ceiling_grilles_%d" % floor, b, "Building_F%d" % floor, (0, 0, 0))
    b = o.MeshBuilder()
    for z in (0, o.F2_Z):
        for x in (.018, o.ROOM_X - .018):
            b.box((.023, 17, .072), (x, 8.5, z + .036), o.MAT.panel_frame)
        b.box((o.ROOM_X, .023, .072), (o.ROOM_X / 2, .018, z + .036), o.MAT.panel_frame)
    add("perimeter_skirting", b, "Building_F1", (0, 0, 0))


def metric_uvs():
    # Dominant-face planar projection, deterministic metre scale. Small bevels
    # share neighbouring projections; screens retain their explicit 0..1 UVs.
    seen = set()
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("screen_") or obj.name == "exterior_city_backdrop" or obj.data in seen:
            continue
        seen.add(obj.data)
        mesh = obj.data
        uv = mesh.uv_layers.active or mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            normal = poly.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            a, b = ((1, 2), (0, 2), (0, 1))[axis]
            mat = mesh.materials[poly.material_index]
            scale = TEXTURED.get(mat.name, .6 if "carpet" in mat.name else 1)
            for index in poly.loop_indices:
                co = mesh.vertices[mesh.loops[index].vertex_index].co
                uv.data[index].uv = (co[a] / scale, co[b] / scale)
        mesh.update()


def authored_textures(out):
    # Seamless oak figure and carpet weave. Microtexture remains in maps.
    directory = os.path.join(out, "textures")
    os.makedirs(directory, exist_ok=True)
    n = 512
    y, x = np.mgrid[0:n, 0:n] / n
    rng = np.random.default_rng(7)
    grain = np.zeros((n, n))
    warp = .10 * np.sin(y * math.tau) + .07 * np.sin(y * math.tau * 3 + x * math.tau * 2)
    for frequency in (9, 17, 37, 61, 109, 191):
        grain += .007 * np.sin(math.tau * (x * frequency + warp) + rng.uniform(0, math.tau))
    grain += .004 * rng.normal(size=(n, n))
    pixels = np.ones((n, n, 4), np.float32)
    for channel, base in enumerate((.63, .47, .30)):
        pixels[:, :, channel] = np.clip(base + grain, 0, 1)
    oak = procedural_image("oak_base", pixels, directory)
    node = o.MAT.laminate.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = oak
    o.MAT.laminate.node_tree.links.new(node.outputs["Color"], principled(o.MAT.laminate).inputs["Base Color"])
    for mat in (o.MAT.edge, o.MAT.stair_tread):
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = oak
        mat.node_tree.links.new(node.outputs["Color"], principled(mat).inputs["Base Color"])
        TEXTURED[mat.name] = 1.15
    weave = (.005 * rng.normal(size=(n, n)) + .006 * np.sin(math.tau * x * 127) * np.sin(math.tau * y * 121)
             + .003 * np.sin(math.tau * (x * 7 + .35 * np.sin(math.tau * y * 5))))
    pixels = np.ones((n, n, 4), np.float32)
    for channel, base in enumerate((.47, .455, .43)):
        pixels[:, :, channel] = np.clip(base + weave, 0, 1)
    # The approved alternating 60 cm carpet tiles supply the colour. Fine weave
    # stays in the shared normal/roughness maps, without a large colour pattern.
    # One fine fabric normal shared by carpet and upholstery.
    for mat in (o.MAT.carpet_a, o.MAT.carpet_b):
        pbr(mat, "fabric_pattern_07", .60, .16, base=False)


def floor_bake(out):
    """Diffuse irradiance, direct+indirect, with albedo excluded. Two UV1 maps.

    Consumers use an unlit material with lightMap; direct lighting is therefore
    not applied twice. The PNG encodes linear [0, 4] in sRGB, scale in manifest.
    Glass does not block light during baking. No characters are baked in.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.cycles.bake_type = "DIFFUSE"
    scene.render.bake.use_pass_color = False
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    hidden = []
    for obj in scene.objects:
        if obj.type == "MESH" and (obj.name == "exterior_city_backdrop" or ("glass" in obj.name and "frame" not in obj.name and "door" not in obj.name)):
            hidden.append((obj, obj.hide_render))
            obj.hide_render = True
    # Transmission panes must pass daylight; door frames remain in the bake.
    glass = principled(o.MAT.glass)
    old_weight = glass.inputs["Transmission Weight"].default_value
    glass.inputs["Transmission Weight"].default_value = 1
    old_world = scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .65
    result = []
    for floor in (1, 2):
        obj = bpy.data.objects["floor%d_carpet" % floor]
        uv0 = obj.data.uv_layers.active
        uv1 = obj.data.uv_layers.get("LightmapUV") or obj.data.uv_layers.new(name="LightmapUV")
        for index, loop in enumerate(obj.data.loops):
            co = obj.data.vertices[loop.vertex_index].co
            uv1.data[index].uv = (co.x / o.ROOM_X, co.y / o.ROOM_Y)
        obj.data.uv_layers.active = uv1
        uv1.active_render = True
        image = bpy.data.images.new("floor%d_irradiance" % floor, width=1024, height=1024, float_buffer=True)
        image.colorspace_settings.name = "Non-Color"
        assigned = []
        for mat in obj.data.materials:
            node = mat.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            mat.node_tree.nodes.active = node
            assigned.append((mat, node))
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        o.log("baking floor%d diffuse irradiance" % floor)
        bpy.ops.object.bake(type="DIFFUSE")
        raw = np.empty(1024 * 1024 * 4, dtype=np.float32)
        image.pixels.foreach_get(raw)
        raw = raw.reshape((1024, 1024, 4))
        raw[:, :, :3] = np.clip(raw[:, :, :3] / 4, 0, 1)
        # Cycles' render denoiser does not denoise object bakes. A small bilateral
        # filter reduces sampling grain without moving contact/window edges.
        rgb = raw[:, :, :3].copy()
        padded = np.pad(rgb, ((2, 2), (2, 2), (0, 0)), mode="edge")
        accumulated = np.zeros_like(rgb)
        weights = np.zeros((1024, 1024, 1), dtype=np.float32)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                neighbor = padded[2 + dy:1026 + dy, 2 + dx:1026 + dx]
                difference = np.mean((rgb - neighbor) ** 2, axis=2, keepdims=True)
                weight = np.exp(-difference / (.035 ** 2) - (dx * dx + dy * dy) / 4)
                accumulated += neighbor * weight
                weights += weight
        raw[:, :, :3] = accumulated / weights
        raw[:, :, 3] = 1
        encoded = procedural_image("floor%d_light" % floor, raw, out, data=False)
        encoded.use_fake_user = True
        result.append({"mesh": obj.name, "image": os.path.basename(encoded.filepath_raw), "uvChannel": 1,
                       "range": 4, "encoding": "sRGB", "width": 1024, "height": 1024})
        for mat, node in assigned:
            mat.node_tree.nodes.remove(node)
        obj.data.uv_layers.active = uv0
        uv0.active_render = True
    glass.inputs["Transmission Weight"].default_value = old_weight
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = old_world
    for obj, value in hidden:
        obj.hide_render = value
    return result


def exterior_city():
    """User-selected 2:1 photograph on a fixed full 360-degree image shell.

    No exterior ground, planters, buildings, lights or moving backdrop.
    Sun faces the exterior north windows, seam faces the opaque west wall.
    The photographed horizon is calibrated to eye level, without repainting.
    """
    for name in ("ground", "exterior_blocks", "exterior_low_borders", "exterior_park_backdrop"):
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
    mat = bpy.data.materials.new("exterior_city_unlit")
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    output = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    emission = mat.node_tree.nodes.new("ShaderNodeEmission")
    image = image_node(mat, os.path.join(SOURCE, "exterior-user-skyscraper-runtime.png"))
    mat.node_tree.links.new(image.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    mat.use_backface_culling = True
    vertices, faces = [], []
    segments, rings, radius = 64, 32, 1000
    for j in range(rings + 1):
        latitude = math.pi * (j / rings - .5)
        for i in range(segments + 1):
            longitude = math.tau * (i / segments - .26)
            vertices.append((o.ROOM_X / 2 + radius * math.cos(latitude) * math.sin(longitude),
                             o.ROOM_Y / 2 + radius * math.cos(latitude) * math.cos(longitude),
                             1.75 + radius * math.sin(latitude)))
    for j in range(rings):
        for i in range(segments):
            k = j * (segments + 1) + i
            if j == 0:
                faces.append((k, k + segments + 1, k + segments + 2))
            elif j == rings - 1:
                faces.append((k, k + segments + 1, k + 1))
            else:
                faces.append((k, k + segments + 1, k + segments + 2, k + 1))
    mesh = bpy.data.meshes.new("exterior_city_backdrop")
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:
            vertex = mesh.loops[loop].vertex_index
            uv.data[loop].uv = (vertex % (segments + 1) / segments,
                                min(1, .10 + vertex // (segments + 1) / rings))
    backdrop = o.add_object("exterior_city_backdrop", mesh, "Exterior")
    backdrop.visible_diffuse = False
    backdrop.visible_glossy = False
    backdrop.visible_shadow = False


def finish(module, out, bake=False):
    t0 = time.time()
    interior_dressing()
    wall_dressing()
    exterior_city()
    # Distinct muted wall finishes support each room's furniture palette.
    for name, material in (("owner_wall_e", o.MAT.wall_sand),
                           ("deputy_wall_n", o.MAT.wall_sage),
                           ("deputy_wall_s", o.MAT.wall_sage)):
        obj = bpy.data.objects[name]
        obj.data.materials.clear()
        obj.data.materials.append(material)
    # Keep the complete foliage inside the facade after replacing the narrow
    # placeholder plants, including the two distant gallery corners.
    bpy.context.view_layer.update()
    for name in ("f2_plant_0", "f2_plant_1"):
        obj = bpy.data.objects[name]
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        obj.location.x += min(0, o.ROOM_X - .075 - max(p.x for p in corners))
        obj.location.y += max(0, .075 - min(p.y for p in corners))
    authored_textures(out)
    metric_uvs()
    # Keep external baked lighting addressable on geometry-only rebuilds too.
    for floor in (1, 2):
        obj = bpy.data.objects["floor%d_carpet" % floor]
        uv1 = obj.data.uv_layers.get("LightmapUV") or obj.data.uv_layers.new(name="LightmapUV")
        for index, loop in enumerate(obj.data.loops):
            co = obj.data.vertices[loop.vertex_index].co
            uv1.data[index].uv = (co.x / o.ROOM_X, co.y / o.ROOM_Y)
    lightmaps = floor_bake(out) if bake else []
    if not bake:
        for floor in (1, 2):
            file = os.path.join(out, "floor%d_light.png" % floor)
            if os.path.isfile(file):
                image = bpy.data.images.load(file, check_existing=True)
                image.pack()
                lightmaps.append({"file": os.path.basename(file), "method": "Reused bake of unchanged interior after exterior ground removal; image shell excluded from baking"})
    # Save source information for external binding and reproducibility.
    fixtures = []
    for obj in bpy.context.scene.objects:
        if obj.type == "LIGHT":
            fixtures.append({"name": obj.name, "type": obj.data.type, "position": list(obj.location),
                             "rotation": list(obj.rotation_euler), "energy": obj.data.energy, "color": list(obj.data.color)})
    counts = {obj.name: {"mesh": obj.data.name, "vertices": len(obj.data.vertices),
                        "triangles": o.tri_count(obj.data), "position": list(obj.location)}
              for obj in bpy.context.scene.objects if obj.type == "MESH"}
    report = {"schema": "verbatrace.office.v2", "seed": 7, "units": "metres", "coordinates": "Blender Z-up",
              "method": "authored Blender geometry + shared PBR + floor irradiance bake",
              "lightmaps": lightmaps, "fixtures": fixtures, "objects": counts,
              "sources": json.load(open(os.path.join(SOURCE, "sources.json"), encoding="utf-8-sig"))}
    with open(os.path.join(out, "office-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    o.log("detail kit and lighting prepared in %.1fs" % (time.time() - t0))


def install(module):
    global o
    o = module
    ORIGINAL.update(materials=o.build_materials, templates=o.build_templates, chair=o.build_task_chair,
                    desk=o.build_desk, workstation=o.build_workstation, manager=o.manager_desk)
    o.build_materials = material_textures
    o.build_templates = templates
    o.build_keyboard = keyboard
    o.build_mouse = mouse
    o.build_headset_stand = headset
    o.build_cup = cup
    o.build_notebook = notebook
    o.build_plant = plant
    o.build_task_chair = chair
    o.build_coffee_table = coffee_table
    o.build_meeting_table = meeting_table
    o.build_workstation = workstation
    o.manager_desk = manager

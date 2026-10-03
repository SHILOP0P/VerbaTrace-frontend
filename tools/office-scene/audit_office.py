"""Audit the authored .blend: Blender --background office.blend --python this.py -- report.json."""
import bpy
import json
import math
import sys
from mathutils import Vector


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return [[min(p[a] for p in points), max(p[a] for p in points)] for a in range(3)]


def overlap(a, b):
    return all(min(a[i][1], b[i][1]) - max(a[i][0], b[i][0]) > .001 for i in range(3))


bpy.context.view_layer.update()
meshes = {obj.name: bounds(obj) for obj in bpy.context.scene.objects if obj.type == "MESH"}
checks = []


def check(name, passed, evidence):
    checks.append({"name": name, "passed": bool(passed), "evidence": evidence})


check("entry plant removed", "entry_plant" not in meshes, None)
stair = meshes["atrium_stair_plant"]
check("stair foliage clears rail", stair[0][0] >= 1.355 - .001, stair)
column = meshes["hall_column_plant"]
check("column foliage clears column west face", column[0][1] <= 6.741, column)
check("owner plant clears walnut storage", not overlap(meshes["owner_plant"], meshes["owner_east_storage"]),
      [meshes["owner_plant"], meshes["owner_east_storage"]])
check("deputy plant clears tall cabinet", not overlap(meshes["deputy_plant"], meshes["deputy_tall_storage"]),
      [meshes["deputy_plant"], meshes["deputy_tall_storage"]])
for name, x0, x1, y0, y1 in [("owner_plant", 0, 7, 11, 16.925),
                              ("deputy_plant", 7.6, 12.6, 4, 10),
                              ("leader_plant", 16, 21.5, 10.5, 16.925)]:
    box = meshes[name]
    check(name + " foliage inside room", box[0][0] > x0 and box[0][1] < x1 and
          box[1][0] > y0 and box[1][1] < y1, box)
monitors = {name: box for name, box in meshes.items() if name.startswith("monitor_")}
for name, box in meshes.items():
    if "plant" in name or "lamp" in name:
        intersected = [other for other, other_box in monitors.items() if overlap(box, other_box)]
        check(name + " clears all monitor envelopes", not intersected, intersected)
    if "plant" in name and "pedestal" not in name:
        check(name + " foliage inside building facade", box[0][0] >= .035 and box[0][1] <= 21.465
              and box[1][0] >= .035 and box[1][1] <= 16.925, box)
        if min(abs(box[2][0]), abs(box[2][0] - 3.4)) < .01:
            intersected = [other for other, other_box in meshes.items()
                           if other.startswith("column_f") and overlap(box, other_box)]
            check(name + " clears all structural columns", not intersected, intersected)
for name in ("lounge_armchair_0", "lounge_armchair_1"):
    # World AABBs overlap at empty corners for rotated chairs and a circular
    # table. Prove separation using the chair's oriented rectangular envelope
    # and the table's enclosing vertical cylinder instead.
    chair = bpy.data.objects[name]
    table = bpy.data.objects["lounge_table"]
    centre = chair.matrix_world.inverted() @ table.matrix_world.translation
    corners = chair.bound_box
    distances = [max(min(v[axis] for v in corners) - centre[axis], 0,
                     centre[axis] - max(v[axis] for v in corners)) for axis in (0, 1)]
    clearance = math.hypot(*distances) - .41
    check(name + " clears round table", clearance > .03, {"envelopeClearanceMetres": clearance})
check("lounge chairs clear each other", not overlap(meshes["lounge_armchair_0"], meshes["lounge_armchair_1"]), None)
check("lounge is ahead of first column", max(meshes[n][1][1] for n in
      ["lounge_armchair_0", "lounge_armchair_1", "lounge_table"]) < 4.8, None)
for name in ("balcony_reading_bench", "balcony_book_storage"):
    box = meshes[name]
    check(name + " is supported by south floor strip", box[2][0] >= 3.399 and box[1][0] > .07 and box[1][1] < 2.7, box)
    check(name + " clears staircase width", box[0][0] > 1.55, box)
check("balcony bench clears cabinet", not overlap(meshes["balcony_reading_bench"], meshes["balcony_book_storage"]), None)
for prefix, room in (("deputy_north_", (7.6, 12.6, 4, 10, 3.4)),
                     ("owner_front_art", (0, 7, 11, 16.925, 3.4))):
    props = {name: box for name, box in meshes.items() if name.startswith(prefix)}
    check(prefix + " wall composition exists", len(props) >= (6 if prefix == "deputy_north_" else 2), list(props))
    x0, x1, y0, y1, floor = room
    for name, box in props.items():
        check(name + " stays within room", box[0][0] > x0 and box[0][1] < x1 and
              box[1][0] > y0 and box[1][1] < y1 and box[2][0] > floor + .8, box)
        obstacles = [other for other in meshes if
                     other.startswith("monitor_") or other.endswith("_plant") or
                     other in ("deputy_tall_storage", "owner_east_storage", "owner_built_in")]
        hits = [other for other in obstacles if overlap(box, meshes[other])]
        check(name + " clears furniture and foliage", not hits, hits)
check("leader front-right door exists", "leader_glass_s_door" in bpy.data.objects and "leader_glass_w_door" not in bpy.data.objects, None)
door = bpy.data.objects.get("leader_glass_s_door")
check("leader door hinge matches route", door is not None and abs(door.location.x - 20.1) < .001 and abs(door.location.y - 10.5) < .001, list(door.location) if door else None)
check("outside props and ground removed", all(n not in meshes for n in ("ground", "exterior_blocks", "exterior_low_borders", "exterior_park_backdrop")), None)
city = bpy.data.objects.get("exterior_city_backdrop")
centre = Vector((10.75, 8.5, 1.75))
check("city image encloses all directions", city is not None and all(abs((city.matrix_world @ v.co - centre).length - 1000) < .1 for v in city.data.vertices), None)
check("city image sphere geometry budget", city is not None and len(city.data.polygons) == 2048 and len(city.data.vertices) == 2145, {"faces": len(city.data.polygons), "vertices": len(city.data.vertices)} if city else None)
check("city image full UVs preserved", city is not None and all(0 <= loop.uv.x <= 1 and 0 <= loop.uv.y <= 1 for loop in city.data.uv_layers.active.data), None)
check("wall finishes distinguish rooms", bpy.data.objects["owner_wall_e"].data.materials[0].name == "wall_sand" and bpy.data.objects["deputy_wall_n"].data.materials[0].name == "wall_sage_greige", None)
out = sys.argv[sys.argv.index("--") + 1]
report = {"method": "world-space AABB separation of critical props; not an exhaustive mesh intersection proof",
          "passed": all(c["passed"] for c in checks), "checks": checks,
          "cameraObstacles": {name: box for name, box in meshes.items()
                              if "plant" in name or "lamp" in name or "storage" in name}}
with open(out, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print(json.dumps(report))

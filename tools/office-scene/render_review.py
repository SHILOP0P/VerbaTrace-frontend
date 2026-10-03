"""Render interior views from the real authored model; these are not AI concept images."""
import bpy
import os
import sys
from mathutils import Vector

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = sys.argv[sys.argv.index("--") + 1]
if not os.path.isabs(out):
    out = os.path.join(root, out)
only = sys.argv[sys.argv.index("--") + 2:]
os.makedirs(out, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 8
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 960, 600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
for obj in scene.objects:
    if obj.type != "MESH" or not obj.name.startswith("screen_"):
        continue
    role = "employee"
    for candidate in ("leader", "owner", "deputy"):
        if candidate in obj.name:
            role = candidate
    mat = bpy.data.materials.get("review_screen_" + role)
    if mat is None:
        mat = bpy.data.materials.new("review_screen_" + role)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        emission = nodes.new("ShaderNodeEmission")
        image = nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(os.path.join(root, "public/assets/scene/screens", role + "-dark.jpg"))
        mat.node_tree.links.new(image.outputs["Color"], emission.inputs["Color"])
        mat.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)

views = [
    ("hall", (.6, .6, 2.35), (13, 11, .6), 20),
    ("leader", (16.7, 12.2, 1.65), (19.55, 14.9, 1.05), 20),
    ("owner", (1.0, 11.9, 5.05), (4.8, 15.2, 4.55), 20),
    ("deputy", (8.0, 5.45, 5.05), (10.5, 7.9, 4.45), 20),
    ("balcony", (1.75, 3.45, 5.1), (4.35, .65, 4.40), 23),
]
camera = bpy.data.objects["cam_hero_wide"]
scene.camera = camera
camera.data.clip_end = 1700
for name, position, target, lens in views:
    if only and name not in only:
        continue
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = lens
    scene.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)

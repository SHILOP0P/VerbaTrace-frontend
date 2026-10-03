"""Import the saved figure; preserve rig/clips and simplify only distant tiers."""
import argparse
import json
import os
import sys
import struct
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args(argv)
os.makedirs(args.out, exist_ok=True)
report = []
for tier, ratio in (('mid', .28), ('far', .10)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.source))
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new('Distance silhouette', 'DECIMATE')
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Distant clothing colours live in one vertex-colour primitive, instead
        # of six material primitives (six draws for every person).
        mesh = obj.data
        if not mesh.materials:
            # Blender's glTF importer may add a material-less auxiliary mesh.
            # Keep its existing appearance; it cannot be packed into a palette.
            continue
        for attribute in list(mesh.color_attributes):
            mesh.color_attributes.remove(attribute)
        colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        mesh.color_attributes.active_color = colors
        palette = []
        for material in mesh.materials:
            shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            palette.append(tuple(shader.inputs['Base Color'].default_value))
        for polygon in mesh.polygons:
            for index in polygon.loop_indices:
                colors.data[index].color = palette[polygon.material_index]
            polygon.material_index = 0
        mesh.materials.clear()
        material = bpy.data.materials.new('figure_vertex_palette')
        material.use_nodes = True
        shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Roughness'].default_value = .72
        vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'Color'
        material.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
        mesh.materials.append(material)
    # Importer restores glTF animations into NLA tracks; preserve their names.
    path = os.path.join(os.path.abspath(args.out), 'figure-' + tier + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_skins=True, export_morph=False,
        export_cameras=False, export_lights=False, export_image_format='NONE',
        export_draco_mesh_compression_enable=False)
    data = open(path, 'rb').read()
    length = int.from_bytes(data[12:16], 'little')
    gltf = json.loads(data[20:20 + length])
    # Blender may reserve a white COLOR_0 and export the authored palette as
    # COLOR_1. glTF PBR uses COLOR_0, so make the palette the primary colour.
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            if 'COLOR_1' in attributes:
                attributes['COLOR_0'] = attributes.pop('COLOR_1')
    for material in gltf.get('materials', []):
        if material.get('name') == 'figure_vertex_palette':
            material['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]
    encoded = json.dumps(gltf, separators=(',', ':')).encode('utf8')
    encoded += b' ' * (-len(encoded) % 4)
    binary_chunks = data[20 + length:]
    data = struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(binary_chunks)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + binary_chunks
    with open(path, 'wb') as handle:
        handle.write(data)
    tris = sum(gltf['accessors'][p['indices']]['count'] // 3 for m in gltf['meshes'] for p in m['primitives'])
    report.append({'tier': tier, 'ratio': ratio, 'triangles': tris, 'bytes': len(data),
                   'animations': [a.get('name') for a in gltf.get('animations', [])]})
print(json.dumps(report))
with open(os.path.join(args.out, 'figure-lods.json'), 'w') as handle:
    json.dump(report, handle, indent=2)

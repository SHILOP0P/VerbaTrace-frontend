"""Export conservative connected-component bounds, in Three.js world metres.

Each box/cylinder/leaf is kept separate: a whole room's bounding box is not a
collider. Furniture interiors remain conservative; routing never uses them.
"""
import bpy, json, sys
from mathutils import Vector

bpy.context.view_layer.update()
boxes = []
names = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or obj.name.startswith(('floor', 'ground', 'exterior_', 'ceiling_joints', 'perimeter_skirting')):
        continue
    mesh = obj.data
    parents = list(range(len(mesh.vertices)))
    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    for edge in mesh.edges:
        a, b = edge.vertices
        parents[root(a)] = root(b)
    groups = {}
    for v in mesh.vertices:
        groups.setdefault(root(v.index), []).append(obj.matrix_world @ v.co)
    index = len(names)
    names.append(obj.name)
    for points in groups.values():
        lo = [min(p[a] for p in points) for a in range(3)]
        hi = [max(p[a] for p in points) for a in range(3)]
        # Z-up to Y-up. Millimetre padding covers rounded export coordinates.
        box = [lo[0]-.001, lo[2]-.001, -hi[1]-.001, hi[0]+.001, hi[2]+.001, -lo[1]+.001]
        if box[4] < .4 or box[1] > 6.5:
            continue
        boxes.append([*[round(v, 4) for v in box], index])
    if any(word in obj.name for word in ('plant', 'lamp', 'storage')):
        # Do not thread the lens between leaves, lamp arms or cabinet parts.
        # Reserve the whole silhouette as well as its individual primitives.
        points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        lo = [min(p[a] for p in points) for a in range(3)]
        hi = [max(p[a] for p in points) for a in range(3)]
        boxes.append([round(v, 4) for v in [lo[0]-.001,lo[2]-.001,-hi[1]-.001,hi[0]+.001,hi[2]+.001,-lo[1]+.001]]+[index])
out = sys.argv[sys.argv.index('--')+1]
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'schema': 1, 'radius': .28, 'names': names, 'boxes': boxes}, f, separators=(',', ':'))
print('Navigation:', len(boxes), 'component bounds;', out)

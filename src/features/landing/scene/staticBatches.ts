import { BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Material, Matrix4, Mesh, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Fixed visibility cells keep glass views and both sides of the atrium open. */
function cell(mesh: Mesh, center: Vector3) {
  const name = mesh.name;
  // Opaque furniture with the same material shares a draw within a floor.
  // Glass retains room sorting; merging it across rooms changes compositing.
  if (mesh.material && !Array.isArray(mesh.material) && mesh.material.transparent) {
    if (name.startsWith("owner_")) return "owner-glass";
    if (name.startsWith("deputy_")) return "deputy-glass";
    if (name.startsWith("leader_")) return "leader-glass";
  }
  return center.y > 3.2 ? "upper-shell" : "lower-shell";
}

/** Compatible attribute layouts only: UV1, colours and tangents survive. */
function layout(geometry: BufferGeometry) {
  return Object.keys(geometry.attributes).sort().map((key) => {
    const attr = geometry.attributes[key];
    return `${key}:${attr.itemSize}:${attr.normalized}:${attr.array.constructor.name}`;
  }).join("|");
}

/** Build once under the loader; anchors and mobile monitor frames stay intact. */
export function batchStatics(root: Group) {
  const regions = new Map<string, { material: Material; meshes: Mesh[] }>();
  const center = new Vector3();
  const inverseRoot = new Matrix4();
  root.updateMatrixWorld(true);
  inverseRoot.copy(root.matrixWorld).invert();
  root.traverse((object) => {
    const mesh = object as Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || !mesh.visible ||
        mesh.userData.responsiveMonitor || Array.isArray(mesh.material) || mesh.morphTargetInfluences?.length) return;
    mesh.getWorldPosition(center);
    const key = `${cell(mesh, center)}:${mesh.material.uuid}:${layout(mesh.geometry)}`;
    const group = regions.get(key);
    if (group) group.meshes.push(mesh);
    else regions.set(key, { material: mesh.material, meshes: [mesh] });
  });

  const created: Mesh[] = [];
  const hidden: Mesh[] = [];
  for (const [key, { material, meshes }] of regions) {
    if (meshes.length < 2) continue;
    // Reuse buffers for repeated props. Transparent glass remains sorted by cell.
    const repeats = new Map<BufferGeometry, Mesh[]>();
    if (!material.transparent) for (const mesh of meshes) {
      const found = repeats.get(mesh.geometry);
      if (found) found.push(mesh);
      else repeats.set(mesh.geometry, [mesh]);
    }
    const consumed = new Set<Mesh>();
    for (const [geometry, instances] of repeats) {
      if (instances.length < 4) continue;
      const batch = new InstancedMesh(geometry, material, instances.length);
      batch.name = `instances_${key.split(":")[0]}_${material.name}`;
      instances.forEach((mesh, index) => {
        batch.setMatrixAt(index, new Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
        consumed.add(mesh);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      batch.matrixAutoUpdate = false;
      batch.userData.batch = true;
      root.add(batch);
      created.push(batch);
    }
    const unique = meshes.filter((mesh) => !consumed.has(mesh));
    if (unique.length >= 2) {
      const parts = unique.map((mesh) => {
        const geometry = mesh.geometry.clone();
        // Meshopt quantization stores local positions in normalized integers.
        // A world transform can exceed [-1,1]; writing it into that buffer would
        // silently wrap. Decode positions before welding in world coordinates.
        const position = geometry.getAttribute("position");
        if (!(position.array instanceof Float32Array)) {
          const values = new Float32Array(position.count * 3);
          for (let i = 0; i < position.count; i += 1) {
            values[i * 3] = position.getX(i);
            values[i * 3 + 1] = position.getY(i);
            values[i * 3 + 2] = position.getZ(i);
          }
          geometry.setAttribute("position", new Float32BufferAttribute(values, 3));
        }
        geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
        if (!geometry.index) return geometry;
        const expanded = geometry.toNonIndexed();
        geometry.dispose();
        return expanded;
      });
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (geometry) {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const batch = new Mesh(geometry, material);
        batch.name = `static_${key.split(":")[0]}_${material.name}`;
        batch.matrixAutoUpdate = false;
        batch.userData.batch = true;
        root.add(batch);
        created.push(batch);
        unique.forEach((mesh) => consumed.add(mesh));
      }
    }
    for (const mesh of consumed) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
  return () => {
    for (const mesh of created) {
      root.remove(mesh);
      if (mesh instanceof InstancedMesh) mesh.dispose();
      else mesh.geometry.dispose();
    }
    hidden.forEach((mesh) => { mesh.visible = true; });
  };
}

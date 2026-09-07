import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* Only explicitly nominated rigid assemblies belong here. Originals remain in
   their hierarchy: the station's raycaster, bounds, and object registry still
   address the same objects. Excluded subtrees keep their own rendering and
   animation. Each visual batch belongs to its original assembly, so delayed
   warm-up and parent visibility continue to work. */
export function batchStationStatic(assemblies) {
  const stats = { candidateMeshes: 0, mergedMeshes: 0, batches: 0, drawCallsSaved: 0, groups: [] };
  const relative = new THREE.Matrix4();

  for (const entry of assemblies) {
    const root = entry.root || entry;
    const excluded = new Set(entry.exclude || []);
    const buckets = new Map();
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();

    const visit = (object) => {
      if (excluded.has(object) || (object !== root && !object.visible)) return;
      if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh) {
        const material = object.material;
        const geometry = object.geometry;
        const eligible = object.children.length === 0 && material && !Array.isArray(material) && !material.transparent &&
          material.opacity === 1 && !material.transmission && material.visible &&
          geometry?.attributes.position && geometry.drawRange.start === 0 &&
          geometry.drawRange.count === Infinity &&
          !Object.values(geometry.morphAttributes).some((attributes) => attributes.length) &&
          !object.customDepthMaterial && !object.customDistanceMaterial &&
          object.onBeforeRender === THREE.Object3D.prototype.onBeforeRender;
        if (eligible) {
          relative.multiplyMatrices(inverse, object.matrixWorld);
          // A mirrored transform needs winding repair; leave it untouched.
          if (relative.determinant() > 0) {
            const attributes = Object.entries(geometry.attributes)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`)
              .join('|');
            const key = [material.id, +object.castShadow, +object.receiveShadow,
              object.layers.mask, object.renderOrder, attributes].join('/');
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(object);
            stats.candidateMeshes++;
          }
        }
      }
      for (const child of object.children) visit(child);
    };
    visit(root);

    let inputs = 0, batches = 0;
    for (const sources of buckets.values()) {
      if (sources.length < 2) continue;
      const geometries = sources.map((source) => {
        const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
        geometry.clearGroups();
        geometry.applyMatrix4(relative.multiplyMatrices(inverse, source.matrixWorld));
        return geometry;
      });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const source = sources[0];
      const display = new THREE.Mesh(merged, source.material);
      display.name = `station-static-${root.name || root.id}-${batches + 1}`;
      display.castShadow = source.castShadow;
      display.receiveShadow = source.receiveShadow;
      display.layers.mask = source.layers.mask;
      display.renderOrder = source.renderOrder;
      display.userData.stationBatch = { sourceCount: sources.length };
      display.raycast = () => {};
      root.add(display);
      for (const original of sources) {
        original.visible = false;
        original.matrixAutoUpdate = false;
        original.userData.stationBatchSource = true;
      }
      inputs += sources.length;
      batches++;
    }
    if (batches) stats.groups.push({ name: root.name || String(root.id), mergedMeshes: inputs, batches });
    stats.mergedMeshes += inputs;
    stats.batches += batches;
  }
  stats.drawCallsSaved = stats.mergedMeshes - stats.batches;
  return stats;
}

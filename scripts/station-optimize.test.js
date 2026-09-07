import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { batchStationStatic } from '../public/sanctuary-world/lab/station-optimize.js';

const box = (material, x = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  mesh.position.x = x;
  return mesh;
};

describe('station static batching preservation', () => {
  test('keeps original pick identities and transformed world bounds', () => {
    const root = new THREE.Group();
    root.position.set(2, 1, -3);
    root.rotation.y = 0.65;
    root.scale.setScalar(0.6);
    root.userData.pickId = 'reels';
    const material = new THREE.MeshStandardMaterial();
    const a = box(material), b = box(material, 1);
    a.name = 'original-hit-target';
    root.add(a, b);
    const before = new THREE.Box3().setFromObject(root);
    const stats = batchStationStatic([root]);
    const after = new THREE.Box3().setFromObject(root);
    expect(stats.drawCallsSaved).toBe(1);
    expect(before.min.distanceTo(after.min)).toBeLessThan(1e-6);
    expect(before.max.distanceTo(after.max)).toBeLessThan(1e-6);
    expect(a.parent).toBe(root);
    expect(a.visible).toBe(false);

    // Three's raycaster intentionally still intersects hidden source meshes.
    const centre = a.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Raycaster(centre.clone().add(new THREE.Vector3(0, 0, 4)), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(root, true);
    expect(hits.some((hit) => hit.object === a)).toBe(true);
    expect(hits.every((hit) => !hit.object.userData.stationBatch)).toBe(true);
  });

  test('retains excluded moving parts and deferred parent visibility', () => {
    const root = new THREE.Group();
    root.visible = false; // The console is warmed after the initial room frame.
    const material = new THREE.MeshStandardMaterial();
    const fixedA = box(material), fixedB = box(material, 1);
    const moving = new THREE.Group();
    const needle = box(material, 2);
    moving.add(needle);
    root.add(fixedA, fixedB, moving);
    const stats = batchStationStatic([{ root, exclude: [moving] }]);
    expect(stats.mergedMeshes).toBe(2);
    expect(root.visible).toBe(false);
    expect(needle.visible).toBe(true);
    expect(needle.matrixAutoUpdate).toBe(true);
    moving.rotation.y = 0.5;
    root.visible = true;
    root.updateMatrixWorld(true);
    expect(moving.rotation.y).toBe(0.5);
  });

  test('keeps transparency, transmission, and distinct shadow settings separate', () => {
    const root = new THREE.Group();
    const opaque = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 });
    const castA = box(opaque), castB = box(opaque, 1);
    castA.castShadow = castB.castShadow = true;
    const noCast = box(opaque, 2), paneA = box(glass, 3), paneB = box(glass, 4);
    const glowA = box(glow, 5), glowB = box(glow, 6);
    root.add(castA, castB, noCast, paneA, paneB, glowA, glowB);
    const stats = batchStationStatic([root]);
    expect(stats.batches).toBe(1);
    expect(root.children.find((child) => child.userData.stationBatch).castShadow).toBe(true);
    [noCast, paneA, paneB, glowA, glowB].forEach((mesh) => expect(mesh.visible).toBe(true));
  });
});

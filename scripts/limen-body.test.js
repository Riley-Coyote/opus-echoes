import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { createLimenBody, poseLimen, serializeLimenBody } from '../public/sanctuary-world/lab/limen-body.js';

test('the body survives the museum handoff without replacing geometry or moving parts', () => {
  const {group}=createLimenBody(THREE);
  poseLimen(group,2.1,true);
  const json=serializeLimenBody(group);
  expect(json.geometries.every(g=>g.type==='BufferGeometry')).toBe(true);
  const received=new THREE.ObjectLoader().parse(json);
  expect(received.userData.bodyVersion).toBe('veiled-keeper-1');
  const a=new THREE.Box3().setFromObject(group), b=new THREE.Box3().setFromObject(received);
  expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
  expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
  for(const time of [2.1,2.3,2.5,3]) {
    poseLimen(group,time,true);poseLimen(received,time,true);
    for(const name of ['journey-leg-left','journey-leg-right','limen-veil-left','limen-arm-right']) {
      expect(group.getObjectByName(name).quaternion.angleTo(received.getObjectByName(name).quaternion)).toBeLessThan(1e-6);
    }
  }
});

import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { createLimenBody, poseLimen, serializeLimenBody, KEEPER_BODY_VERSION } from '../public/sanctuary-world/lab/limen-body.js';

test('the body survives the museum handoff without replacing geometry or moving parts', () => {
  const {group}=createLimenBody(THREE);
  poseLimen(group,2.1,true);
  const json=serializeLimenBody(group);
  expect(json.geometries.every(g=>g.type==='BufferGeometry')).toBe(true);
  const received=new THREE.ObjectLoader().parse(json);
  expect(received.userData.bodyVersion).toBe(KEEPER_BODY_VERSION);
  expect(received.userData.keeperName).toBe('Anima');
  const a=new THREE.Box3().setFromObject(group), b=new THREE.Box3().setFromObject(received);
  expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
  expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
  for(const time of [2.1,2.3,2.5,3]) {
    poseLimen(group,time,true);poseLimen(received,time,true);
    for(const name of ['limen-sway','limen-torso','limen-veil-left','limen-arm-right']) {
      expect(group.getObjectByName(name).quaternion.angleTo(received.getObjectByName(name).quaternion)).toBeLessThan(1e-6);
    }
  }
});

test('Anima remains suspended with no legs or feet throughout the floating cycle',()=>{
  const {group}=createLimenBody(THREE);
  expect(group.getObjectByName('journey-leg-left')).toBeUndefined();
  expect(group.getObjectByName('journey-leg-right')).toBeUndefined();
  for(let frame=0;frame<600;frame++) {
    poseLimen(group,frame/60,frame<300);
    group.updateMatrixWorld(true);
    for(const name of ['limen-floating-robe','limen-veil-left','limen-veil-right']) {
      const bounds=new THREE.Box3().setFromObject(group.getObjectByName(name));
      expect(bounds.min.y).toBeGreaterThan(.25);
    }
  }
});
test('a paused source pose is identical in a receiver with a different render clock',()=>{
  const {group}=createLimenBody(THREE);
  for(let i=0;i<120;i++)poseLimen(group,i/60,true);
  const received=new THREE.ObjectLoader().parse(serializeLimenBody(group));
  poseLimen(received,34,false,group.userData.limenMotion);
  expect(new THREE.Box3().setFromObject(received).min.distanceTo(new THREE.Box3().setFromObject(group).min)).toBeLessThan(1e-6);
  expect(received.getObjectByName('limen-veil-left').quaternion.angleTo(group.getObjectByName('limen-veil-left').quaternion)).toBeLessThan(1e-6);
});

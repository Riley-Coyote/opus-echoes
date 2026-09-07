import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { createStationJourney } from '../public/sanctuary-world/lab/station-journey.js';
import { createFloorNavigation } from '../public/sanctuary-world/lab/station-navigation.js';

/* WP-46's corrected floor: no pit, the desk forward at the eye, the credenza
   flat against the machine wall. The room passes the same planner to the
   journey, so the fixture does too. */
const FURNITURE = {
  desk: { x0: -3.006, x1: -1.194, z0: 0.842, z1: 1.776 },
  credenza: { x0: 3.495, x1: 4.246, z0: -2.34, z1: -0.76 },
};
const floor = createFloorNavigation({
  bounds: { x0: -5, x1: 5, z0: -3.25, z1: 3.25 },
  obstacles: [
    { id: 'planter ledge', x0: -5, x1: -4.45, z0: -1.1, z1: 2.5 },
    { id: 'aperture step', x0: -4.25, x1: -0.95, z0: -3.25, z1: -2.42 },
    { id: 'credenza', ...FURNITURE.credenza },
    { id: 'desk', ...FURNITURE.desk },
    { id: 'chair', x0: -1.689, x1: -1.021, z0: -0.015, z1: 0.659 },
    { id: 'console chair', x0: 2.098, x1: 2.634, z0: -2.312, z1: -1.738 },
    { id: 'tree planter', x0: -4.86, x1: -4.34, z0: -2.36, z1: -1.84 },
    { id: 'corner plant', x0: 3.664, x1: 4.016, z0: -0.308, z1: 0.048 },
    { id: 'back run', x0: -0.2, x1: 4.9, z0: -3.25, z1: -2.65 },
    { id: 'right run', x0: 4.3, x1: 5, z0: -3.25, z1: 0.7 },
  ],
});
/* clear of a footprint by the guide's own body radius */
const clearOf = (p, f) => !(p.x > f.x0 - 0.3 && p.x < f.x1 + 0.3 && p.z > f.z0 - 0.3 && p.z < f.z1 + 0.3);
class Element {
  constructor(){this.dataset={};this.children=new Map();this.classList={add(){},remove(){}};}
  setAttribute(){} append(){} querySelector(s){if(!this.children.has(s))this.children.set(s,new Element());return this.children.get(s);}
}
/* the corrected WP-46 landing pose, and the guide at its home post */
function fixture(cross=async()=>{},position=[-3.10,1.40,2.70]){
  globalThis.document={createElement:()=>new Element(),body:new Element(),head:new Element(),hidden:false,addEventListener(){}};
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera();camera.position.set(...position);
  const group=new THREE.Group();group.position.set(3.05,0,-2.20);
  const origin=camera.position.clone();let restorations=0;
  const controller=createStationJourney({THREE,scene,camera,guide:{group,walkPose(){}},planGuideRoute:(a,b)=>floor.route(a,b),prepare:()=>({pos:origin.clone(),quaternion:camera.quaternion.clone()}),restore(saved){restorations++;camera.position.copy(saved.pos);camera.quaternion.copy(saved.quaternion);},cross,directReturn(){}});
  return {controller,camera,group,origin,get restorations(){return restorations;}};
}
async function advance(f,condition,seconds=60){for(let i=0;i<seconds*60;i++){f.controller.tick(i/60,1/60);await Promise.resolve();if(condition())return;}throw Error('Journey did not reach expected state');}
test('a complete walked round trip restores the source view exactly once',async()=>{
  const f=fixture();await f.controller.start();await advance(f,()=>f.controller.state.phase==='away');
  f.controller.returnFromMuseum();await advance(f,()=>f.controller.state.phase==='idle');
  expect(f.camera.position.distanceTo(f.origin)).toBeLessThan(1e-6);expect(f.restorations).toBe(1);
});
test('both computer views withdraw around the furniture and retrace the same safe approach',async()=>{
  /* the two seats the corrected room actually puts you in */
  for(const position of [[-2.925,1.084,2.228],[2.45,1.355,-2.116]]){
    const f=fixture(async()=>{},position);await f.controller.start();
    const check=()=>{const p=f.camera.position;expect(clearOf(p,FURNITURE.desk)).toBe(true);expect(clearOf(p,FURNITURE.credenza)).toBe(true);};
    for(let i=0;i<3600&&f.controller.state.phase!=='away';i++){f.controller.tick(i/60,1/60);await Promise.resolve();check();}
    expect(f.controller.state.phase).toBe('away');f.controller.returnFromMuseum();
    for(let i=0;i<3600&&f.controller.state.phase!=='idle';i++){f.controller.tick(i/60,1/60);await Promise.resolve();check();}
    expect(f.controller.state.phase).toBe('idle');expect(f.camera.position.distanceTo(f.origin)).toBeLessThan(1e-6);
  }
});
test('pause retains route position and progress; resume completes it',async()=>{
  const f=fixture();await f.controller.start();await advance(f,()=>f.controller.state.phase==='traveling'&&f.controller.state.progress>.3);
  f.controller.pause();const pose=f.camera.position.clone(),progress=f.controller.state.progress;
  for(let i=0;i<240;i++)f.controller.tick(i/60,1/60);
  expect(f.camera.position.distanceTo(pose)).toBe(0);expect(f.controller.state.progress).toBe(progress);
  f.controller.pause();await advance(f,()=>f.controller.state.phase==='away');
});
test('a cancelled pending crossing cannot reopen the visit',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r));f.controller.start(true);await Promise.resolve();
  f.controller.cancel();resolve();await Promise.resolve();await Promise.resolve();
  expect(f.controller.state.phase).toBe('idle');expect(f.restorations).toBe(1);
});
test('failed preparation stays recoverable in the original room',async()=>{
  const f=fixture(async()=>{throw Error('Receiver unavailable');});await f.controller.start(true);
  expect(f.controller.state.phase).toBe('waiting');f.controller.cancel();expect(f.restorations).toBe(1);expect(f.controller.state.phase).toBe('idle');
});
test('camera and guide avoid the desk and the record credenza throughout departure',async()=>{
  const f=fixture();await f.controller.start();
  for(let i=0;i<3000&&f.controller.state.phase!=='away';i++){
    f.controller.tick(i/60,1/60);await Promise.resolve();
    for(const p of [f.camera.position,f.group.position]) {
      expect(clearOf(p,FURNITURE.desk)).toBe(true);
      expect(clearOf(p,FURNITURE.credenza)).toBe(true);
      if(p.z>3.25&&p.z<5.55)expect(p.x>1.55&&p.x<3.85).toBe(true);
    }
  }
  expect(f.controller.state.phase).toBe('away');
});

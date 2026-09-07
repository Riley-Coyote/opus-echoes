import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { createStationJourney } from '../public/sanctuary-world/lab/station-journey.js';
class Element {
  constructor(){this.dataset={};this.children=new Map();this.classList={add(){},remove(){}};}
  setAttribute(){} append(){} querySelector(s){if(!this.children.has(s))this.children.set(s,new Element());return this.children.get(s);}
}
function fixture(cross=async()=>{},position=[-3.6,1.72,3.05]){
  globalThis.document={createElement:()=>new Element(),body:new Element(),head:new Element(),hidden:false,addEventListener(){}};
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera();camera.position.set(...position);
  const group=new THREE.Group();group.position.set(-3.85,0,-2.05);
  const origin=camera.position.clone();let restorations=0;
  const controller=createStationJourney({THREE,scene,camera,guide:{group,walkPose(){}},prepare:()=>({pos:origin.clone(),quaternion:camera.quaternion.clone()}),restore(saved){restorations++;camera.position.copy(saved.pos);camera.quaternion.copy(saved.quaternion);},cross,directReturn(){}});
  return {controller,camera,group,origin,get restorations(){return restorations;}};
}
async function advance(f,condition,seconds=60){for(let i=0;i<seconds*60;i++){f.controller.tick(i/60,1/60);await Promise.resolve();if(condition())return;}throw Error('Journey did not reach expected state');}
test('a complete walked round trip restores the source view exactly once',async()=>{
  const f=fixture();await f.controller.start();await advance(f,()=>f.controller.state.phase==='away');
  f.controller.returnFromMuseum();await advance(f,()=>f.controller.state.phase==='idle');
  expect(f.camera.position.distanceTo(f.origin)).toBeLessThan(1e-6);expect(f.restorations).toBe(1);
});
test('both computer views withdraw around the lounge and retrace the same safe approach',async()=>{
  for(const position of [[.868,1.084,.685],[2.45,1.274,-2.734]]){
    const f=fixture(async()=>{},position);await f.controller.start();
    const check=()=>{const p=f.camera.position;expect(p.x>-4.2&&p.x<-.8&&p.z>-.25&&p.z<2.15).toBe(false);if(p.z>-.4&&p.z<.4)expect(p.x>2.58).toBe(true);};
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
test('camera and guide avoid the lounge pit and record credenza throughout departure',async()=>{
  const f=fixture();await f.controller.start();
  for(let i=0;i<3000&&f.controller.state.phase!=='away';i++){
    f.controller.tick(i/60,1/60);await Promise.resolve();
    for(const p of [f.camera.position,f.group.position]) {
      expect(p.x>-4.2&&p.x<-.8&&p.z>-.25&&p.z<2.15).toBe(false);
      expect(p.x>-4.55&&p.x<-.65&&p.z>-1.1&&p.z<-.43).toBe(false);
      if(p.z>3.25&&p.z<5.55)expect(p.x>1.55&&p.x<3.85).toBe(true);
    }
  }
  expect(f.controller.state.phase).toBe('away');
});

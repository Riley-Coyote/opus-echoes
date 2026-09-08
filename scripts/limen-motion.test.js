import {test,expect} from 'bun:test';
import * as T from 'three';
import {createLimenBody,poseLimen,serializeLimenBody,limenDiagnostics} from '../public/sanctuary-world/lab/limen-body.js';
import {mapLimenMotion} from '../public/sanctuary-world/lab/limen-motion.js';

function sample(group,t) {
  group.position.set(Math.sin(t*.4)*1.2,0,t);
  group.rotation.y=Math.atan2(.48*Math.cos(t*.4),1);
  poseLimen(group,t,true,undefined,{gazeYaw:.25,gazePitch:.04,attention:'path'});
}
function nearArrays(a,b,tolerance=1e-6) {
  expect(a.length).toBe(b.length);
  let error=0;for(let i=0;i<a.length;i++)error=Math.max(error,Math.abs(a[i]-b[i]));
  expect(error).toBeLessThan(tolerance);
}

test('cloth deformation and momentum survive a half-turn handoff with one owner',()=>{
  const source=createLimenBody(T).group;
  for(let f=0;f<=180;f++)sample(source,f/60);
  const receiver=new T.ObjectLoader().parse(serializeLimenBody(source));
  const mapped=mapLimenMotion(source.userData.limenMotion);
  receiver.position.fromArray(mapped.root);receiver.rotation.set(0,mapped.root[3],0);
  poseLimen(receiver,55,true,mapped);
  for(const name of ['limen-floating-robe','limen-veil-left','limen-veil-right'])
    nearArrays(source.getObjectByName(name).geometry.attributes.position.array,receiver.getObjectByName(name).geometry.attributes.position.array);
  const before=source.userData.limenMotion.steps;
  // Receiver paints another preview without advancing the source simulation.
  poseLimen(receiver,56,true,mapped);
  expect(source.userData.limenMotion.steps).toBe(before);
  sample(source,181/60);
  const next=mapLimenMotion(source.userData.limenMotion);
  receiver.position.fromArray(next.root);receiver.rotation.set(0,next.root[3],0);
  poseLimen(receiver,181/60,true,undefined,{gazeYaw:.25,gazePitch:.04,attention:'path'});
  expect(source.userData.limenMotion.steps).toBe(before+1);
  expect(receiver.userData.limenMotion.steps).toBe(before+1);
  nearArrays(source.userData.limenMotion.pose,receiver.userData.limenMotion.pose);
  for(let i=0;i<3;i++)nearArrays(source.userData.limenMotion.cloth[i].position,receiver.userData.limenMotion.cloth[i].position);
  expect(receiver.userData.limenMotion.cloth[0].position).not.toBe(source.userData.limenMotion.cloth[0].position);
});

test('30, 60, and 120 Hz rendering integrate the same straight flight',()=>{
  const results=[30,60,120].map(hz=>{
    const body=createLimenBody(T).group;
    for(let f=0;f<=hz*4;f++){
      body.position.z=f/hz;
      poseLimen(body,f/hz,true,undefined,{gazeYaw:.3,gazePitch:.03});
    }
    return body.userData.limenMotion;
  });
  for(const other of results.slice(1)){
    expect(other.steps).toBe(240);
    nearArrays(results[0].pose,other.pose);
    for(let i=0;i<3;i++)nearArrays(results[0].cloth[i].position,other.cloth[i].position);
  }
});

test('a stopped guide settles, keeps floor clearance, and acknowledges a held target',()=>{
  const body=createLimenBody(T).group;
  for(let f=0;f<=180;f++){body.position.z=f/60*1.4;poseLimen(body,f/60,true);}
  expect(limenDiagnostics(body).deformation).toBeGreaterThan(.01);
  let brakingEnergy=0;
  for(let f=181;f<=540;f++){
    poseLimen(body,f/60,false,undefined,{gazeYaw:.8,gazePitch:.04,attention:'visitor'});
    if(f<210)brakingEnergy=Math.max(brakingEnergy,limenDiagnostics(body).energy);
  }
  const d=limenDiagnostics(body);
  expect(d.energy).toBeLessThan(brakingEnergy*.03);
  expect(d.glide).toBeLessThan(.001);
  expect(body.getObjectByName('limen-head').rotation.y).toBeGreaterThan(.5);
  expect(body.userData.limenMotion.attention).toBe('visitor');
  for(const name of ['limen-floating-robe','limen-veil-left','limen-veil-right'])
    expect(new T.Box3().setFromObject(body.getObjectByName(name)).min.y).toBeGreaterThan(.25);
});

test('suspension, direct relocation, and reduced motion keep finite bounded state',()=>{
  const body=createLimenBody(T).group;
  for(let f=0;f<=60;f++)sample(body,f/60);
  const steps=body.userData.limenMotion.steps;
  poseLimen(body,121,true);
  expect(body.userData.limenMotion.steps).toBe(steps);
  body.position.set(50,0,-30);
  poseLimen(body,121+1/60,true);
  expect(body.userData.limenMotion.velocity).toEqual([0,0,0]);
  poseLimen(body,121+2/60,false,undefined,{reduced:true});
  expect(body.userData.limenMotion.pose.every(v=>v===0)).toBe(true);
  for(const c of body.userData.limenMotion.cloth)expect(c.position.every(Number.isFinite)).toBe(true);
  expect(limenDiagnostics(body).deformation).toBe(0);
});

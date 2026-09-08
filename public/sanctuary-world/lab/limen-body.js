/* Limen's single authored body. All geometry is portable BufferGeometry, so the
 * station and museum retain the same silhouette across Three.js versions. */
export function createLimenBody(T) {
  const group = new T.Group(); group.name = 'Limen · veiled keeper';
  group.userData.bodyVersion = 'floating-keeper-2';
  const sway = new T.Group(); sway.name = 'limen-sway'; group.add(sway);
  const torso = new T.Group(); torso.name = 'limen-torso'; sway.add(torso);
  const porcelain = new T.MeshStandardMaterial({color:0xe5ded1,roughness:.64,metalness:.02});
  const linen = new T.MeshStandardMaterial({color:0xb9b2a7,roughness:.95});
  const mantle = new T.MeshStandardMaterial({color:0x55535a,roughness:.86,side:T.DoubleSide});
  const seam = new T.MeshStandardMaterial({color:0x9d8870,roughness:.6,metalness:.25});
  const eyeMat = new T.MeshStandardMaterial({color:0x29232a,emissive:0xe9bc84,emissiveIntensity:.45,roughness:.8});
  function mesh(geo,mat,parent,x=0,y=0,z=0) {
    // Strip constructor-specific serialization, including custom lathe forms.
    const portable = new T.BufferGeometry().copy(geo); geo.dispose();
    const m = new T.Mesh(portable,mat); m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function oval(parent,mat,x,y,z,sx,sy,sz) {const m=mesh(new T.SphereGeometry(1,24,20),mat,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
  // A continuous fluted robe closes in a suspended, swept hem. There is no
  // anatomy under the cloth: the open air beneath it is part of the silhouette.
  const profile=[[.018,.39],[.09,.44],[.155,.56],[.19,.75],[.16,.98],[.115,1.16],[.155,1.40],[.205,1.53],[.17,1.60],[.055,1.64]];
  const robeGeo=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),48);
  const rp=robeGeo.attributes.position;
  for(let i=0;i<rp.count;i++) {
    const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),a=Math.atan2(x,z);
    const lower=Math.max(0,Math.min(1,(1.2-y)/.81));
    const fold=1+.045*Math.sin(a*11)*Math.sin(Math.min(1,lower)*Math.PI*.7);
    rp.setXYZ(i,x*fold,y+.026*Math.sin(a*3)*lower,z*.72*fold-.085*lower*lower);
  }
  robeGeo.computeVertexNormals();
  const robe=mesh(robeGeo,linen,torso);robe.name='limen-floating-robe';
  // A split shoulder veil falls behind the hands. The face remains uncovered.
  for(const side of [-1,1]) {
    const vertices=[],indices=[],rows=24,cols=16;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const v=y/rows,u=x/cols;
      vertices.push(side*(.05+u*.20*(1-.44*v*v)+.018*Math.sin(v*Math.PI)),1.61-v*(1.27-.30*u)+.018*Math.sin(u*3*Math.PI)*v*v,-.055-.085*Math.sin(u*Math.PI)-.16*v*v+.018*Math.sin(u*5*Math.PI));
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();geo.translate(0,-1.61,0);
    const veil=mesh(geo,mantle,torso,0,1.61,0);veil.name=side<0?'limen-veil-left':'limen-veil-right';
    const arm=new T.Group();arm.name=side<0?'limen-arm-left':'limen-arm-right';arm.position.set(side*.20,1.5,0);torso.add(arm);
    oval(arm,linen,side*.025,-.24,0,.057,.30,.054);
    oval(arm,porcelain,side*.035,-.53,.02,.026,.102,.025);

  }
  const head=new T.Group();head.name='limen-head';head.position.y=1.66;torso.add(head);
  oval(head,linen,0,-.027,0,.039,.07,.035);
  // An elongated, unmarked porcelain mask and swept temples.
  oval(head,porcelain,0,.111,0,.093,.158,.079);
  for(const side of [-1,1]) {
    const temple=oval(head,porcelain,side*.09,.16,-.012,.021,.125,.034);temple.rotation.z=-side*.25;
  }
  const eyes=[];
  for(const side of [-1,1]) eyes.push(oval(head,eyeMat,side*.035,.127,.072,.019,.005,.006));
  const eye=eyes[0],eyeRing=eyes[1];
  // A small folded clasp, with no insignia or invented writing.
  const clasp=mesh(new T.OctahedronGeometry(.034),seam,torso,0,1.52,.125);clasp.scale.set(.5,1,.25);
  const eyeLight=new T.PointLight(0xe9bc84,.025,.35,2);eyeLight.position.set(0,.13,.15);head.add(eyeLight);
  // A quiet, soft ground shadow makes the air gap legible without a glowing
  // ring, particles or a second animation system.
  const shadow=mesh(new T.PlaneGeometry(.9,.68),new T.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{opacity:{value:.19}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;uniform float opacity;void main(){float r=length((vUv-.5)*2.);float a=pow(max(0.,1.-r*r),3.)*opacity;gl_FragColor=vec4(0.,0.,0.,a);}'
  }),group,0,.008,0);
  shadow.name='limen-ground-shadow';shadow.rotation.x=-Math.PI/2;shadow.castShadow=shadow.receiveShadow=false;
  const pick=mesh(new T.CylinderGeometry(.29,.29,1.96,8),new T.MeshBasicMaterial(),group,0,.98,0);pick.visible=false;pick.name='limen-pick';
  return {group,sway,torso,head,eye,eyeRing,eyeMat,eyeLight,P:{eye:.127,skull:.111}};
}
const rigs=new WeakMap();
function rigFor(group) {
  let rig=rigs.get(group);
  if(!rig) {
    rig={sway:group.getObjectByName('limen-sway'),torso:group.getObjectByName('limen-torso'),shadow:group.getObjectByName('limen-ground-shadow'),
      arms:['left','right'].map(side=>group.getObjectByName('limen-arm-'+side)),veils:['left','right'].map(side=>group.getObjectByName('limen-veil-'+side))};
    rigs.set(group,rig);
  }
  return rig;
}
// The motion state travels with the body. The receiver applies exactly the
// same phase and blend; it never starts a fresh idle or locomotion animation.
export function poseLimen(group,time,moving,sharedPose) {
  const previous=group.userData.limenMotion||{time,glide:0};
  const dt=Math.max(0,Math.min(.1,time-previous.time));
  const target=typeof moving==='number'?Math.max(0,Math.min(1,moving)):(moving?1:0);
  const pose=sharedPose?{...sharedPose}:{time,glide:previous.glide+(target-previous.glide)*(1-Math.exp(-dt*3))};
  group.userData.limenMotion=pose;
  const rig=rigFor(group),t=pose.time,g=pose.glide;
  const lift=Math.sin(t*.85)*.018+Math.sin(t*.37+.6)*.005;
  if(rig.sway) {rig.sway.position.y=lift;rig.sway.rotation.z=Math.sin(t*.53)*.009;}
  if(rig.torso)rig.torso.rotation.x=.018*g+Math.sin(t*.61+.6)*.007;
  for(let i=0;i<2;i++) {
    const side=i===0?-1:1;
    if(rig.arms[i]) {rig.arms[i].rotation.x=-.045*g+Math.sin(t*.72+i*.6)*.018;rig.arms[i].rotation.z=side*(.018+Math.sin(t*.48)*.008);}
    if(rig.veils[i]) {rig.veils[i].rotation.x=-.035*g+Math.sin(t*.68+i*.8)*.018;rig.veils[i].rotation.z=side*Math.sin(t*.43+i*.7)*.009;}
  }
  if(rig.shadow) {rig.shadow.scale.setScalar(1+lift*.7);rig.shadow.material.uniforms.opacity.value=.19-lift*.7;}
}

export function serializeLimenBody(group) { group.updateMatrixWorld(true); return group.toJSON(); }

import { LIMEN_MOTION_VERSION, LIMEN_STEP, makeCloth, createMotion, cloneMotion, copyMotion, advanceMotion, deformCloth } from './limen-motion.js';

/* Limen's single authored body. All geometry is portable BufferGeometry, so the
 * station and museum retain the same silhouette across Three.js versions. */
export function createLimenBody(T) {
  const group = new T.Group(); group.name = 'Limen · veiled keeper';
  group.userData.bodyVersion = 'living-keeper-3';
  const sway = new T.Group(); sway.name = 'limen-sway'; group.add(sway);
  const torso = new T.Group(); torso.name = 'limen-torso'; sway.add(torso);
  const porcelain = new T.MeshStandardMaterial({color:0xe5ded1,roughness:.64,metalness:.02});
  function fabricMaps(rx,ry) {
    const size=128,normals=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const i=(y*size+x)*4,u=x*Math.PI/4,v=y*Math.PI/4;
      const nx=.28*Math.cos(u)*(.7+.3*Math.sin(v)),ny=.28*Math.cos(v)*(.7+.3*Math.sin(u));
      const length=Math.hypot(nx,ny,1),grain=Math.sin(x*12.9898+y*78.233)*43758.5453;
      normals[i]=(nx/length*.5+.5)*255;normals[i+1]=(ny/length*.5+.5)*255;normals[i+2]=(1/length*.5+.5)*255;normals[i+3]=255;
      const r=225+Math.sin(u)*Math.sin(v)*10+(grain-Math.floor(grain)-.5)*8;
      roughness[i]=roughness[i+1]=roughness[i+2]=r;roughness[i+3]=255;
    }
    const normalMap=new T.DataTexture(normals,size,size),roughnessMap=new T.DataTexture(roughness,size,size);
    for(const texture of [normalMap,roughnessMap]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(rx,ry);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;}
    return {normalMap,normalScale:new T.Vector2(.15,.15),roughnessMap};
  }
  const linen = new T.MeshPhysicalMaterial({color:0xb9b2a7,roughness:.96,sheen:.42,sheenColor:0xc7bfb3,sheenRoughness:.8,...fabricMaps(24,36)});
  const mantle = new T.MeshPhysicalMaterial({color:0x55535a,roughness:.91,side:T.DoubleSide,sheen:.55,sheenColor:0x817a80,sheenRoughness:.85,...fabricMaps(7,36)});
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
  const curve=[];
  for(let i=0;i<profile.length-1;i++)for(let j=0;j<4;j++) {
    const a=profile[i],b=profile[i+1],previous=profile[Math.max(0,i-1)],next=profile[Math.min(profile.length-1,i+2)];
    const t=j/4,h=b[1]-a[1],ma=(b[0]-previous[0])/(b[1]-previous[1]),mb=(next[0]-a[0])/(next[1]-a[1]);
    const r=(2*t**3-3*t*t+1)*a[0]+(t**3-2*t*t+t)*h*ma+(-2*t**3+3*t*t)*b[0]+(t**3-t*t)*h*mb;
    curve.push(new T.Vector2(Math.max(.012,r),a[1]+h*t));
  }
  curve.push(new T.Vector2(...profile.at(-1)));
  const robeGeo=new T.LatheGeometry(curve,48);
  const rp=robeGeo.attributes.position;
  for(let i=0;i<rp.count;i++) {
    const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),a=Math.atan2(x,z);
    const lower=Math.max(0,Math.min(1,(1.2-y)/.81));
    const fold=1+.045*Math.sin(a*11)*Math.sin(Math.min(1,lower)*Math.PI*.7);
    rp.setXYZ(i,x*fold,y+.026*Math.sin(a*3)*lower,z*.72*fold-.085*lower*lower);
  }
  robeGeo.computeVertexNormals();
  robeGeo.userData.limenCloth={cols:48,rows:curve.length-1,layout:'columns',kind:'robe'};
  robeGeo.userData.limenRest=Array.from(robeGeo.attributes.position.array);
  const robe=mesh(robeGeo,linen,torso);robe.name='limen-floating-robe';
  // A split shoulder veil falls behind the hands. The face remains uncovered.
  for(const side of [-1,1]) {
    const vertices=[],indices=[],uvs=[],rows=24,cols=16;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const v=y/rows,u=x/cols;
      uvs.push(u,v);
      vertices.push(side*(.05+u*.20*(1-.44*v*v)+.018*Math.sin(v*Math.PI)),1.61-v*(1.27-.30*u)+.018*Math.sin(u*3*Math.PI)*v*v,-.145-.075*Math.sin(u*Math.PI)-.10*v*v+.018*Math.sin(u*5*Math.PI));
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();geo.translate(0,-1.61,0);
    geo.userData.limenCloth={cols,rows,layout:'rows',offsetY:1.61,kind:'veil'};
    geo.userData.limenRest=Array.from(geo.attributes.position.array);
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
  const clasp=mesh(new T.OctahedronGeometry(.034),seam,torso,0,1.52,.157);clasp.scale.set(.5,1,.25);
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
    const meshes=['limen-floating-robe','limen-veil-left','limen-veil-right'].map(name=>group.getObjectByName(name));
    rig={sway:group.getObjectByName('limen-sway'),torso:group.getObjectByName('limen-torso'),head:group.getObjectByName('limen-head'),shadow:group.getObjectByName('limen-ground-shadow'),
      arms:['left','right'].map(side=>group.getObjectByName('limen-arm-'+side)),meshes,
      cloth:meshes.map(m=>makeCloth(m.geometry.userData.limenRest,m.geometry.userData.limenCloth)),timings:new Float32Array(240),cursor:0};
    rigs.set(group,rig);
  }
  return rig;
}
// The motion state travels with the body. The receiver applies exactly the
// same phase and blend; it never starts a fresh idle or locomotion animation.
export function poseLimen(group,time,moving,sharedPose,context={}) {
  const started=performance.now();
  const rig=rigFor(group),root=context.root||group;
  const q=root.quaternion,yaw=Math.atan2(2*(q.x*q.z+q.w*q.y),1-2*(q.x*q.x+q.y*q.y));
  const rootPose=[root.position.x,root.position.y,root.position.z,yaw];
  let state=group.userData.limenMotion;
  if(sharedPose?.version===LIMEN_MOTION_VERSION) {
    if(state?.version!==LIMEN_MOTION_VERSION)state=createMotion(time,rootPose,rig.cloth);
    // Reuse private buffers. A synchronous preview must not share writable
    // physics arrays with the source, even between consecutive paints.
    copyMotion(state,sharedPose);
  }
  else {
    if(state?.version!==LIMEN_MOTION_VERSION)state=createMotion(time,rootPose,rig.cloth);
    let gazeYaw=context.gazeYaw||0,gazePitch=context.gazePitch||0;
    if(context.gaze) {
      const dx=context.gaze.x-root.position.x,dz=context.gaze.z-root.position.z;
      gazeYaw=Math.atan2(Math.sin(Math.atan2(dx,dz)-yaw),Math.cos(Math.atan2(dx,dz)-yaw));
      gazePitch=-Math.atan2(context.gaze.y-root.position.y-1.78,Math.max(.5,Math.hypot(dx,dz)));
    }
    advanceMotion(state,time,{root:rootPose,gazeYaw,gazePitch,attention:context.attention,reduced:context.reduced},rig.cloth);
  }
  group.userData.limenMotion=state;
  const alpha=Math.min(1,state.remainder/LIMEN_STEP),p=state.pose.map((v,i)=>state.previousPose[i]*(1-alpha)+v*alpha);
  rig.sway.position.y=p[0];rig.sway.rotation.z=p[2];
  rig.torso.rotation.set(p[1],p[3],0);rig.head.rotation.set(p[5],p[4],-p[2]*.22);
  for(let i=0;i<2;i++){rig.arms[i].rotation.x=p[6+i];rig.arms[i].rotation.z=(i?1:-1)*(.025+state.glide*.012);}
  for(let i=0;i<rig.meshes.length;i++) {
    const g=rig.meshes[i].geometry;
    deformCloth(rig.cloth[i],state.cloth[i],g.userData.limenRest,g.attributes.position.array,alpha);
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    const meta=g.userData.limenCloth;
    if(meta.kind==='robe') {
      const n=g.attributes.normal.array;
      for(let y=0;y<=meta.rows;y++) {
        const a=y*3,b=(meta.cols*(meta.rows+1)+y)*3;
        const x=n[a]+n[b],ny=n[a+1]+n[b+1],z=n[a+2]+n[b+2],length=Math.hypot(x,ny,z)||1;
        n[a]=n[b]=x/length;n[a+1]=n[b+1]=ny/length;n[a+2]=n[b+2]=z/length;
      }
    }
    // Conservative fixed bounds keep moving hems in both renderers' frustums.
    if(!g.boundingSphere){g.computeBoundingSphere();g.boundingSphere.radius+=.3;}
  }
  if(rig.shadow){rig.shadow.scale.setScalar(1+p[0]);rig.shadow.material.uniforms.opacity.value=.19-p[0]*.4;}
  rig.timings[rig.cursor++%rig.timings.length]=performance.now()-started;
}

export function limenDiagnostics(group) {
  const rig=rigFor(group),s=group.userData.limenMotion;
  const samples=Array.from(rig.timings.slice(0,Math.min(rig.cursor,rig.timings.length))).sort((a,b)=>a-b);
  let deformation=0,energy=0;
  if(s?.version===LIMEN_MOTION_VERSION)for(let c=0;c<rig.cloth.length;c++)for(let i=0;i<s.cloth[c].position.length;i++) {
    deformation=Math.max(deformation,Math.abs(s.cloth[c].position[i]-rig.cloth[c].rest[i]));
    energy+=(s.cloth[c].position[i]-s.cloth[c].previous[i])**2;
  }
  return {version:s?.version,attention:s?.attention,glide:s?.glide,steps:s?.steps,pose:s?.pose,
    clothPoints:rig.cloth.reduce((n,c)=>n+c.inverseMass.length,0),deformation,energy,
    cpuP95Ms:samples[Math.floor(samples.length*.95)]||0,cpuMaxMs:samples.at(-1)||0};
}

export function serializeLimenBody(group) {
  group.updateMatrixWorld(true);
  const data=group.toJSON();
  if(group.userData.limenMotion?.version===LIMEN_MOTION_VERSION)
    data.object.userData={...data.object.userData,limenMotion:cloneMotion(group.userData.limenMotion)};
  return data;
}

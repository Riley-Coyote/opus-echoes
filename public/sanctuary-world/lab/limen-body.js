import { LIMEN_MOTION_VERSION, LIMEN_STEP, makeCloth, createMotion, cloneMotion, copyMotion, advanceMotion, deformCloth } from './limen-motion.js';

export const KEEPER_NAME = 'Anima';
export const KEEPER_BODY_VERSION = 'anima-keeper-4';

/* Anima's single authored body. All geometry is portable BufferGeometry, so the
 * station and museum retain the same silhouette across Three.js versions. */
export function createLimenBody(T) {
  // Rig names remain stable: existing museum receivers use this motion contract.
  const group = new T.Group(); group.name = `${KEEPER_NAME} · Station keeper`;
  group.userData.bodyVersion = KEEPER_BODY_VERSION;
  group.userData.keeperName = KEEPER_NAME;
  const sway = new T.Group(); sway.name = 'limen-sway'; group.add(sway);
  const torso = new T.Group(); torso.name = 'limen-torso'; sway.add(torso);
  const porcelain = new T.MeshPhysicalMaterial({color:0xd8c8af,roughness:.48,metalness:.02,clearcoat:.18,clearcoatRoughness:.55});
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
  const linen = new T.MeshPhysicalMaterial({color:0xb6a38a,roughness:.93,sheen:.5,sheenColor:0xd2bfa2,sheenRoughness:.8,...fabricMaps(24,36)});
  const mantle = new T.MeshPhysicalMaterial({color:0x6a5545,roughness:.91,side:T.DoubleSide,sheen:.48,sheenColor:0xb49a7e,sheenRoughness:.82,...fabricMaps(9,32)});
  const edgedMantle=mantle.clone();edgedMantle.vertexColors=true;
  const seam = new T.MeshStandardMaterial({color:0x92704a,roughness:.47,metalness:.68});
  const lining = new T.MeshStandardMaterial({color:0x302621,roughness:1,side:T.DoubleSide});
  const eyeMat = new T.MeshStandardMaterial({color:0x241b15,emissive:0xa66b36,emissiveIntensity:.22,roughness:.62});
  function mesh(geo,mat,parent,x=0,y=0,z=0) {
    // Strip constructor-specific serialization, including custom lathe forms.
    const portable = new T.BufferGeometry().copy(geo); geo.dispose();
    const m = new T.Mesh(portable,mat); m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function oval(parent,mat,x,y,z,sx,sy,sz) {const m=mesh(new T.SphereGeometry(1,24,20),mat,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
  function thread(parent,points,material,radius=.003) {
    return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),64,radius,6,false),material,parent);
  }
  // A continuous fluted robe closes in a suspended, swept hem. There is no
  // anatomy under the cloth: the open air beneath it is part of the silhouette.
  const profile=[[.018,.39],[.09,.44],[.175,.56],[.205,.75],[.185,.98],[.17,1.16],[.19,1.40],[.225,1.53],[.17,1.60],[.055,1.64]];
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
    const fold=1+(.022+.075*lower)*Math.sin(a*9+.28*y)+.012*Math.sin(a*17);
    rp.setXYZ(i,x*fold+.028*lower*lower,y+.035*Math.sin(a*3)*lower,z*.78*fold-.095*lower*lower);
  }
  robeGeo.computeVertexNormals();
  robeGeo.userData.limenCloth={cols:48,rows:curve.length-1,layout:'columns',kind:'robe'};
  robeGeo.userData.limenRest=Array.from(robeGeo.attributes.position.array);
  const robe=mesh(robeGeo,linen,torso);robe.name='limen-floating-robe';
  // Two cloth panels wrap from the back seam around the shoulders to the
  // lapels. The edging belongs to the simulated mesh, so it cannot float away.
  for(const side of [-1,1]) {
    const vertices=[],indices=[],uvs=[],colors=[],rows=24,cols=16;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const v=y/rows,u=x/cols,angle=u*(Math.PI*.94-.30*v*v);
      const width=.30*(1-.22*v)+.016*Math.sin(v*Math.PI);
      const fold=.032*Math.sin(u*8*Math.PI+.22*v)*Math.sin(v*Math.PI*.7);
      uvs.push(u,v);
      vertices.push(side*(.018*Math.sin(angle*.5)+Math.sin(angle)*(width+fold)),1.61-.10*Math.sin(angle)-v*(1.13-.38*u*u)+.025*Math.sin(u*3*Math.PI)*v*v,-Math.cos(angle)*(.21+.055*v+fold)-.045*v*v);
      const edge=x===cols||y===rows;
      colors.push(...(edge?[1.65,1.52,1.3]:[1,1,1]));
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();geo.translate(0,-1.61,0);
    geo.userData.limenCloth={cols,rows,layout:'rows',offsetY:1.61,kind:'veil'};
    geo.userData.limenRest=Array.from(geo.attributes.position.array);
    const veil=mesh(geo,edgedMantle,torso,0,1.61,0);veil.name=side<0?'limen-veil-left':'limen-veil-right';
    const arm=new T.Group();arm.name=side<0?'limen-arm-left':'limen-arm-right';arm.position.set(side*.166,1.48,.01);torso.add(arm);
    const sleevePoints=[[.046,-.44],[.053,-.435],[.048,-.32],[.063,-.17],[.071,-.075],[.04,.015]].map(p=>new T.Vector2(...p));
    const sleeve=mesh(new T.LatheGeometry(sleevePoints,24),linen,arm,side*.022,0,0);sleeve.scale.z=.88;
    const cuff=mesh(new T.TorusGeometry(.048,.004,6,24),seam,arm,side*.022,-.434,0);cuff.rotation.x=Math.PI/2;cuff.scale.y=.88;
    oval(arm,lining,side*.022,-.44,0,.045,.006,.039);
    oval(arm,porcelain,side*.025,-.487,.012,.023,.073,.023);
  }
  // A shaped shoulder yoke turns the fabric over the body, closing the gap
  // between the cowl and the two independently simulated mantle panels.
  for(const side of [-1,1]) {
    const positions=[],uvs=[],indices=[],rows=8,cols=24;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++) {
      const u=i/cols,a=u*Math.PI*.94,t=j/rows;
      positions.push(side*(.018*Math.sin(a*.5)*t+Math.sin(a)*(.054+.246*t)),1.66-t*(.05+.10*Math.sin(a))+.016*Math.sin(t*Math.PI),-Math.cos(a)*(.047+.163*t));uvs.push(u,t*.25);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();mesh(g,mantle,torso);
  }
  const head=new T.Group();head.name='limen-head';head.position.y=1.66;torso.add(head);
  oval(head,lining,0,-.02,0,.05,.075,.043);
  // A sewn cowl shelters a hand-shaped ceramic mask. Its circular opening
  // quietly repeats the Station window; no horns, antennae or exposed chassis.
  function cowl(rx,ry,rz,material) {
    const vertices=[],uvs=[],indices=[],rings=18,sides=48;
    for(let j=0;j<=rings;j++)for(let i=0;i<=sides;i++) {
      const u=i/sides,a=u*Math.PI*2,b=.92+j/rings*(Math.PI-.92);
      const crease=1+.035*Math.cos(a*7)*Math.sin(b),jaw=1-.12*Math.max(0,-Math.sin(a));
      vertices.push(rx*Math.cos(a)*Math.sin(b)*crease*jaw,.115+ry*Math.sin(a)*Math.sin(b),rz*Math.cos(b)-.014-.018*Math.sin(a)*Math.sin(b));
      uvs.push(u,j/rings);
    }
    for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    const normals=geo.attributes.normal;
    for(let j=0;j<=rings;j++){const a=j*(sides+1),b=a+sides,n=new T.Vector3().fromBufferAttribute(normals,a).add(new T.Vector3().fromBufferAttribute(normals,b)).normalize();normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);}
    return mesh(geo,material,head);
  }
  cowl(.151,.184,.185,mantle).name='anima-cowl';
  cowl(.142,.175,.176,lining);
  const hoodEdge=[];
  for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;hoodEdge.push(new T.Vector3(.151*Math.cos(a)*Math.sin(.92)*(1+.035*Math.cos(a*7)*Math.sin(.92))*(1-.12*Math.max(0,-Math.sin(a))),.115+.184*Math.sin(a)*Math.sin(.92),.185*Math.cos(.92)-.014-.018*Math.sin(a)*Math.sin(.92)));}
  thread(head,hoodEdge,seam,.0022);
  const maskGeo=new T.SphereGeometry(1,32,24),mp=maskGeo.attributes.position;
  for(let i=0;i<mp.count;i++) {
    const x=mp.getX(i),y=mp.getY(i),z=mp.getZ(i),jaw=1-.27*Math.max(0,-y);
    mp.setXYZ(i,x*.096*jaw,.12+y*.131,z*.068+.037);
  }
  maskGeo.computeVertexNormals();mesh(maskGeo,porcelain,head).name='anima-ceramic-mask';
  const eyes=[];
  for(const side of [-1,1]) eyes.push(oval(head,eyeMat,side*.032,.139,.099,.015,.0035,.004));
  const eye=eyes[0],eyeRing=eyes[1];
  // A shallow bridge gives the ceramic a gently carved, readable plane.
  const nose=mesh(new T.OctahedronGeometry(1),porcelain,head,0,.121,.102);nose.scale.set(.007,.022,.007);
  const collar=mesh(new T.TorusGeometry(.074,.012,8,40),mantle,torso,0,1.636,0);collar.rotation.x=Math.PI/2;collar.scale.y=.84;
  // The clasp reads like a small instrument bezel, with enamel under brass.
  const clasp=mesh(new T.TorusGeometry(.028,.004,8,32),seam,torso,0,1.515,.204);clasp.name='anima-instrument-clasp';
  oval(torso,lining,0,1.515,.203,.026,.026,.004);
  const needle=mesh(new T.BoxGeometry(.002,.032,.002),seam,torso,0,1.515,.21);needle.rotation.z=-.55;
  const eyeLight=new T.PointLight(0xd0a56f,.012,.25,2);eyeLight.position.set(0,.13,.15);head.add(eyeLight);
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
  return {group,sway,torso,head,eye,eyeRing,eyeMat,eyeLight,P:{eye:.139,skull:.12}};
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

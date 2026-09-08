/* Limen's single authored body. All geometry is portable BufferGeometry, so the
 * station and museum retain the same silhouette across Three.js versions. */
export function createLimenBody(T) {
  const group = new T.Group(); group.name = 'Limen · veiled keeper';
  group.userData.bodyVersion = 'veiled-keeper-1';
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
  const profile=[[.24,.10],[.255,.18],[.215,.50],[.16,.91],[.115,1.16],[.155,1.40],[.205,1.53],[.17,1.60],[.055,1.64]];
  const robe=mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),64),linen,torso);robe.scale.z=.72;
  // Long, shallow flutes read as woven folds, never articulated armor.
  for(let i=0;i<11;i++) {
    const a=i/11*Math.PI*2;
    const curve=new T.CatmullRomCurve3([new T.Vector3(Math.sin(a)*.116,1.16,Math.cos(a)*.085),new T.Vector3(Math.sin(a)*.18,.65,Math.cos(a)*.13),new T.Vector3(Math.sin(a)*.244,.14,Math.cos(a)*.176)]);
    mesh(new T.TubeGeometry(curve,18,.006,5,false),porcelain,torso);
  }
  // A split shoulder veil falls behind the hands. The face remains uncovered.
  for(const side of [-1,1]) {
    const vertices=[],indices=[],rows=16,cols=12;
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const v=y/rows,u=x/cols;
      vertices.push(side*(.05+u*(.19+.05*v)+.015*Math.sin(v*Math.PI)),1.61-v*(1.40-.12*u),-.055-.085*Math.sin(u*Math.PI)-.10*v+.018*Math.sin(u*5*Math.PI));
    }
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
    const veil=mesh(geo,mantle,torso);veil.name=side<0?'limen-veil-left':'limen-veil-right';
    const arm=new T.Group();arm.name=side<0?'limen-arm-left':'limen-arm-right';arm.position.set(side*.20,1.5,0);torso.add(arm);
    oval(arm,linen,side*.025,-.24,0,.057,.30,.054);
    oval(arm,porcelain,side*.035,-.53,.02,.026,.102,.025);
    const leg=new T.Group();leg.name=side<0?'journey-leg-left':'journey-leg-right';leg.position.x=side*.085;sway.add(leg);
    oval(leg,mantle,0,.19,0,.041,.17,.046);
    oval(leg,porcelain,0,.045,.035,.048,.035,.092);
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
  const pick=mesh(new T.CylinderGeometry(.29,.29,1.96,8),new T.MeshBasicMaterial(),group,0,.98,0);pick.visible=false;pick.name='limen-pick';
  return {group,sway,torso,head,eye,eyeRing,eyeMat,eyeLight,P:{eye:.127,skull:.111}};
}
export function poseLimen(group,time,moving) {
  for(const [i,name] of ['journey-leg-left','journey-leg-right'].entries()) {
    const leg=group.getObjectByName(name);if(!leg)continue;
    const angle=moving?Math.sin(time*5+i*Math.PI)*.13:0;
    leg.rotation.x=angle;leg.position.y=1.075*(1-Math.cos(angle));leg.position.z=-1.075*Math.sin(angle);
  }
  for(const [i,side] of ['left','right'].entries()) {
    const arm=group.getObjectByName('limen-arm-'+side),veil=group.getObjectByName('limen-veil-'+side);
    if(arm)arm.rotation.x=moving?Math.sin(time*5+i*Math.PI)*.055:0;
    if(veil)veil.rotation.x=moving?Math.sin(time*5+i*Math.PI)*.016:0;
  }
}

export function serializeLimenBody(group) { group.updateMatrixWorld(true); return group.toJSON(); }

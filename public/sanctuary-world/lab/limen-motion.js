/* Shared, renderer-independent embodiment. All state is plain data so a retained
 * museum can render a source snapshot and subsequently own the same simulation. */
export const LIMEN_MOTION_VERSION = 3;
export const LIMEN_STEP = 1 / 60;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
const BODY_COLLIDERS=[[1.34,.205,.32,.155,0],[.88,.18,.35,.135,-.025]];

export function makeCloth(rest, { cols, rows, layout, offsetY = 0, kind }) {
  const nx = kind === 'robe' ? 12 : 6, ny = 12;
  const index = (x, y) => layout === 'columns' ? x * (rows + 1) + y : y * (cols + 1) + x;
  const points = [], inverseMass = [];
  function sample(u, v, axis) {
    const fx = u * cols, fy = v * rows, x = Math.min(cols - 1, Math.floor(fx)), y = Math.min(rows - 1, Math.floor(fy));
    const a = fx - x, b = fy - y;
    return rest[index(x,y)*3+axis]*(1-a)*(1-b) + rest[index(x+1,y)*3+axis]*a*(1-b)
      + rest[index(x,y+1)*3+axis]*(1-a)*b + rest[index(x+1,y+1)*3+axis]*a*b;
  }
  for (let y=0;y<=ny;y++) for (let x=0;x<=nx;x++) {
    for(let k=0;k<3;k++) points.push(sample(x/nx,y/ny,k));
    const fromShoulder = kind === 'robe' ? 1-y/ny : y/ny;
    inverseMass.push(fromShoulder < .17 ? 0 : 1);
  }
  const edges=[], seen=new Set(), at=(x,y)=>y*(nx+1)+x;
  function edge(a,b,compliance) {
    const key=Math.min(a,b)+':'+Math.max(a,b); if(seen.has(key))return;seen.add(key);
    edges.push({a,b,length:Math.hypot(points[a*3]-points[b*3],points[a*3+1]-points[b*3+1],points[a*3+2]-points[b*3+2]),compliance,lambda:0});
  }
  for(let y=0;y<=ny;y++) for(let x=0;x<=nx;x++) {
    const a=at(x,y);
    if(x<nx)edge(a,at(x+1,y),.000003);
    if(y<ny)edge(a,at(x,y+1),.000003);
    if(x<nx&&y<ny){edge(a,at(x+1,y+1),.00004);edge(at(x+1,y),at(x,y+1),.00004);}
    if(x+2<=nx)edge(a,at(x+2,y),.0015);
    if(y+2<=ny)edge(a,at(x,y+2),.0015);
    if(kind==='robe'&&x===0)edge(a,at(nx,y),0);
  }
  // The coarse sheet supplies displacement, preserving the authored fine folds.
  const bindings=[];
  for(let i=0;i<rest.length/3;i++) {
    const x=layout==='columns'?Math.floor(i/(rows+1)):i%(cols+1);
    const y=layout==='columns'?i%(rows+1):Math.floor(i/(cols+1));
    const fx=x/cols*nx,fy=y/rows*ny,cx=Math.min(nx-1,Math.floor(fx)),cy=Math.min(ny-1,Math.floor(fy)),a=fx-cx,b=fy-cy;
    bindings.push({ids:[at(cx,cy),at(cx+1,cy),at(cx,cy+1),at(cx+1,cy+1)],weights:[(1-a)*(1-b),a*(1-b),(1-a)*b,a*b]});
  }
  return {rest:points,inverseMass,edges,bindings,offsetY,kind,nx,ny};
}

export function createMotion(time, root, cloth) {
  return {
    version:LIMEN_MOTION_VERSION,time,root:root.slice(),remainder:0,steps:0,
    velocity:[0,0,0],turn:0,glide:0,attention:'room',
    pose:Array(8).fill(0),previousPose:Array(8).fill(0),poseVelocity:Array(8).fill(0),
    cloth:cloth.map(c=>({position:c.rest.slice(),previous:c.rest.slice()}))
  };
}

export function cloneMotion(s) {
  return {...s,root:s.root.slice(),velocity:s.velocity.slice(),pose:s.pose.slice(),previousPose:s.previousPose.slice(),poseVelocity:s.poseVelocity.slice(),
    cloth:s.cloth.map(c=>({position:c.position.slice(),previous:c.previous.slice()}))};
}

export function copyMotion(target, source) {
  for(const key of ['version','time','remainder','steps','turn','glide','attention'])target[key]=source[key];
  for(const key of ['root','velocity','pose','previousPose','poseVelocity'])
    for(let i=0;i<source[key].length;i++)target[key][i]=source[key][i];
  for(let c=0;c<source.cloth.length;c++)for(const key of ['position','previous'])
    for(let i=0;i<source.cloth[c][key].length;i++)target.cloth[c][key][i]=source.cloth[c][key][i];
  return target;
}

// The portal is a rigid half-turn. Cloth and pose stay in body-local space;
// only world-space root samples and velocity need the coordinate transform.
export function mapLimenMotion(s) {
  if(s?.version!==LIMEN_MOTION_VERSION)return s;
  return {...s,root:[6.7-s.root[0],s.root[1],32.85-s.root[2],angle(s.root[3]+Math.PI)],velocity:[-s.velocity[0],s.velocity[1],-s.velocity[2]]};
}

function spring(s,i,target,frequency,damping,h) {
  s.poseVelocity[i]+=(frequency*frequency*(target-s.pose[i])-2*damping*frequency*s.poseVelocity[i])*h;
  s.pose[i]+=s.poseVelocity[i]*h;
}

function clothStep(c,s,h,drive,time) {
  const p=s.position,old=s.previous,r=c.rest,w=c.inverseMass;
  const drag=Math.exp(-4.8*h),h2=h*h;
  for(let i=0;i<w.length;i++) {
    const k=i*3;
    if(w[i]===0){for(let a=0;a<3;a++)p[k+a]=old[k+a]=r[k+a];continue;}
    const height=r[k+1]+c.offsetY,loose=clamp((1.5-height)/1.1,0,1);
    // Rest shape holds the cloth's tailored silhouette. Motion adds air drag,
    // translational inertia and the angular inertia of a turn about the shoulders.
    const air=.045*Math.sin(time*.63+r[k+1]*2.1+r[k]*3)*loose;
    const fx=-drive.ax*.48-drive.vx*1.25-drive.angular*r[k+2]*.32+air;
    const fy=-.45*loose,fz=-drive.az*.48-drive.vz*1.25+drive.angular*r[k]*.32;
    for(let a=0;a<3;a++) {
      const current=p[k+a],restore=(r[k+a]-current)*(c.kind==='robe'?19:11);
      p[k+a]=current+(current-old[k+a])*drag+((a===0?fx:a===1?fy:fz)+restore)*h2;
      old[k+a]=current;
    }
  }
  for(const e of c.edges)e.lambda=0;
  for(let iteration=0;iteration<5;iteration++) {
    for(const e of c.edges) {
      const a=e.a*3,b=e.b*3,wa=w[e.a],wb=w[e.b];if(wa+wb===0)continue;
      // Coordinates are bounded; a direct norm avoids the scaled hypot path
      // in the solver's hottest loop without sacrificing useful precision.
      const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2],length=Math.sqrt(x*x+y*y+z*z);if(length<1e-9)continue;
      const alpha=e.compliance/h2,delta=(-(length-e.length)-alpha*e.lambda)/(wa+wb+alpha)/length;
      e.lambda+=delta*length;
      p[a]+=wa*delta*x;p[a+1]+=wa*delta*y;p[a+2]+=wa*delta*z;
      p[b]-=wb*delta*x;p[b+1]-=wb*delta*y;p[b+2]-=wb*delta*z;
    }
    for(let i=0;i<w.length;i++) {
      if(w[i]===0)continue;
      const k=i*3;
      // Floor clearance and a bounded envelope prevent a delayed frame or a
      // direct-arrival relocation from throwing the hem through the room.
      p[k+1]=Math.max(.27-c.offsetY,p[k+1]);
      for(let a=0;a<3;a++)p[k+a]=clamp(p[k+a],r[k+a]-.24,r[k+a]+.24);
      if(c.kind==='veil') {
        // Analytic torso and robe colliders; the garment moves around the back
        // instead of intersecting the linen at a tight turn.
        for(const [cy,rx,ry,rz,cz] of BODY_COLLIDERS) {
          const dx=p[k]/rx,dy=(p[k+1]+c.offsetY-cy)/ry,dz=(p[k+2]-cz)/rz;
          const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(d<1&&d>1e-6){p[k]=dx/d*rx;p[k+1]=cy+dy/d*ry-c.offsetY;p[k+2]=cz+dz/d*rz;}
        }
      }
    }
  }
  if(c.kind==='robe')for(let y=0;y<=c.ny;y++)for(let axis=0;axis<3;axis++) {
    const a=y*(c.nx+1)*3+axis,b=a+c.nx*3;
    p[a]=p[b]=(p[a]+p[b])*.5;old[a]=old[b]=(old[a]+old[b])*.5;
  }
}

export function advanceMotion(s,time,input,cloth) {
  const gap=time-s.time;
  if(gap<=0){if(gap<0)s.time=time;s.root=input.root.slice();return;}
  // Time spent in an inactive document never becomes a backlog of physics.
  const dt=gap>.25?0:Math.min(gap,.05);
  const dx=input.root[0]-s.root[0],dy=input.root[1]-s.root[1],dz=input.root[2]-s.root[2];
  const relocated=Math.hypot(dx,dy,dz)>Math.max(.3,dt*8);
  const raw=dt>0&&!relocated?[dx/dt,dy/dt,dz/dt]:[0,0,0];
  const turn=dt>0&&!relocated?clamp(angle(input.root[3]-s.root[3])/dt,-3,3):0;
  s.time=time;s.root=input.root.slice();s.attention=input.attention||'path';
  if(relocated||!dt){s.velocity.fill(0);s.turn=0;s.remainder=0;return;}
  if(input.reduced) {
    s.glide=0;s.pose.fill(0);s.previousPose.fill(0);s.poseVelocity.fill(0);s.remainder=0;
    for(let i=0;i<cloth.length;i++){s.cloth[i].position=cloth[i].rest.slice();s.cloth[i].previous=cloth[i].rest.slice();}
    return;
  }
  s.remainder+=dt;
  const h=LIMEN_STEP,sy=Math.sin(input.root[3]),cy=Math.cos(input.root[3]);
  while(s.remainder+1e-9>=h) {
    s.previousPose=s.pose.slice();
    const ax=clamp((raw[0]-s.velocity[0])*7,-4,4),az=clamp((raw[2]-s.velocity[2])*7,-4,4);
    const angular=clamp((turn-s.turn)*6,-6,6);
    for(let i=0;i<3;i++)s.velocity[i]+=(raw[i]-s.velocity[i])*(1-Math.exp(-7*h));
    s.turn+=(turn-s.turn)*(1-Math.exp(-6*h));
    const vx=cy*s.velocity[0]-sy*s.velocity[2],vz=sy*s.velocity[0]+cy*s.velocity[2];
    const localAx=cy*ax-sy*az,localAz=sy*ax+cy*az;
    const speed=Math.hypot(s.velocity[0],s.velocity[2]);
    s.glide+=(clamp(speed/1.4,0,1)-s.glide)*(1-Math.exp(-4*h));
    const gazeYaw=clamp(input.gazeYaw||0,-.92,.92),gazePitch=clamp(input.gazePitch||0,-.35,.35);
    const targets=[.024*s.glide+.003*Math.sin((time-s.remainder)*.8),
      clamp(vz*.024+localAz*.015,-.08,.08),clamp(-vx*.022-s.turn*speed*.033-localAx*.012,-.10,.10),
      gazeYaw*.20,gazeYaw*.80,gazePitch,
      -.035*s.glide-clamp(localAz*.019,-.05,.05)+s.turn*.015,
      -.035*s.glide-clamp(localAz*.019,-.05,.05)-s.turn*.015];
    for(let i=0;i<8;i++)spring(s,i,targets[i],i===4||i===5?9:i===3?4:5.5,i<3?.85:1,h);
    for(let i=0;i<cloth.length;i++)clothStep(cloth[i],s.cloth[i],h,{ax:localAx,az:localAz,vx,vz,angular},time-s.remainder);
    s.remainder=Math.max(0,s.remainder-h);s.steps++;
  }
}

export function deformCloth(c,s,rest,out,alpha) {
  for(let i=0;i<c.bindings.length;i++) {
    const b=c.bindings[i];
    for(let a=0;a<3;a++) {
      let d=0;
      for(let j=0;j<4;j++){const k=b.ids[j]*3+a;d+=(s.previous[k]*(1-alpha)+s.position[k]*alpha-c.rest[k])*b.weights[j];}
      out[i*3+a]=rest[i*3+a]+d;
    }
  }
}

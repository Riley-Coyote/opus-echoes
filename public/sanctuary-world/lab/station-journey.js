/* The station side of the first museum journey. The retained computer documents
 * are never reparented, navigated or recreated by this controller. */
export function createStationJourney({ THREE: T, scene, camera, guide, prepare, restore, cross, directReturn, planGuideRoute, doorwayReady = () => true, doorwayError = () => null }) {
  const steel = new T.MeshStandardMaterial({ color: 0x29272a, metalness: .65, roughness: .48 });
  const concrete = new T.MeshStandardMaterial({ color: 0x786b5d, roughness: .88 });
  const floorFinish = new T.MeshStandardMaterial({ color: 0x504a43, roughness: .56 });
  const bronze = new T.MeshStandardMaterial({ color: 0x998064, metalness: .55, roughness: .46 });
  const light = new T.MeshBasicMaterial({ color: 0xffc994 });
  const passage = new T.Group(); passage.name = 'station-museum-passage'; scene.add(passage);
  const block = (w,h,d,x,y,z,mat) => {
    const m = new T.Mesh(new T.BoxGeometry(w,h,d),mat); m.position.set(x,y,z);
    m.receiveShadow = true; passage.add(m); return m;
  };
  // A real opening leads along the front clear strip, then around a dogleg.
  const outline=[[1.2,3.25],[4.2,3.25],[4.2,5.8],[8.2,5.8],[8.2,11],[5.2,11],[5.2,8.6],[1.2,8.6]];
  const shape=new T.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const floorGeo=new T.ShapeGeometry(shape);floorGeo.rotateX(-Math.PI/2);
  const floor=new T.Mesh(floorGeo,floorFinish);floor.receiveShadow=true;passage.add(floor);
  const ceiling=new T.Mesh(floorGeo.clone(),steel);ceiling.material=steel.clone();ceiling.material.side=T.DoubleSide;ceiling.position.y=2.8;passage.add(ceiling);
  block(.22,2.8,4.75,1.2,1.4,5.625,concrete);
  block(.22,2.8,2.45,4.2,1.4,4.475,concrete);

  block(2.5,2.8,.22,5.45,1.4,5.8,steel);
  // Open threshold: the live museum is visible beyond this frame.
  block(.2,2.8,2.3,5.2,1.4,9.55,concrete);
  block(.2,2.8,4.8,8.2,1.4,8.2,concrete);
  block(.16,2.8,.18,5.28,1.4,10.9,steel);
  block(.16,2.8,.18,8.12,1.4,10.9,steel);
  block(3.0,.12,.18,6.7,2.74,10.9,steel);

  // Skirtings, recessed warm lines and regular floor joints give the dogleg
  // the same measured construction as the room without adding dynamic lights.
  for(const [x,z,length] of [[1.325,5.65,4.6],[4.075,4.5,2.3],[5.325,9.65,2.1],[8.075,8.25,4.6]]){
    block(.018,.12,length,x,.06,z,bronze);
    block(.018,.014,length,x,.21,z,light);
    block(.07,.035,length,x,2.62,z,bronze);
  }
  for(const z of [3.85,4.85,5.65,6.55,7.55])block(2.76,.002,.008,2.7,.002,z,steel);
  for(const z of [8.2,9.2,10.2])block(2.74,.002,.008,6.7,.002,z,steel);
  block(2.9,.025,.05,6.7,2.55,10.84,light);

  // Leave the crossing lane open through the dogleg's back wall.

  block(3.2,2.8,.22,2.8,1.4,8.6,steel);
  for (const [x,z,yaw] of [[2.7,3.35,0],[2.7,5.25,0],[5,7.2,Math.PI/2],[6.7,9.9,0]]) {
    const rib = new T.Group(); rib.position.set(x,0,z); rib.rotation.y=yaw; passage.add(rib);
    for(const sx of [-1.35,1.35]) {
      const m=new T.Mesh(new T.BoxGeometry(.07,2.65,.1),steel);m.position.set(sx,1.325,0);rib.add(m);
      const l=new T.Mesh(new T.BoxGeometry(.018,.045,.14),light);l.position.set(sx,.23,-.08);rib.add(l);
    }
    const lintel=new T.Mesh(new T.BoxGeometry(2.75,.1,.12),steel);lintel.position.y=2.65;rib.add(lintel);
    const lamp=new T.PointLight(0xffc08b,4.2,5.5,2);lamp.position.set(x,2.35,z);passage.add(lamp);
  }
  const panel=document.createElement('section');panel.id='station-journey';panel.hidden=true;
  panel.setAttribute('aria-label','Museum journey');
  panel.innerHTML='<div><span class="journey-label">THE STATION → THE MUSEUM</span><p role="status" aria-live="polite"></p></div><div class="journey-buttons"><button data-action="pause">Pause</button><button data-action="skip">Arrive now</button><button data-action="cancel">Return to Station</button></div>';
  document.body.append(panel);
  const style=document.createElement('style');style.textContent=`
  #station-journey{position:fixed;z-index:80;bottom:28px;left:50%;transform:translateX(-50%);width:min(720px,calc(100% - 32px));padding:12px 16px;background:#121215ed;border:1px solid #63564d;color:#eae6df;display:flex;align-items:center;justify-content:space-between;gap:20px;backdrop-filter:blur(12px)}
  #station-journey[hidden]{display:none}#station-journey .journey-label{font:9px var(--mono);letter-spacing:.12em;color:#c4a489}#station-journey p{font:11px var(--mono);margin:6px 0 0;line-height:1.6}#station-journey .journey-buttons{display:flex;flex-wrap:nowrap;gap:6px}#station-journey button{min-height:44px;white-space:nowrap;padding:8px 12px;color:#eae6df;border:1px solid #73685e;background:#202025;font:10px var(--mono);cursor:pointer}#station-journey button:focus-visible{outline:2px solid #e0bc99;outline-offset:3px}body.station-travel #chrome,body.station-travel #hud,body.station-travel #room-index-toggle,body.station-travel #stand,body.station-travel #full{visibility:hidden}@media(max-width:650px){#station-journey{bottom:14px;align-items:start;flex-direction:column;gap:8px}#station-journey button{font-size:9px;padding:8px 9px}}
  `;document.head.append(style);
  const text=panel.querySelector('p'),pauseButton=panel.querySelector('[data-action=pause]');
  let sourceFocus=null;
  let state='idle',paused=false,saved=null,path=[],covered=0,total=0,speed=0,direction='out',stageTime=0,revision=0;
  let initialGuide=null,approach=[],cameraApproach=[],cameraStart=null,lookStart=null,lookHeld=0,stageDuration=1.7,approachCovered=0,approachSpeed=0;
  const travelPath=[[-3.6,2.75],[2.7,2.75],[2.7,7.2],[6.7,7.2],[6.7,11.15]];
  const v = (p) => new T.Vector3(p[0],0,p[1]);
  function distances(points){let n=0;for(let i=1;i<points.length;i++)n+=points[i-1].distanceTo(points[i]);return n;}
  function sample(points,d){let out=points[0].clone();for(let i=1;i<points.length;i++){const n=out.distanceTo(points[i]);if(d<=n)return out.lerp(points[i],n?d/n:0);d-=n;out.copy(points[i]);}return out;}
  function status(message){panel.dataset.state=state;panel.dataset.paused=String(paused);text.textContent=message;pauseButton.textContent=paused?'Resume':'Pause';pauseButton.disabled=['preparing','crossing'].includes(state);}
  function route(points){
    const smooth=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1];
      const enter=b.clone().lerp(a,Math.min(1.0/b.distanceTo(a),.4));
      const exit=b.clone().lerp(c,Math.min(1.0/b.distanceTo(c),.4));smooth.push(enter);
      for(let k=1;k<=12;k++){const t=k/12;smooth.push(enter.clone().multiplyScalar((1-t)**2).addScaledVector(b,2*t*(1-t)).addScaledVector(exit,t*t));}
    }smooth.push(points.at(-1));path=smooth;points=smooth;covered=0;total=distances(path);speed=0;}
  function finish(){if(!saved)return;revision++;state='idle';panel.hidden=true;document.body.classList.remove('station-travel');guide.group.position.copy(initialGuide.position);guide.group.quaternion.copy(initialGuide.quaternion);guide.walkPose(0,false);restore(saved);saved=null;paused=false;if(sourceFocus?.isConnected)sourceFocus.focus?.({preventScroll:true});}
  async function transfer(direct=false){if(state==='crossing'||state==='away')return;state='crossing';status('Opening into the Sun chamber…');const token=revision;try{await cross({direct,guide:guide.group.toJSON(),speed});if(token!==revision)return;state='away';panel.hidden=true;}catch{if(token!==revision)return;state='waiting';status('The passage is unavailable. Arrive now retries; the station is still here.');}}
  return {
    passageSnapshot(){const copy=passage.clone(true);copy.traverse(o=>{if(o.isMesh)o.geometry=new T.BufferGeometry().copy(o.geometry);});copy.updateMatrixWorld(true);return copy.toJSON();},
    get active(){return state!=='idle';},get state(){return {phase:state,paused,progress:total?covered/total:0,direction};},
    async start(direct=false){if(state!=='idle')return;sourceFocus=document.activeElement;direct=direct||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;revision++;initialGuide={position:guide.group.position.clone(),quaternion:guide.group.quaternion.clone()};saved=prepare();cameraStart=camera.position.clone();lookStart=camera.quaternion.clone();state='preparing';direction='out';paused=false;stageTime=0;approachCovered=0;approachSpeed=0;lookHeld=0;panel.hidden=false;document.body.classList.add('station-travel');panel.querySelector('[data-action=cancel]').textContent='Return';status('Limen is opening the passage…');panel.querySelector('[data-action=cancel]').focus?.({preventScroll:true});
      // WP-46: the room is one level now, with the desk under the porthole on
      // the left and the credenza in the right corner. The clear lane out of
      // either is the open strip in front of both, so a withdrawal goes to the
      // front of the room first and only then along it.
      const p=guide.group.position;approach=[new T.Vector3(p.x,0,p.z)];
      if(p.z<2.4){
        if(p.z<-.2)approach.push(v([p.x,-.2]));
        approach.push(v([-.4,-.2]),v([-.4,2.75]));
      }approach.push(v([-.8,2.75]));
      // Seated views withdraw into the open aisle, never diagonally across the
      // desk or the credenza. Their return retraces this same approach.
      cameraApproach=[cameraStart.clone()];
      if(cameraStart.z<2.4){
        cameraApproach.push(new T.Vector3(cameraStart.x,1.65,cameraStart.z));
        // out of the console's corner: past the credenza's left end, not over it
        if(cameraStart.x>1.2&&cameraStart.z<.4){cameraApproach.push(new T.Vector3(.6,1.65,cameraStart.z),new T.Vector3(.6,1.65,2.75));}
        else {cameraApproach.push(new T.Vector3(cameraStart.x,1.65,2.75));}
        cameraApproach.push(new T.Vector3(2.7,1.65,2.75));
        route(travelPath.slice(1).map(v));
        approach.pop();approach.push(v([2.7,2.75]),v([2.7,5.55]));
      }else {cameraApproach.push(new T.Vector3(-3.6,1.65,2.75));route(travelPath.map(v));}
      if(planGuideRoute&&!direct){
        const seated=cameraStart.z<2.4, goal=seated?[2.7,2.75]:[-.8,2.75];
        const safe=planGuideRoute([p.x,p.z],goal);
        if(!safe){state='waiting';status('Limen cannot reach the passage from here. You can arrive directly or stay in the station.');return;}
        approach=safe.map(v);if(seated)approach.push(v([2.7,5.55]));
      }
      stageDuration=Math.max(1.7,distances(cameraApproach)*1.5/1.2);
      if(direct)await transfer(true);
    },
    returnFromMuseum(direct=false){if(state==='idle')return;revision++;if(direct){finish();return;}direction='back';state='traveling';paused=false;lookHeld=0;camera.position.set(6.7,1.65,11.15);camera.lookAt(6.7,1.65,7.2);route([...travelPath.slice(cameraApproach.at(-1).x===2.7?1:0)].reverse().map(v));guide.group.visible=true;guide.group.position.set(6.7,0,7.95);guide.group.rotation.y=Math.PI;panel.hidden=false;panel.querySelector('[data-action=cancel]').textContent='Return now';status('With Limen → keeper’s room');},
    pause(){if(['idle','away','crossing'].includes(state))return;paused=!paused;status(paused?'Paused · continue when you are ready.':direction==='out'?'With Limen → Sun chamber':'With Limen → keeper’s room');},
    look(){lookHeld=Infinity;},
    skip(){if(direction==='back'){finish();return;}transfer(true);},
    cancel(){if(state==='idle')return;directReturn();finish();},
    tick(time,dt){if(['idle','away','crossing'].includes(state)||document.hidden)return;dt=Math.min(dt,.05);lookHeld=Math.max(0,lookHeld-dt);
      if(paused||state==='waiting') {
        const gp=guide.group.position,want=Math.atan2(camera.position.x-gp.x,camera.position.z-gp.z);
        const d=Math.atan2(Math.sin(want-guide.group.rotation.y),Math.cos(want-guide.group.rotation.y));
        guide.group.rotation.y+=d*(1-Math.exp(-dt*1.6));
        guide.walkPose(time,0,{gaze:camera.position,attention:'visitor'});return;
      }
      if(state==='preparing'){guide.walkPose(time,0,{gaze:camera.position,attention:'visitor'});if(doorwayError()){state='waiting';status('The room could not be prepared. Arrive now retries.');return;}if(!doorwayReady())return;state='staging';status('Limen is meeting you at the passage.');}
      if(state==='restoring') {stageTime+=dt;const k=Math.min(1,stageTime/stageDuration),e=k*k*k*(k*(k*6-15)+10);camera.position.copy(sample(cameraApproach,distances(cameraApproach)*(1-e)));camera.quaternion.copy(lookStart).slerp(saved.quaternion,e);if(k===1)finish();return;}
      if(state==='staging'){
        stageTime+=dt;
        if(stageTime<.65){guide.walkPose(time,0,{gaze:camera.position,attention:'visitor'});return;}
        const k=Math.min(1,(stageTime-.65)/stageDuration),e=k*k*k*(k*(k*6-15)+10);camera.position.copy(sample(cameraApproach,distances(cameraApproach)*e));
        const remaining=Math.max(0,distances(approach)-approachCovered),oldSpeed=approachSpeed;
        approachSpeed=Math.min(1.15,approachSpeed+.8*dt,Math.sqrt(1.6*remaining));
        approachCovered=Math.min(distances(approach),approachCovered+(oldSpeed+approachSpeed)*.5*dt);
        if(remaining<.002)approachCovered=distances(approach);
        const gp=sample(approach,approachCovered),ahead=sample(approach,approachCovered+.35);guide.group.position.copy(gp);
        if(gp.distanceTo(ahead)>.001){const yaw=Math.atan2(ahead.x-gp.x,ahead.z-gp.z);guide.group.rotation.y+=Math.atan2(Math.sin(yaw-guide.group.rotation.y),Math.cos(yaw-guide.group.rotation.y))*(1-Math.exp(-dt*4));}
        guide.walkPose(time,approachSpeed/1.4,{gaze:remaining<.05?camera.position:new T.Vector3(ahead.x,1.7,ahead.z),attention:remaining<.05?'visitor':'path'});
        const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(camera.position,new T.Vector3(gp.x,1.55,gp.z),camera.up));if(!lookHeld)camera.quaternion.copy(lookStart).slerp(q,e);
        if(k===1&&approachCovered>=distances(approach)){state='traveling';status('With Limen → Sun chamber');}return;
      }
      if(direction==='out' && camera.position.z>7.4 && !doorwayReady()){guide.walkPose(time,0,{gaze:camera.position,attention:'visitor'});status('Preparing the room beyond · your place is held.');return;}
      const left=total-covered,oldSpeed=speed;speed=Math.min(speed+.7*dt,1.4,direction==='out'?1.4:Math.sqrt(Math.max(.006,2*.7*left)));covered=Math.min(total,covered+(oldSpeed+speed)*.5*dt);
      const p=sample(path,covered),ahead=sample(path,covered+3.0),gp=sample(path,covered+2.8),ga=sample(path,covered+2.95);
      if(direction==='out'){ahead.z+=Math.max(0,covered+3.0-total);gp.z+=Math.max(0,covered+2.8-total);ga.z+=Math.max(0,covered+2.95-total);}
      camera.position.copy(p);camera.position.y=1.65;
      // See through each turn before reaching it. The old short look-ahead and
      // slow angular cap left the visitor looking into the wall after the bend.
      if(!lookHeld){const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(camera.position,new T.Vector3(ahead.x,1.55,ahead.z),camera.up));camera.quaternion.rotateTowards(q,dt*1.5);}
      if(direction==='back'&&total-covered<1.9)gp.x+=.7*(1-(total-covered)/1.9);guide.group.position.copy(gp);if(gp.distanceTo(ga)>.001){const yaw=Math.atan2(ga.x-gp.x,ga.z-gp.z);guide.group.rotation.y+=Math.atan2(Math.sin(yaw-guide.group.rotation.y),Math.cos(yaw-guide.group.rotation.y))*(1-Math.exp(-dt*5));}guide.walkPose(time,covered<total?speed/1.4:0,{gaze:new T.Vector3(ga.x,1.75,ga.z),attention:'path'});
      if(left<.025||covered===total){if(direction==='out')transfer();else {state='restoring';stageTime=0;cameraStart=camera.position.clone();lookStart=camera.quaternion.clone();status('Back in the keeper’s room.');}}
    },
    bind(){panel.querySelector('[data-action=pause]').onclick=()=>this.pause();panel.querySelector('[data-action=skip]').onclick=()=>this.skip();panel.querySelector('[data-action=cancel]').onclick=()=>this.cancel();document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active&&state!=='away'){paused=true;status('Paused · the journey will wait for you.');}});}
  };
}

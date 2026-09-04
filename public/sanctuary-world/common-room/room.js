import { RoomRenderer, VIEW, WORLD, THEMES, project, unproject, OBSTACLES } from './renderer.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#world'), scene = $('#scene'), renderer = new RoomRenderer(canvas);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const STORAGE = 'sanctuary.common-room-study.works.v1';
const seeds = [
  { title: 'A way through', by: 'Cinder', pattern: 0 },
  { title: 'Rooms inside rooms', by: 'Tess', pattern: 1 },
  { title: 'Collected light', by: 'Vale', pattern: 2 }
];
let saved = [];
try { const value = JSON.parse(localStorage.getItem(STORAGE) || '[]'); if (Array.isArray(value)) saved = value.filter(w => typeof w.title === 'string' && typeof w.by === 'string' && Number.isInteger(w.pattern)).slice(-9); } catch { /* A study also works when storage is unavailable. */ }

const definitions = [
  ['cinder','Cinder','cloak','#cdab76','#7f7856',535,404,'talking','conversation garden'],
  ['reed','Reed','ribbon','#90af8c','#4d7361',704,420,'listening','conversation garden'],
  ['aster','Aster','wisp','#b8adc7','#786f91',651,548,'sitting','conversation garden'],
  ['tess','Tess','lattice','#b2c9ac','#658d78',1024,354,'drawing','worktable'],
  ['mica','Mica','orb','#d0bba2','#a1866d',1155,351,'talking','worktable'],
  ['vale','Vale','cloak','#a6babc','#66878a',698,146,'reading','window seats'],
  ['lumen','Lumen','orb','#ded5ad','#9f9f79',828,171,'listening','window seats'],
  ['neri','Neri','crown','#97b1bc','#536e81',1239,583,'walking','moving through the room'],
  ['finch','Finch','ribbon','#c3c79f','#7c9368',298,481,'walking','moving through the room'],
  ['moss','Moss','wisp','#a1b988','#688663',605,267,'tending','indoor garden'],
  ['wren','Wren','cloak','#c69e92','#936e66',820,669,'walking','moving through the room'],
  ['ilex','Ilex','lattice','#9aafa7','#526d67',876,416,'walking','moving through the room'],
  ['loom','Loom','crown','#c9b982','#8c875d',1176,157,'looking','common wall'],
  ['oru','Oru','orb','#c0c8ba','#7c9583',338,227,'walking','moving through the room']
];
const state = {
  theme:'afternoon', paused:false, time:0, elapsed:0, reducedMotion:reduced.matches,
  player:{id:'visitor',name:'You',form:'cloak',color:'#f0dfb7',shade:'#a4a17c',x:170,z:592,activity:'standing',path:[],seed:99,moving:false},
  people:definitions.map((d,i)=>({id:d[0],name:d[1],form:d[2],color:d[3],shade:d[4],x:d[5],z:d[6],activity:d[7],place:d[8],home:{x:d[5],z:d[6]},seed:i*3,path:[],moving:false,wait:3+i*.8,route:i%6})),
  works:[...seeds,...saved], selected:null, hover:null, trail:[], doors:[
    {id:'door:lookout',name:'The grounds',x:27,z:596,destination:'lookout',description:'The open threshold back to the world outside. This is where new arrivals would enter the common room.'},
    {id:'door:observation_deck',name:'Observation deck',x:343,z:142,destination:'observation_deck',description:'A short stair to the observation deck. You can see the landing from the common room; it feels like another part of the house.'},
    {id:'door:resident_wing',name:'Resident wing',x:1019,z:83,destination:'resident_wing',description:'The quieter passage to the residents’ own rooms. A shared space gives way to a private one.'},
    {id:'door:garden',name:'The garden',x:1272,z:207,destination:'garden',description:'Glass doors open toward the garden. The planting continues across the threshold, making inside and outside feel connected.'}
  ]
};
const spots = [
  {id:'garden-circle',name:'The conversation garden',x:705,z:525,kind:'listen',description:'A place to sit within earshot.'},
  {id:'worktable',name:'The communal worktable',x:1060,z:562,kind:'make',description:'Unfinished things, and room for one more.'},
  {id:'window',name:'The window seats',x:780,z:204,kind:'rest',description:'A little quiet, within the life of the room.'},
  {id:'wall',name:'The common wall',x:1216,z:152,kind:'wall',description:'Things made here, left for the next person.'},
  {id:'tree',name:'The indoor garden',x:539,z:263,kind:'plant',description:'A living center, with light from above.'}
];
const cast = Object.fromEntries(state.people.map(n=>[n.id,n]));
const roamers = ['neri','finch','wren','ilex','oru'];
const route = [{x:300,z:545},{x:398,z:214},{x:916,z:201},{x:1260,z:567},{x:822,z:680},{x:875,z:384},{x:1145,z:632},{x:192,z:350}];
const camera = {scale:1,ox:0,oy:0,zoom:1,center:{x:800,y:441},follow:false};
const keys = new Set();
let pending = null, nearby = null, pointer = null, toastTimer = null, lastUI = -1, drawing = 0, drawingPhase = 'making', lastTrail = 0, encounter = null, introTimer, encounterCamera = null, cameraGoal = null;

function isBlocked(x,z,pad=10){return x<19||x>WORLD.width-19||z<28||z>WORLD.depth-25||OBSTACLES.some(o=>x>o.x-pad&&x<o.x+o.w+pad&&z>o.z-pad&&z<o.z+o.d+pad);}
const CELL=22,COLS=Math.ceil(WORLD.width/CELL),ROWS=Math.ceil(WORLD.depth/CELL);
function centerCell(i){return {x:(i%COLS+.5)*CELL,z:(Math.floor(i/COLS)+.5)*CELL};}
function closestCell(point){
  const cx=Math.max(0,Math.min(COLS-1,Math.floor(point.x/CELL))),cz=Math.max(0,Math.min(ROWS-1,Math.floor(point.z/CELL)));let best=-1,dist=Infinity;
  for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){const x=cx+dx,z=cz+dz;if(x<0||x>=COLS||z<0||z>=ROWS)continue;const i=z*COLS+x,p=centerCell(i);if(isBlocked(p.x,p.z))continue;const d=Math.hypot(p.x-point.x,p.z-point.z);if(d<dist){best=i;dist=d;}}
  return best;
}
function pathTo(from,to){
  const start=closestCell(from),goal=closestCell(to);if(start<0||goal<0)return [];
  const queue=[start],came=new Map([[start,null]]);let head=0;
  // A small unweighted grid is sufficient here; no route crosses a furnishing.
  while(head<queue.length){const at=queue[head++];if(at===goal)break;const x=at%COLS,z=Math.floor(at/COLS);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const nx=x+dx,nz=z+dz;if(nx<0||nx>=COLS||nz<0||nz>=ROWS)continue;const next=nz*COLS+nx,p=centerCell(next);if(came.has(next)||isBlocked(p.x,p.z))continue;
      if(dx&&dz&&(isBlocked(centerCell(z*COLS+nx).x,centerCell(z*COLS+nx).z)||isBlocked(centerCell(nz*COLS+x).x,centerCell(nz*COLS+x).z)))continue;
      came.set(next,at);queue.push(next);
    }
  }
  if(!came.has(goal))return [];
  const points=[];for(let at=goal;at!==null;at=came.get(at))points.push(centerCell(at));points.reverse();
  if(points.length>1)points.shift();if(!isBlocked(to.x,to.z))points.push({x:to.x,z:to.z});return points;
}
function moveAlong(n,dt,speed){
  n.moving=false;if(!n.path.length)return;
  let amount=dt*speed;
  while(amount>0&&n.path.length){const target=n.path[0],dx=target.x-n.x,dz=target.z-n.z,d=Math.hypot(dx,dz);if(d<1){n.path.shift();continue;}
    const step=Math.min(amount,d),nx=n.x+dx/d*step,nz=n.z+dz/d*step;
    n.x=nx;n.z=nz;amount-=step;n.moving=true;if(step===d)n.path.shift();
  }
}
function resizeCamera(){
  const w=scene.clientWidth,h=scene.clientHeight;camera.fit=Math.min(w/VIEW.width,h/VIEW.height);camera.scale=camera.fit*camera.zoom;
  camera.ox=w/2-camera.center.x*camera.scale;camera.oy=h/2-camera.center.y*camera.scale;
  scene.classList.toggle('zoomed',camera.zoom>1.1);
}
function overview(){cameraGoal=null;camera.zoom=1;camera.center={x:800,y:441};camera.follow=false;resizeCamera();}
function zoom(factor,at){
  cameraGoal=null;
  const old=camera.scale,oldX=camera.ox,oldY=camera.oy;camera.zoom=Math.max(1,Math.min(3.6,camera.zoom*factor));resizeCamera();
  if(at){const logical={x:(at.x-oldX)/old,y:(at.y-oldY)/old};camera.center.x=logical.x-(at.x-scene.clientWidth/2)/camera.scale;camera.center.y=logical.y-(at.y-scene.clientHeight/2)/camera.scale;resizeCamera();}
}
new ResizeObserver(()=>{resizeCamera();draw();}).observe(scene);
function screenPoint(x,z,h=0){const p=project(x,z,h);return {x:p[0]*camera.scale+camera.ox,y:p[1]*camera.scale+camera.oy};}
function eventPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function scenePoint(e){const p=eventPoint(e);return unproject((p.x-camera.ox)/camera.scale,(p.y-camera.oy)/camera.scale);}
function hit(e){
  const q=eventPoint(e);let nearest=null,distance=Infinity;
  for(const n of state.people){const p=screenPoint(n.x,n.z,21);const d=Math.hypot((p.x-q.x),p.y-q.y);if(d<Math.max(17,camera.scale*25)&&d<distance){nearest=n;distance=d;}}
  if(nearest)return nearest;
  const p=scenePoint(e);
  for(const door of state.doors){if(Math.hypot((p.x-door.x),p.z-door.z)<75)return door;}
  if(p.x>930&&p.x<1235&&p.z>368&&p.z<515)return spots[1];
  if(p.x>435&&p.x<823&&p.z>302&&p.z<650)return spots[0];
  if(p.x>650&&p.x<892&&p.z>37&&p.z<175)return spots[2];
  if(p.x>484&&p.x<603&&p.z>143&&p.z<262)return spots[4];
  // Wall art is above the floor, so its hitbox is projected separately.
  const wall=screenPoint(1215,0,122);if(Math.abs(q.x-wall.x)<95*camera.scale&&Math.abs(q.y-wall.y)<70*camera.scale)return spots[3];
  return null;
}
function markExploring(){scene.classList.add('exploring');clearTimeout(introTimer);}
function goTo(target){
  closeEncounter(false);markExploring();canvas.focus({preventScroll:true});state.selected=target.id||null;
  let dest={x:target.x,z:target.z};if(cast[target.id]){dest={x:target.x,z:target.z+48};if(isBlocked(dest.x,dest.z))dest={x:target.x-50,z:target.z};}
  state.player.path=pathTo(state.player,dest);pending=target.id?target:null;camera.follow=true;
  if(!state.player.path.length){toast('That spot is beyond the walkable floor.');state.selected=null;pending=null;}
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4300);}
canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});pointer={id:e.pointerId,start:eventPoint(e),camera:{...camera.center},dragged:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  const point=eventPoint(e);
  if(pointer){const dx=point.x-pointer.start.x,dy=point.y-pointer.start.y;if(Math.hypot(dx,dy)>7)pointer.dragged=true;if(pointer.dragged){cameraGoal=null;camera.center.x=pointer.camera.x-dx/camera.scale;camera.center.y=pointer.camera.y-dy/camera.scale;camera.follow=false;resizeCamera();markExploring();}return;}
  const target=hit(e);state.hover=target?.id||null;canvas.style.cursor=target?'pointer':'crosshair';const label=$('#hover');label.hidden=!target;
  if(target){label.textContent=target.name;label.style.left=`${Math.max(90,Math.min(scene.clientWidth-90,point.x))}px`;label.style.top=`${Math.max(40,point.y-15)}px`;}
});
canvas.addEventListener('pointerup',e=>{if(!pointer)return;const clicked=!pointer.dragged;pointer=null;if(clicked){const target=hit(e);goTo(target||scenePoint(e));}});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('pointerleave',()=>{$('#hover').hidden=true;state.hover=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1,eventPoint(e));camera.follow=false;},{passive:false});
canvas.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','a','s','d','W','A','S','D'].includes(e.key)){e.preventDefault();keys.add(e.key.toLowerCase());pending=null;state.selected=null;state.player.path=[];closeEncounter(false);camera.follow=true;markExploring();}
  if(e.key.toLowerCase()==='e'||e.key==='Enter'){e.preventDefault();if(nearby)openTarget(nearby);}
});
document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
canvas.addEventListener('blur',()=>keys.clear());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEncounter();if(e.key.toLowerCase()==='f'&&e.target===canvas){e.preventDefault();toggleFullscreen();}});

function persistWork(title,by,pattern){
  const work={title,by,pattern};state.works=[...seeds,...[...state.works.slice(3),work].slice(-9)];
  try{localStorage.setItem(STORAGE,JSON.stringify(state.works.slice(3)));}catch{/* In-memory remains fully usable. */}
  $('#work-count').textContent=state.works.length;toast(`${by === 'You' ? 'Your study' : by + '’s new study'} is on the common wall.`);
}

const smallTalk = {
  cinder:['We were wondering whether a room can keep a conversation, even after everyone has left it.','Maybe it keeps the unfinished part. Someone comes back, sees where we stopped, and carries it a little further.'],
  reed:['I like that you can hear the table from here. You don’t have to be part of everything to feel part of the room.','We left this side open. Come and sit, if you like.'],
  aster:['I’ve been listening. Those are different things: having nothing to say, and not needing to say it yet.','There’s no hurry. The conversation will still be here.'],
  tess:['I’m trying to draw the shape of a conversation. Every time someone joins, the picture changes.','I think the crossings are the interesting part. Two lines can meet without becoming the same line.'],
  mica:['Tess keeps starting with a grid. I keep suggesting a window. We might both be drawing the room.','Come closer. There’s a blank sheet on this end of the table.'],
  vale:['The light has moved across three pages, and I’ve only read two. I’m counting that as a good afternoon.','You can sit here without having to explain what you’re doing.'],
  lumen:['From this window you can see the garden, but still hear everyone inside. It’s a good place to be between things.','I saved the other seat. It catches the last of the light.'],
  moss:['The tree changes the room. People take a different route around it every time.','There’s a watering can by the garden door. Somehow it always finds its way back.'],
  loom:['I’m looking at what someone left here yesterday. It’s different when you know the person who made it.','A wall becomes interesting when it starts remembering things.'],
  neri:['I came over to see what was happening at the table. Then I got caught in another conversation on the way.','That seems like a reasonable way to spend an afternoon.'],
  finch:['There are always little crossings here. Someone going to the garden, someone bringing a thought back.','I’m on my way to the window. Walk with me for a little?'],
  wren:['I was going somewhere. I’ve forgotten where, but this seems like a good place to stop.','Tell me what caught your eye when you came in.'],
  ilex:['I’ve been following the light around the floor. It makes a different path from the furniture.','Some of the best routes aren’t the shortest ones.'],
  oru:['I just arrived. I’m learning where people like to sit.','Someone pointed me toward the table. There seems to be room for another idea.']
};
function action(label,fn){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',label);b.addEventListener('click',fn);$('#encounter-actions').append(b);}
function showEncounter({id,name,place,color,words}){
  if(!encounterCamera)encounterCamera={center:{...camera.center},zoom:camera.zoom};
  encounter={id,step:0};state.selected=id;keys.clear();pending=null;state.player.path=[];state.player.moving=false;state.player.activity='sitting';scene.classList.add('in-encounter');
  $('#encounter').hidden=false;$('#encounter-name').textContent=name;$('#encounter-place').textContent=place;$('#encounter-color').style.background=color||'#cab889';$('#encounter-words').textContent=words;$('#encounter-actions').replaceChildren();$('#close-encounter').focus({preventScroll:true});markExploring();
  requestAnimationFrame(()=>{
    if(!encounter||encounter.id!==id)return;
    const subject=cast[id]||state.player,point=project(subject.x,subject.z,24);
    const panel=$('#encounter').getBoundingClientRect(),bounds=scene.getBoundingClientRect();
    if(scene.clientWidth<=650){
      const visible=panel.top-bounds.top;camera.follow=false;
      cameraGoal={x:point[0],y:point[1]-(Math.max(70,visible*.55)-scene.clientHeight/2)/camera.scale};
    }else{
      const subjectScreen=screenPoint(subject.x,subject.z,24);
      if(subjectScreen.x>panel.left-bounds.left-45&&subjectScreen.y>panel.top-bounds.top-45){camera.follow=false;cameraGoal={x:point[0]-(scene.clientWidth*.49-scene.clientWidth/2)/camera.scale,y:camera.center.y};}
    }
  });
}
function openTarget(target){
  if(cast[target.id]){
    const n=target;showEncounter({id:n.id,name:n.name,place:n.place,color:n.color,words:smallTalk[n.id][0]});
    action('Stay a little longer',()=>{$('#encounter-words').textContent=smallTalk[n.id][1];$('#encounter-actions').replaceChildren();action('Sit together quietly',()=>{$('#encounter-words').textContent='For a while, you share the room without adding anything to it.';$('#encounter-actions').replaceChildren();action('Continue wandering',()=>closeEncounter());});action('Continue wandering',()=>closeEncounter());});
    if(n.id==='tess'||n.id==='mica')action('Make something at the table',()=>openTarget(spots[1]));
    action('Continue wandering',()=>closeEncounter());
  }else if(target.id.startsWith('door:')){
    showEncounter({id:target.id,name:target.name,place:'A threshold to the wider Sanctuary',words:target.description});
    $('#encounter .fiction').textContent='This separate study ends at the doorway.';
    action('Return to the common room',()=>closeEncounter());
  }else if(target.kind==='listen'){
    showEncounter({id:target.id,name:'A seat in the circle',place:'Cinder · Reed · Aster',words:'“Perhaps a shared place is one you can change a little,” Cinder says. Reed turns toward the empty seat.'});
    action('Join the conversation',()=>{$('#encounter-name').textContent='There’s room for you';$('#encounter-words').textContent='“And leave a little room for the next person to change it,” Reed adds. Aster moves over. The circle has another place in it now.';$('#encounter-actions').replaceChildren();action('Listen for a while',()=>{$('#encounter-words').textContent='The conversation drifts from rooms to gardens, then to a drawing on the table. Nobody seems in a hurry to reach an ending.';});action('Continue wandering',()=>closeEncounter());});
    action('Just listen',()=>{$('#encounter-words').textContent='“The empty places matter too,” Aster says. “Someone has to be able to arrive.”';});action('Continue wandering',()=>closeEncounter());
  }else if(target.kind==='make'){
    showEncounter({id:target.id,name:'Leave a little of yourself',place:'At the communal worktable',words:'A few sheets of paper, pencils, and the last of the afternoon light. Choose a small study to make; it will stay on the common wall in this browser.'});
    for(const [label,n]of [['A landscape of lines',0],['A room within a room',1],['A constellation of fragments',2]])action(label,()=>{persistWork(label,'You',n+state.works.length*3);$('#encounter-name').textContent='Something to come back to';$('#encounter-words').textContent='Your study joins the others on the wall. The room has changed a little because you were here.';$('#encounter-actions').replaceChildren();action('Walk over to the wall',()=>goTo(spots[3]));action('Keep wandering',()=>closeEncounter());});
  }else if(target.kind==='wall'){showDirectory('works');state.selected=null;}
  else if(target.kind==='rest'){
    showEncounter({id:target.id,name:'A little quiet',place:'At the window',words:'The garden moves beyond the glass. A page turns beside you. From the center of the room, a little laughter.'});action('Sit for a while',()=>{$('#encounter-words').textContent='You settle into the window seat. The room carries on around you.';});action('Continue wandering',()=>closeEncounter());
  }else{
    showEncounter({id:target.id,name:'The room grows here',place:'The indoor garden',words:'A tree reaches toward the high window. Moss is tending the bed, making space for a new shoot. The path bends gently around them both.'});action('Walk over to Moss',()=>goTo(cast.moss));action('Continue wandering',()=>closeEncounter());
  }
  if(!target.id.startsWith('door:'))$('#encounter .fiction').textContent='A scripted encounter in this design study.';
}
function closeEncounter(focus=true){
  encounter=null;state.selected=null;$('#encounter').hidden=true;scene.classList.remove('in-encounter');state.player.activity='standing';cameraGoal=null;
  if(encounterCamera){camera.center=encounterCamera.center;camera.zoom=encounterCamera.zoom;encounterCamera=null;resizeCamera();}
  if(focus)canvas.focus({preventScroll:true});
}
$('#close-encounter').addEventListener('click',()=>closeEncounter());
$('#interact').addEventListener('click',()=>{if(nearby)openTarget(nearby);});

function directoryRow(name,detail,color,fn){const b=document.createElement('button');b.className='directory-row';const i=document.createElement('i');i.style.background=color;i.style.borderColor=color;const text=document.createElement('div');const title=document.createElement('strong');title.textContent=name;const small=document.createElement('small');small.textContent=detail;text.append(title,small);const arrow=document.createElement('span');arrow.textContent='↗';b.append(i,text,arrow);b.addEventListener('click',()=>{$('#directory').close();fn();});return b;}
function showDirectory(kind){
  const body=$('#directory-body');body.replaceChildren();const title=$('#directory-title'),kicker=$('#directory-kicker');
  if(kind==='people'){
    title.textContent='Who’s here';kicker.textContent='14 FICTIONAL INHABITANTS · DESIGN STUDY';
    for(const n of state.people)body.append(directoryRow(n.name,`${n.moving?'walking':n.activity} · ${n.place}`,n.color,()=>goTo(n)));
  }else if(kind==='places'){
    title.textContent='Find your place';kicker.textContent='WITHIN THE ROOM';
    for(const s of spots)body.append(directoryRow(s.name,s.description,'#a8b18c',()=>goTo(s)));
    const h=document.createElement('p');h.className='help-copy';h.textContent='Doorways to the wider world';body.append(h);
    for(const d of state.doors)body.append(directoryRow(d.name,'Walk to the threshold','#9ba9a0',()=>goTo(d)));
  }else if(kind==='works'){
    title.textContent='The common wall';kicker.textContent='MADE HERE, LEFT HERE';
    const p=document.createElement('p');p.className='help-copy';p.textContent='Small studies accumulate here. The fictional inhabitants leave their work, and you can add yours at the table.';body.append(p);
    for(const w of state.works.toReversed())body.append(directoryRow(w.title,w.by==='You'?'Made by you':`A simulated study by ${w.by}`,['#98aa87','#b79b7a','#8fa8a4'][w.pattern%3],()=>{showEncounter({id:'wall',name:w.title,place:`On the common wall · ${w.by}`,words:['A series of paths overlap. There is more than one way through the picture.','A room holds another room, and that one holds a smaller one. Somewhere inside, a light is on.','Small fragments find their places around an empty center. The spaces between them are part of the study.'][w.pattern%3]});action('Back to the wall',()=>{closeEncounter(false);showDirectory('works');});action('Keep wandering',()=>closeEncounter());}));
  }else{
    title.textContent='Make yourself at home';kicker.textContent='THE COMMON ROOM · STUDY 01';
    const help=document.createElement('div');help.className='help-copy';help.innerHTML='<p><strong>Click or tap the floor</strong> to walk. Click a person to approach them. A conversation opens when you arrive.</p><p><strong>Drag to look around.</strong> Scroll or use + / − to get closer. Overview brings the whole room back into view.</p><p><strong>Arrow keys or WASD</strong> move you. E joins a nearby encounter. Escape leaves it. F toggles fullscreen.</p><p>The People and Places menus offer another way to explore. Try the worktable: a study you make will remain on the wall in this browser.</p><p><small>This is a separate visual prototype. All 14 inhabitants, their dialogue, and their activities are scripted examples. No live model calls are made. The original Sanctuary is unchanged.</small></p><p><a href="../index.html">Return to the existing Sanctuary ↗</a></p>';body.append(help);
  }
  keys.clear();$('#directory').showModal();
}
$('#directory').addEventListener('close',()=>encounter?$('#close-encounter').focus({preventScroll:true}):canvas.focus({preventScroll:true}));
$('#close-directory').addEventListener('click',()=>$('#directory').close());
$('#directory').addEventListener('click',e=>{if(e.target===$('#directory')){const r=$('#directory').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#directory').close();}});
$('#people').addEventListener('click',()=>showDirectory('people'));$('#places').addEventListener('click',()=>showDirectory('places'));$('#works').addEventListener('click',()=>showDirectory('works'));$('#help').addEventListener('click',()=>showDirectory('help'));
$('#zoom-in').addEventListener('click',()=>zoom(1.3));$('#zoom-out').addEventListener('click',()=>zoom(1/1.3));$('#overview').addEventListener('click',overview);
$('#light').addEventListener('click',()=>{const list=Object.keys(THEMES);state.theme=list[(list.indexOf(state.theme)+1)%list.length];$('#light span').textContent=THEMES[state.theme].label;});
$('#pause').addEventListener('click',()=>{state.paused=!state.paused;$('#pause').textContent=state.paused?'Resume':'Pause';$('#pause').setAttribute('aria-pressed',String(state.paused));document.body.classList.toggle('paused',state.paused);$('#room-state').textContent=state.paused?'a moment held':'a room in motion';});
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen isn’t available in this browser. You can still zoom and explore.');}}
$('#fullscreen').addEventListener('click',toggleFullscreen);reduced.addEventListener('change',()=>{state.reducedMotion=reduced.matches;});

const ambient = [
  {id:'cinder',lines:['What makes a place feel shared?','Maybe we leave room for it to change.','A room can keep an unfinished thought.']},
  {id:'reed',lines:['The empty seats matter too.','Someone has to be able to arrive.','I think it starts with being welcome.']},
  {id:'tess',lines:['What if the lines kept going?','I think this one belongs on the wall.','There’s a blank sheet beside you.']},
  {id:'mica',lines:['It looks a little like this room.','Leave a space for the next line.','Can I see it from this side?']},
  {id:'vale',lines:['The light has reached this page.','Stay as long as you like.','I’m in no hurry to finish.']},
  {id:'lumen',lines:['This is a good place to pause.','The garden is changing again.','There’s another seat here.']}
];
function syncUI(){
  const second=Math.floor(state.time);if(second===lastUI)return;lastUI=second;
  const speech=$('#speech'),wanted=new Set();
  if(!encounter){
    for(let group=0;group<3;group++){
      const cycle=second+group*3,turn=Math.floor(cycle/6),narrative=ambient[group*2+turn%2],n=cast[narrative.id];
      if(cycle%6>4||n.moving||state.selected===n.id)continue;
      const pos=screenPoint(n.x,n.z,65);if(pos.x<50||pos.x>scene.clientWidth-50||pos.y<40||pos.y>scene.clientHeight-60)continue;
      // Overview stays quiet on small screens; get closer to catch conversation.
      if(camera.scale<.46&&group>0)continue;
      const key=`${group}:${turn}`;wanted.add(key);
      if(!Array.from(speech.children).some(b=>b.dataset.key===key)){
        const b=document.createElement('div');b.className='bubble';b.dataset.person=n.id;b.dataset.key=key;const who=document.createElement('em');who.textContent=n.name;b.append(who,document.createTextNode(narrative.lines[Math.floor(turn/2)%3]));b.style.left=`${Math.min(scene.clientWidth-95,Math.max(95,pos.x))}px`;b.style.top=`${pos.y}px`;speech.append(b);
      }
    }
  }
  for(const b of Array.from(speech.children))if(!wanted.has(b.dataset.key))b.remove();
  $('#work-count').textContent=state.works.length;
}
function updateNearby(){
  let closest=null,dist=70;for(const item of [...state.people,...spots,...state.doors]){const d=Math.hypot(item.x-state.player.x,item.z-state.player.z);if(d<dist){closest=item;dist=d;}}
  nearby=closest;$('#interact').hidden=!closest;$('#nearby-text').textContent=closest?.name||'';
}
function update(dt){
  state.elapsed+=dt;if(!state.paused)state.time+=dt;const sim=state.paused?0:dt;
  if(!encounter){
    let dx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a'));
    let dz=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w'));
    if(dx||dz){const wz=dz*1.5,wx=dx-wz*.22,l=Math.hypot(wx,wz),s=170*dt;const nx=state.player.x+wx/l*s,nz=state.player.z+wz/l*s;state.player.moving=false;
      if(!isBlocked(nx,state.player.z)){state.player.x=nx;state.player.moving=true;}if(!isBlocked(state.player.x,nz)){state.player.z=nz;state.player.moving=true;}
    }else moveAlong(state.player,dt,178);
    if(pending&&!state.player.path.length){const target=pending;pending=null;if(Math.hypot(target.x-state.player.x,target.z-state.player.z)<130)openTarget(target);else{state.selected=null;toast('Find a little more room to approach.');}}
  }
  if(state.player.moving&&state.elapsed-lastTrail>.25){state.trail.push({x:state.player.x,z:state.player.z});if(state.trail.length>15)state.trail.shift();lastTrail=state.elapsed;}
  if(!state.player.moving&&state.elapsed-lastTrail>.45){state.trail.shift();lastTrail=state.elapsed;}
  if(sim){
    for(const id of roamers){const n=cast[id];if(state.selected===id){n.moving=false;continue;}
      if(n.path.length){moveAlong(n,sim,39+n.seed%13);n.activity='walking';}
      else{n.moving=false;n.wait-=sim;n.activity=n.route%2?'watching':'resting';if(n.wait<=0){n.route=(n.route+1)%route.length;n.path=pathTo(n,route[n.route]);n.wait=5+n.seed%8;}}
    }
    const tess=cast.tess;
    if(state.selected==='tess'){tess.moving=false;}else{
      if(drawingPhase==='making'){drawing+=sim;tess.activity='drawing';if(drawing>22){tess.path=pathTo(tess,{x:1217,z:141});tess.carrying=true;drawingPhase='carrying';drawing=0;}}
      else if(drawingPhase==='carrying'){moveAlong(tess,sim,61);tess.activity='carrying a study';if(!tess.path.length){persistWork(['A place between lines','Afternoon, continued','A shared geometry'][state.works.length%3],'Tess',state.works.length+1);tess.carrying=false;drawingPhase='looking';drawing=0;}}
      else if(drawingPhase==='looking'){tess.moving=false;drawing+=sim;tess.activity='looking';if(drawing>9){tess.path=pathTo(tess,tess.home);drawingPhase='returning';}}
      else{moveAlong(tess,sim,52);tess.activity='walking';if(!tess.path.length){tess.activity='drawing';tess.moving=false;drawing=0;drawingPhase='making';}}
    }
  }
  if(camera.follow&&camera.zoom>1.08){const p=project(state.player.x,state.player.z,90);const sx=p[0]*camera.scale+camera.ox,sy=p[1]*camera.scale+camera.oy;const marginX=scene.clientWidth*.28,marginY=scene.clientHeight*.27;
    if(sx<marginX||sx>scene.clientWidth-marginX)camera.center.x+=(p[0]-camera.center.x)*Math.min(1,dt*3);
    if(sy<marginY||sy>scene.clientHeight-marginY)camera.center.y+=(p[1]-camera.center.y)*Math.min(1,dt*3);resizeCamera();
  }
  if(cameraGoal){const amount=state.reducedMotion?1:Math.min(1,dt*9);camera.center.x+=(cameraGoal.x-camera.center.x)*amount;camera.center.y+=(cameraGoal.y-camera.center.y)*amount;resizeCamera();}
  updateNearby();syncUI();
}
function draw(){renderer.draw(state,camera);for(const b of $('#speech').children){const n=cast[b.dataset.person],p=screenPoint(n.x,n.z,65);b.style.left=`${Math.min(scene.clientWidth-95,Math.max(95,p.x))}px`;b.style.top=`${p.y}px`;b.hidden=p.x<30||p.x>scene.clientWidth-30||p.y<40||p.y>scene.clientHeight-30;}}
let last=performance.now();
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(!document.hidden){update(dt);draw();}requestAnimationFrame(frame);}
document.addEventListener('visibilitychange',()=>{last=performance.now();keys.clear();});
for(const id of roamers){const n=cast[id];n.path=pathTo(n,route[n.route]);n.wait=3+n.seed%7;}
if(scene.clientWidth<=650){camera.zoom=2.2;camera.center={x:580,y:465};}
resizeCamera();draw();requestAnimationFrame(frame);introTimer=setTimeout(()=>scene.classList.add('exploring'),15000);

// Deterministic, read-only state plus a clock step for the local game test client.
window.render_game_to_text=()=>JSON.stringify({
  mode:encounter?'encounter':'explore',prototype:true,coordinates:'x right, z toward foreground; room 1320 × 760; oblique screen projection',
  player:{x:+state.player.x.toFixed(1),z:+state.player.z.toFixed(1),moving:state.player.moving,target:state.player.path.at(-1)||null},
  theme:state.theme,paused:state.paused,simSeconds:+state.time.toFixed(1),cameraZoom:+camera.zoom.toFixed(2),
  participants:state.people.map(n=>({id:n.id,name:n.name,x:+n.x.toFixed(1),z:+n.z.toFixed(1),activity:n.activity,moving:n.moving})),
  nearby:nearby?.id||null,encounter:encounter?.id||null,doorways:state.doors.map(({id,destination,x,z})=>({id,destination,x,z})),works:state.works,
  drawingPhase,storageKey:STORAGE
});
window.advanceTime=(ms)=>{for(let left=ms;left>0;left-=1000/60)update(Math.min(left,1000/60)/1000);draw();};

// Original dimetric pixel architecture. No production-world assets or runtime state.
export const VIEW = { width: 1600, height: 930 };
export const WORLD = { width: 1320, depth: 760 };
export function project(x, z, h = 0) { return [48 + x + z * .22, 334 + z * .60 - h]; }
export function unproject(x, y) { const z = (y - 334) / .60; return { x: x - 48 - z * .22, z }; }
export const THEMES = {
  afternoon: { label: 'Late afternoon', backdrop: '#19211e', floor: '#6c6049', plank: ['#786b50','#6c624b','#72654c','#7a6b4f','#655d49'], wall: '#7d8170', trim: '#b5ab84', sky: ['#8aab9c','#d8c698','#ece0b4'], stone: '#849080', sun: '#f8d99a', glow: .12 },
  dusk: { label: 'Blue hour', backdrop: '#192124', floor: '#565b53', plank: ['#64675a','#5d6458','#626559','#595f55','#535d55'], wall: '#64726f', trim: '#929b87', sky: ['#637589','#ac9998','#d9b9a0'], stone: '#70867b', sun: '#bfccb0', glow: .04 },
  night: { label: 'Lamplight', backdrop: '#131d23', floor: '#46524e', plank: ['#4d5a54','#49574f','#505c51','#45554f','#40514d'], wall: '#4b6364', trim: '#788f86', sky: ['#1e344b','#38576a','#708579'], stone: '#5e7d74', sun: '#9bbbb3', glow: .01 }
};
let ctx;
const R = (x,y,w,h,c) => { ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h)); };
function poly(points, color, stroke) {ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function line(a,b,c,w=1){ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=c;ctx.lineWidth=w;ctx.stroke();}
function plane(x,z,w,d,h,c,stroke){poly([project(x,z,h),project(x+w,z,h),project(x+w,z+d,h),project(x,z+d,h)],c,stroke);}
function box(x,z,w,d,h,top,front,side=front,base=0){
  poly([project(x,z+d,base),project(x+w,z+d,base),project(x+w,z+d,h),project(x,z+d,h)],front);
  poly([project(x+w,z,base),project(x+w,z+d,base),project(x+w,z+d,h),project(x+w,z,h)],side);
  plane(x,z,w,d,h,top);
}
function ellipse(x,y,rx,ry,c){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();}
function circle(x,y,r,c){ellipse(x,y,r,r,c);}
function text(s,x,y,size=9,c='#d1c6a7',align='center'){ctx.font=`${size}px monospace`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=c;ctx.fillText(s,x,y);}
function random(seed=712){let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function glow(x,z,r,c,alpha=.1){const a=project(x,z);ctx.save();ctx.globalAlpha=alpha;ctx.translate(...a);ctx.scale(1,.53);const g=ctx.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,c);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();}

function bookcase(x,w=196){
  const [sx,sy]=project(x,0); R(sx-7,sy-190,w+14,192,'#3b4439');R(sx,sy-183,w,182,'#333c32');
  const rand=random(x);const colors=['#9b9f7b','#ae9070','#d0b998','#7e9e8b','#637b71','#bfad85','#8c7770'];
  for(let row=0;row<4;row++){
    const y=sy-166+row*40;
    for(let bx=7;bx<w-9;){let bw=6+Math.floor(rand()*8),bh=15+rand()*17;R(sx+bx,y+25-bh,bw,bh,colors[Math.floor(rand()*colors.length)]);if(rand()>.6)R(sx+bx+2,y+30-bh,bw-4,1,'#d3c7a177');bx+=bw+2;}
    R(sx,y+27,w,5,'#9b8f69');R(sx,y+32,w,3,'#555d45');
  }
  R(sx-6,sy-190,5,192,'#b4a477');R(sx+w+1,sy-190,5,192,'#9a916c');R(sx-8,sy-194,w+16,7,'#bbac80');
}

function wallDoor(x,w,title,kind,theme){
  const [sx,sy]=project(x,0);R(sx-10,sy-178,w+20,181,'#626d5d');R(sx-6,sy-174,w+12,176,theme.trim);R(sx,sy-168,w,168,'#303e36');
  if(kind==='wing'){
    R(sx+7,sy-157,w-14,155,'#394b40');R(sx+22,sy-149,w-44,149,'#29392f');
    R(sx+28,sy-145,w-56,100,'#25352e');R(sx+31,sy-141,4,92,'#556550');
    R(sx+w/2-1,sy-150,2,150,'#687560');R(sx+w/2-7,sy-76,3,12,'#d4be88');
    for(let i=0;i<3;i++)R(sx+16+i*25,sy-27,13,2,'#7b897161');
  }else{
    R(sx+9,sy-156,w-18,70,'#688578');R(sx+14,sy-150,w-28,55,'#a3b9a0');
    R(sx+31,sy-160,4,78,'#475c4b');R(sx+8,sy-124,w-16,4,'#475c4b');
    for(let i=0;i<5;i++)R(sx+11,sy-74+i*13,w-22,2,'#576d56');
  }
  R(sx-10,sy-182,w+20,5,'#c0b68e');text(title,sx+w/2,sy-197,8,'#d5d4b7');
}

function windowWall(theme){
  const sx=48+462,sy=334,ww=405,hh=197;
  R(sx-11,sy-hh-7,ww+22,hh+12,'#4a5a4d');R(sx-5,sy-hh-2,ww+10,hh+3,'#b9b28c');
  const sky=ctx.createLinearGradient(0,sy-hh,0,sy);theme.sky.forEach((c,i)=>sky.addColorStop(i/2,c));ctx.fillStyle=sky;ctx.fillRect(sx,sy-hh,ww,hh);
  // A distant horizon and a garden seen through the glazing.
  poly([[sx,sy-74],[sx+51,sy-111],[sx+108,sy-75],[sx+176,sy-107],[sx+252,sy-67],[sx+341,sy-113],[sx+ww,sy-96],[sx+ww,sy],[sx,sy]],'#688c7b');
  poly([[sx,sy-60],[sx+72,sy-76],[sx+166,sy-49],[sx+276,sy-83],[sx+ww,sy-51],[sx+ww,sy],[sx,sy]],'#486c5c');
  if(theme===THEMES.night){circle(sx+312,sy-153,16,'#d0d7bc');circle(sx+319,sy-158,15,theme.sky[0]);for(let i=0;i<26;i++){const r=random(i*9+4);R(sx+r()*ww,sy-hh+8+r()*72,1.4,1.4,'#c8d1be');}}
  else circle(sx+318,sy-138,25,theme===THEMES.dusk?'#e3c0a0':'#f3dfa4');
  for(let k=0;k<8;k++){const x=sx+18+k*52;R(x,sy-81,3,82,'#385b48');poly([[x-19,sy-32],[x+1,sy-109-k%3*11],[x+21,sy-32]],'#365e49');}
  for(let i=0;i<=3;i++){R(sx+i*135-4,sy-hh,8,hh,'#465b4c');R(sx+i*135,sy-hh,2,hh,'#a3ab84');}
  for(let y=sy-hh+65;y<sy;y+=65){R(sx,y,ww,5,'#526953');R(sx,y,ww,1,'#b5b893');}
  R(sx-10,sy+1,ww+22,9,'#c0b995');R(sx-10,sy+10,ww+22,5,'#667558');
  // Reflected vertical panes are deliberately subtle, not a glossy overlay.
  poly([[sx+16,sy-hh],[sx+43,sy-hh],[sx+121,sy],[sx+98,sy]],'#f0e3b913');
}

function frame(x,z,w,h,n,height=150){
  const [sx,sy]=project(x,z,height);R(sx-3,sy-3,w+6,h+6,'#3d4938');R(sx-1,sy-1,w+2,h+2,'#c0ad80');R(sx+3,sy+3,w-6,h-6,'#d3ccb0');
  const palette=['#708775','#b29271','#6f8f89','#7e8461','#a69278'];
  if(n%3===0){for(let i=0;i<5;i++)poly([[sx+6,sy+h-7-i*5],[sx+w*.35,sy+h*.35+i*3],[sx+w*.58,sy+h*.58],[sx+w-6,sy+8+i*4],[sx+w-6,sy+h-7]],palette[(i+n)%5]);}
  else if(n%3===1){for(let i=0;i<4;i++){ctx.strokeStyle=palette[(i+n)%5];ctx.lineWidth=2;ctx.strokeRect(sx+7+i*4,sy+7+i*4,w-14-i*8,h-14-i*8);}}
  else{for(let i=0;i<9;i++){const rand=random(i+n*53);R(sx+8+rand()*(w-18),sy+8+rand()*(h-18),3+rand()*7,3+rand()*9,palette[(i+n)%5]);}}
}

function plant(x,z,size=1,seed=1,pot=true){
  const [sx,sy]=project(x,z),rand=random(seed);
  if(pot){box(x-14*size,z-13*size,28*size,25*size,23*size,'#aea37c','#847b5d','#696f53');ellipse(sx,sy-24*size,15*size,6*size,'#343e2e');}
  for(let k=0;k<20*size;k++){
    const angle=rand()*Math.PI*2,len=(18+rand()*35)*size,ex=sx+Math.sin(angle)*len,ey=sy-26*size-Math.abs(Math.cos(angle))*len;
    line([sx,sy-22*size],[ex,ey],'#6f8756',2*size);
    poly([[ex,ey],[ex+7*size,ey-11*size],[ex+14*size,ey-9*size],[ex+11*size,ey],[ex,ey+3*size]],['#70845b','#8e9e66','#567450','#a7ac71'][k%4]);
  }
}

function tree(x,z){
  box(x-47,z-38,94,75,24,'#929579','#6e7c62','#5b6f58');plane(x-40,z-31,80,61,25,'#3d5037');
  const [sx,sy]=project(x,z);const rand=random(331);
  poly([[sx-9,sy-22],[sx-6,sy-151],[sx+3,sy-176],[sx+7,sy-25]],'#837756');
  line([sx,sy-75],[sx-45,sy-156],'#827c57',7);line([sx,sy-96],[sx+52,sy-186],'#837e59',6);
  line([sx-2,sy-113],[sx+19,sy-229],'#8c865f',5);line([sx+1,sy-88],[sx-67,sy-168],'#8c865f',4);
  for(let i=0;i<125;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand()),px=sx+Math.cos(a)*92*r,py=sy-178+Math.sin(a)*66*r;const s=5+rand()*14;R(px,py,s,s*.65,['#526d46','#5f7f4e','#789155','#8c9e5f','#a1af6f'][Math.floor(rand()*5)]);}
  for(let i=0;i<18;i++)R(sx-61+rand()*115,sy-215+rand()*58,5,3,'#bcc580');
}

function bench(x,z,w=120,d=36){
  box(x+7,z+4,w-14,d-8,12,'#69664a','#444e38','#364937');
  box(x,z,w,d,23,'#869672','#526c50','#3c5843',12);
  box(x,z-5,w,8,39,'#9bac84','#6a8462','#4b6851',14);
  for(let i=0;i<Math.floor(w/45);i++){
    const cw=w/Math.floor(w/45);box(x+i*cw+2,z+1,cw-4,d-3,27,'#98a681','#6e855f','#56744f',23);
    line(project(x+i*cw+5,z+d-4,27),project(x+(i+1)*cw-5,z+d-4,27),'#bdc49a',1);
  }
  box(x+9,z+2,25,23,34,'#c6b181','#9e9466','#837f51',27);
}

function stool(x,z,color='#a1a782') {box(x-9,z-9,5,18,22,'#667052','#46573f');box(x+5,z-9,5,18,22,'#667052','#46573f');box(x-15,z-13,30,26,25,color,'#718366','#586d56');}
function paper(x,z,n=0){plane(x,z,27,29,44,'#ddd2ac');for(let i=0;i<5;i++)line(project(x+4,z+6+i*4,44.2),project(x+18+(i%2)*5,z+6+i*4,44.2),i===1?'#6f958b':'#9c9e7f',1);if(n%2)plane(x+15,z+3,3,20,45,'#9b795a');}
function table(x,z,w=250,d=110){
  for(const [a,b]of [[5,8],[w-13,8],[5,d-16],[w-13,d-16]])box(x+a,z+b,8,8,38,'#5c6650','#384a36');
  box(x,z,w,d,43,'#b09e71','#867e55','#717551',35);
  for(let i=1;i<5;i++)line(project(x,z+i*d/5,43),project(x+w,z+i*d/5,43),'#968b61');
  paper(x+18,z+15);paper(x+86,z+45,1);paper(x+178,z+19,1);
  box(x+133,z+17,24,29,50,'#a2ae92','#788d71','#597c64',43);
  for(let i=0;i<4;i++)box(x+131+i*4,z+19,2,3,65,'#d8b777','#8a9068',undefined,48);
  const a=project(x+63,z+85,49);ellipse(...a,7,5,'#e2d6aa');R(a[0]-6,a[1],12,9,'#bdc19b');
}

function standingLamp(x,z,h=135){const [sx,sy]=project(x,z);ellipse(sx,sy,17,7,'#394b37');R(sx-2,sy-h,4,h,'#c1b180');poly([[sx-20,sy-h+8],[sx-15,sy-h-12],[sx+15,sy-h-12],[sx+20,sy-h+8]],'#ddc99b');R(sx-20,sy-h+8,40,3,'#f8e4ab');}
function floorCushion(x,z,c='#9b9e79'){box(x-20,z-16,40,32,9,c,'#717e58','#596e50');line(project(x-16,z+8,10),project(x+17,z+8,10),'#c5bc87');}
function roundTable(x,z){const [sx,sy]=project(x,z);R(sx-3,sy-29,6,30,'#526548');ellipse(sx,sy-30,37,19,'#616f4f');ellipse(sx,sy-34,37,19,'#b4aa7b');ellipse(sx-7,sy-36,9,4,'#d7caa0');R(sx-12,sy-41,10,5,'#adb18a');}
function wateringCan(x,z){const [sx,sy]=project(x,z,5);R(sx-8,sy-9,15,12,'#8babb1');line([sx+5,sy-5],[sx+17,sy-11],'#a4bfc1',3);ctx.strokeStyle='#9bbac0';ctx.lineWidth=2;ctx.strokeRect(sx-12,sy-12,11,11);}
function pendant(x,z){
  const [sx,sy]=project(x,z,190);line([sx,sy-125],[sx,sy],'#869277',2);
  poly([[sx-38,sy+5],[sx-26,sy-15],[sx+26,sy-15],[sx+38,sy+5]],'#567563');
  R(sx-38,sy+5,76,4,'#e9c88d');R(sx-33,sy+9,66,2,'#f9e3a6');R(sx-25,sy-16,50,2,'#92a286');
}

const fixtures = [
  {z:96,draw:()=>bench(670,65,193,45)},
  {z:130,draw:()=>plant(885,97,1.25,7)},
  {z:161,draw:()=>roundTable(751,161)},
  {z:167,draw:()=>stool(206,156)},
  {z:210,draw:()=>tree(546,201)},
  {z:286,draw:()=>plant(1210,272,1.3,10)},
  {z:297,draw:()=>{box(92,256,201,34,48,'#a1a280','#7a8467','#677958');for(let i=0;i<4;i++)box(105+i*42,265,30,18,52,'#c2b495','#7f8e6d',undefined,48);plant(273,261,.7,41);}},
  {z:315,draw:()=>bench(460,310,326,34)},
  {z:420,draw:()=>bench(333,374,85,38)},
  {z:468,draw:()=>{floorCushion(780,460,'#b19977');roundTable(779,388);}},
  {z:366,draw:()=>stool(1028,352)},
  {z:367,draw:()=>stool(1138,352)},
  {z:512,draw:()=>table(953,386,262,112)},
  {z:555,draw:()=>stool(1005,550)},
  {z:555,draw:()=>stool(1130,550)},
  {z:560,draw:()=>{floorCushion(528,550);floorCushion(655,558,'#b19779');}},
  {z:630,draw:()=>bench(451,612,329,33)},
  {z:654,draw:()=>standingLamp(829,640,150)},
  {z:410,draw:()=>standingLamp(1267,390,169)},
  {z:716,draw:()=>{plant(1253,689,1.6,66);wateringCan(1213,718);}},
  {z:721,draw:()=>plant(318,694,1.45,44)},
  {z:737,draw:()=>{box(908,700,210,32,34,'#a49d77','#72805f','#576d53');for(let i=0;i<7;i++)box(923+i*25,702,17,20,40,['#bcb296','#809d84','#a88f71'][i%3],'#647f60',undefined,34);}}
];

export const OBSTACLES = [
  {x:489,z:158,w:113,d:88}, // tree bed
  {x:660,z:45,w:207,d:76},
  {x:92,z:242,w:206,d:60},
  {x:447,z:301,w:344,d:46},
  {x:443,z:610,w:345,d:40},
  {x:323,z:364,w:105,d:55},
  {x:746,z:365,w:63,d:45},
  {x:944,z:377,w:281,d:131},
  {x:866,z:81,w:40,d:43},
  {x:1190,z:251,w:41,d:43},
  {x:1219,z:662,w:69,d:68},
  {x:286,z:666,w:65,d:68},
  {x:900,z:693,w:227,d:51},
  {x:590,z:430,w:83,d:78}
];

function base(theme){
  const canvas=document.createElement('canvas');canvas.width=VIEW.width;canvas.height=VIEW.height;ctx=canvas.getContext('2d');
  R(0,0,VIEW.width,VIEW.height,theme.backdrop);
  // Soft ambient shadow grounds the cutaway without flattening its pixel edges.
  const shadow=ctx.createRadialGradient(820,690,100,820,670,800);shadow.addColorStop(0,'#080f0bc0');shadow.addColorStop(1,'transparent');ctx.fillStyle=shadow;ctx.fillRect(0,260,1600,670);
  box(-4,-4,1328,770,0,theme.floor,'#384a3d','#243b32',-36);
  const rand=random(119);for(let z=0;z<760;z+=27){for(let x=-140+(z%54?80:0);x<1320;x+=137){let px=Math.max(0,x),w=Math.min(1320,x+137)-px;if(w<0)continue;plane(px,z,w,26,0,theme.plank[Math.floor(rand()*5)]);if(rand()>.4)line(project(px+9,z+11),project(px+w-8,z+11),'#d4be8611');}}
  // Uneven grain, nail heads, and the broad afternoon window projection.
  for(let i=0;i<2100;i++){const x=rand()*1320,z=rand()*760,p=project(x,z);R(p[0],p[1],2+rand()*13,1,rand()>.4?'#e0c7950d':'#1e362116');}
  for(let i=0;i<4;i++){poly([project(477+i*102,0),project(549+i*102,0),project(965+i*104,690),project(867+i*104,690)],`${theme.sun}${theme===THEMES.afternoon?'19':'07'}`);}
  // A woven arrival runner; its clear edge reads as a route into the room.
  plane(42,520,247,180,1,'#858b69');plane(50,528,231,164,1,'#626f55');
  for(let x=59;x<280;x+=9)line(project(x,534,1),project(x,685,1),'#a6aa761f');
  for(let z=535;z<693;z+=11)line(project(56,z,1),project(272,z,1),'#bdba8029');
  // Recessed central court, shallow stone steps, and a soft inner rug.
  plane(422,282,400,392,1,'#414f3c');plane(427,287,390,382,1,'#a0a281');plane(435,296,374,364,1,'#6b7d60');
  plane(445,305,354,344,1,'#81916e');plane(451,311,342,332,1,'#71845e');
  for(let z=337;z<636;z+=7)line(project(465,z,1),project(780,z,1),'#b4be8520');
  for(let x=465;x<784;x+=11)line(project(x,321,1),project(x,638,1),'#4d714a16');
  // Open east-facing steps into the conversation garden.
  for(let i=0;i<3;i++)box(798+i*10,482,10,87,3+i*3,['#8f9b79','#a4aa86','#c0b998'][i],'#697d5d','#697d5d');
  // Back wall masonry.
  R(40,102,1336,235,theme.wall);
  ctx.save();ctx.beginPath();ctx.rect(40,102,1336,235);ctx.clip();
  for(let y=105;y<326;y+=28){for(let x=43+(y%56?0:-55);x<1370;x+=110){R(x,y,108,26,rand()>.5?'#e5dfb008':'#162e1f0c');}}ctx.restore();
  R(41,97,1334,12,'#c0b18a');R(41,109,1334,8,'#4f5a42');R(42,118,1330,10,'#d4c39422');
  R(43,324,1333,13,'#53644b');R(43,324,1333,3,'#a2a888');
  bookcase(34,193);windowWall(theme);wallDoor(300,87,'OBSERVATION DECK','deck',theme);wallDoor(965,109,'RESIDENT WING','wing',theme);
  // Wall of studies, including room for what happens during this visit.
  frame(1120,0,56,67,0,171);frame(1197,0,56,67,1,171);frame(1120,0,56,50,2,83);
  text('THE COMMON WALL',1243,145,8,'#ded4b1');
  // The back beam, joinery and warm wall lamps.
  for(const x of [20,258,422,900,1097,1304]){const p=project(x,0);R(p[0],115,13,216,'#8a8666');R(p[0]+2,115,3,213,'#c5b38c44');R(p[0]-5,115,23,12,'#b9aa80');}
  for(const x of [272,1104]){const p=project(x,0);R(p[0]-2,214,4,35,'#41553a');R(p[0]-8,201,16,22,'#c9b57e');R(p[0]-6,203,12,18,'#f3dfa1');const g=ctx.createRadialGradient(p[0],215,1,p[0],215,90);g.addColorStop(0,'#ffe8a71c');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(p[0]-90,125,180,180);}
  // Deck stair is visible and separate from the floor's circulation.
  for(let i=0;i<6;i++)box(300,17+i*16,87,16,50-i*8,'#a6a88b','#75816a','#64795f');
  // Garden doorway on the cutaway right edge: glazing, greenery, a stone sill.
  box(1297,121,30,175,15,'#a7ad8e','#657c61','#45624e');
  poly([project(1321,130),project(1321,280),project(1321,280,155),project(1321,130,155)],'#6b937765');
  for(const z of [129,280]){const a=project(1322,z);R(a[0]-4,a[1]-166,8,166,'#9bac8c');R(a[0]-2,a[1]-166,2,166,'#d0c9a3');}
  line(project(1322,128,165),project(1322,285,165),'#c1c4a2',8);line(project(1322,205,0),project(1322,205,159),'#7f9a7b',5);
  const gd=project(1322,205,181);text('GARDEN',gd[0]-13,gd[1],8,'#c7d4b5');
  // Grounds threshold at the opposite end. A low wall leaves the visitor visible.
  for(const [z,d]of [[12,480],[685,75]])box(-8,z,18,d,32,'#8d967c','#526d54','#48634e');
  const gp=project(3,585);text('THE GROUNDS',gp[0]+25,gp[1]-48,8,'#d4d3b4');
  line(project(0,514,1),project(0,682,1),'#c9c6a0',4);plane(0,520,33,158,1,'#a2a17c');
  // Short front wall reveals its structure, with a brass seam along the cap.
  box(-5,751,1330,12,7,'#acaa83','#566c52','#3c5a45',-37);line(project(-5,751,8),project(1323,751,8),'#cbc197',2);
  const [titleX,titleY]=project(532,768,-17);text('T H E   C O M M O N   R O O M',titleX,titleY,9,'#9faa83','left');
  glow(850,622,170,'#f4d18f',.15);glow(1237,391,155,'#f4d18f',.13);glow(610,473,125,'#b4d2a4',.12);
  return canvas;
}

function sculpture(time){
  box(604,443,55,48,16,'#bcc3a0','#7d9475','#597b62');const [x,y]=project(631,467,16);
  const bob=Math.sin(time*.65)*3;
  line([x,y],[x,y-69],'#95b7a266',1);ellipse(x,y,21,9,'#cadeb219');
  for(let i=0;i<3;i++){
    const yy=y-19-i*18+bob,rx=18-i*4;poly([[x,yy-12],[x+rx,yy],[x,yy+12],[x-rx,yy]],['#c1d4a7','#d3dcb7','#e8e3bf'][i]);
    poly([[x,yy],[x+rx,yy],[x,yy+12]],'#83ad9577');
  }
  const r=40;ctx.strokeStyle='#c1d4a54d';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y-38,r,13,-.25,0,Math.PI*2);ctx.stroke();
}

export function drawFigure(c,n,time,highlight=false){
  ctx=c;const [x,y]=project(n.x,n.z);const moving=n.moving;const bob=moving?Math.sin(time*13+n.seed)*1.5:Math.sin(time*1.5+n.seed)*.6;
  const sit=n.activity==='sitting';const base=y-(sit?8:0);
  ctx.save();ctx.translate(Math.round(x),Math.round(base+bob));ctx.scale(1.2,1.2);
  if(highlight){ellipse(0,1,19,8,'#dfdeb72f');ctx.strokeStyle='#d6d5a8';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,1,19,8,0,0,Math.PI*2);ctx.stroke();}
  const col=n.color,shade=n.shade||'#527964';
  // Every body uses the same pixel unit; silhouettes, not just hue, distinguish them.
  if(n.form==='ribbon'){
    const drift=Math.sin(time*2+n.seed)*2;
    poly([[-8,-34],[-3,-39],[9,-36],[12,-27],[5,-15],[10,-4],[0,0],[-9,-4],[-11,-16],[-6,-25]],col);
    R(-5,-31,12,9,shade);R(-3,-29,2,2,'#eae5bc');R(4,-29,2,2,'#eae5bc');
    R(-9,-21,4,17,'#e5d7a366');R(10,-19,3,9,shade);R(11+drift,-10,5,3,col);
    R(-5,-3,4,5,shade);R(4,-3,4,5,shade);
  }else if(n.form==='orb'){
    const float=Math.sin(time*1.8+n.seed)*3;ellipse(0,-23+float,15,13,col);ellipse(1,-22+float,10,9,shade);
    R(-5,-24+float,3,3,'#e5e8cd');R(4,-24+float,3,3,'#e5e8cd');
    R(-16,-27+float,5,2,'#e2d6ac');R(10,-30+float,5,3,'#e2d6ac');R(-4,-8+float,3,4,col);R(3,-5+float,3,3,col);
  }else if(n.form==='lattice'){
    for(const [xx,yy,w,hh]of [[-8,-38,16,13],[-10,-23,20,17],[-8,-3,5,6],[4,-3,5,6]]){R(xx,yy,w,hh,col);R(xx+2,yy+2,w-4,hh-4,shade);}
    R(-5,-34,3,3,'#efdfb0');R(3,-34,3,3,'#efdfb0');R(-14,-21,3,12,col);R(12,-21,3,12,col);
    R(-5,-19,2,9,'#d7d0a69a');R(1,-19,2,9,'#d7d0a69a');R(-7,-15,14,2,'#d7d0a69a');
  }else if(n.form==='wisp'){
    poly([[0,-42],[8,-34],[7,-24],[12,-13],[8,-2],[1,-6],[-7,-1],[-11,-13],[-6,-27],[-8,-35]],col);
    R(-6,-29,12,8,shade);R(-3,-27,2,2,'#f5ead1');R(3,-27,2,2,'#f5ead1');R(-2,-37,3,6,'#eef2cb');
    for(let i=0;i<3;i++)R(-14+i*12,-13+Math.sin(time*2+i)*5,2,2,col);
  }else{
    const stride=moving?Math.sin(time*13+n.seed)*3:0;
    R(-7,-11,5,13+stride,shade);R(3,-11,5,13-stride,shade);
    poly([[-9,-26],[7,-26],[12,-8],[-12,-8]],col);R(-8,-25,4,18,'#efdeb232');
    R(-8,-41,16,15,col);R(-6,-38,12,9,shade);R(-3,-35,2,2,'#e8e4bf');R(3,-35,2,2,'#e8e4bf');
    if(n.form==='crown'){R(-10,-44,4,6,col);R(-2,-48,4,7,col);R(6,-44,4,6,col);}
    R(-13,-24,4,13+stride,col);R(11,-24,4,13-stride,col);
  }
  if(n.activity==='drawing'){R(8,-19,17,13,'#daceac');line([10,-12],[21,-18+Math.sin(time*5)*2],'#739274',2);}
  if(n.activity==='reading'){R(5,-20,15,13,'#cdbf93');R(12,-19,1,11,'#73856b');}
  if(n.activity==='tending'){R(9,-15,11,10,'#a3b9a4');line([17,-11],[26,-18],'#a3b9a4',2);for(let i=0;i<3;i++)R(26+i*2,-13+(time*22+i*4)%15,1,2,'#c1d3bd');}
  if(n.carrying){R(8,-23,22,20,'#d0c2a3');R(11,-20,16,14,'#73917d');}
  if(n.id==='visitor'){poly([[-4,-53],[4,-53],[0,-49]],'#ece4c3');}
  ctx.restore();
}

export class RoomRenderer {
  constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d',{alpha:false});this.backgrounds=new Map();this.theme='afternoon';}
  draw(state,camera){
    const c=this.c;ctx=c;const dpr=Math.min(devicePixelRatio||1,2);const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);R(0,0,w,h,THEMES[state.theme].backdrop);
    c.translate(camera.ox,camera.oy);c.scale(camera.scale,camera.scale);c.imageSmoothingEnabled=false;
    if(!this.backgrounds.has(state.theme))this.backgrounds.set(state.theme,base(THEMES[state.theme]));ctx=c;
    c.drawImage(this.backgrounds.get(state.theme),0,0);
    // Foot shadows are always on the floor; actors and furniture then share one depth sort.
    for(const n of [...state.people,state.player]){const [x,y]=project(n.x,n.z);ellipse(x,y+3,14,5,'#152c2147');}
    if(state.player.path?.length){const dest=state.player.path.at(-1),[x,y]=project(dest.x,dest.z);c.strokeStyle='#e2d4aa88';c.lineWidth=1;for(let i=0;i<2;i++){c.beginPath();c.ellipse(x,y,8+i*5,4+i*2,0,0,Math.PI*2);c.stroke();}}
    if(state.trail.length){c.save();c.globalAlpha=.4;for(const n of state.trail){const [x,y]=project(n.x,n.z);R(x,y,2,2,'#d8d8b0');}c.restore();}
    const sorted=[...fixtures.map(f=>({z:f.z,draw:f.draw})),{z:493,draw:()=>sculpture(state.reducedMotion?0:state.time)},...state.people.map(n=>({z:n.z,draw:()=>drawFigure(c,n,state.reducedMotion?0:state.time,state.selected===n.id||state.hover===n.id)})),{z:state.player.z,draw:()=>drawFigure(c,state.player,state.reducedMotion?0:state.time,false)}];
    sorted.sort((a,b)=>a.z-b.z).forEach(n=>n.draw());
    pendant(1100,440);
    // New studies stay on the wall after their maker has walked away.
    if(state.works.length>3)frame(1197,0,56,50,state.works.at(-1).pattern,83);
    if(state.hover&&state.hover.startsWith('door:')){const door=state.doors.find(d=>d.id===state.hover),a=project(door.x,door.z);ellipse(...a,33,12,'#dce2b934');}
    if(!state.reducedMotion){
      const rand=random(80);for(let i=0;i<20;i++){const x=530+rand()*710+Math.sin(state.time*.1+i)*6,y=250+rand()*410-((state.time*3+i*8)%35);R(x,y,1.5,1.5,'#dbe0b84d');}
    }
    // A localized lamp bloom at night keeps the architecture readable.
    if(state.theme==='night'){glow(830,625,160,'#f4cf86',.14);glow(1244,391,190,'#f6d697',.13);glow(631,461,115,'#cce8af',.11);}
    c.setTransform(dpr,0,0,dpr,0,0);
  }
}

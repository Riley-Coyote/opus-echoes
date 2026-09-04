// Original dimetric pixel architecture. No production-world assets or runtime state.
export const VIEW = { width: 1600, height: 930 };
export const WORLD = { width: 1320, depth: 760 };
export function project(x, z, h = 0) { return [48 + x + z * .22, 334 + z * .60 - h]; }
export function unproject(x, y) { const z = (y - 334) / .60; return { x: x - 48 - z * .22, z }; }
export const THEMES = {
  afternoon: { label: 'Firelit dusk', backdrop: '#0b0910', floor: '#322424', plank: ['#342829','#302327','#392929','#2c2227','#362729'], wall: '#28212e', trim: '#65505a', sky: ['#17122e','#643053','#d2774b'], moon:'#eee8d7', light:'181,158,222', ray:.085, grade:.05 },
  dusk: { label: 'Blue hour', backdrop: '#090911', floor: '#28222b', plank: ['#30252e','#2c232d','#32252b','#28222c','#2b242c'], wall: '#252131', trim: '#59495f', sky: ['#100e29','#312749','#79516c'], moon:'#dcdced', light:'137,153,218', ray:.09, grade:.11 },
  night: { label: 'Midnight', backdrop: '#070810', floor: '#242029', plank: ['#29222a','#25202a','#2c232b','#23202b','#27212b'], wall: '#1d1b2c', trim: '#4a4259', sky: ['#080b1c','#141c35','#354566'], moon:'#d9e2f1', light:'133,163,220', ray:.065, grade:.17 }
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
const LETTERS={A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],I:[14,4,4,4,4,4,14],J:[7,2,2,2,18,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,27,17],X:[17,17,10,4,10,17,17],Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31]};
function text(s,x,y,size=9,c='#b7a597',align='center'){
  // Seven-row lettering stays on the same two-unit pixel grid as the architecture.
  const left=Math.round((x-(align==='center'?(s.length*12-2)/2:0))/2)*2,top=Math.round((y-7)/2)*2;
  for(let i=0;i<s.length;i++){const glyph=LETTERS[s[i]];if(!glyph)continue;for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row]&(1<<(4-col)))R(left+i*12+col*2,top+row*2,2,2,c);}
}

function random(seed=712){let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

// The existing Sanctuary uses additive light with a squared falloff. A light
// should disappear into shadow without drawing the edge of a translucent disc.
function bloom(x,y,r,rgb,alpha,squash=1){
  ctx.save();ctx.translate(x,y);ctx.scale(1,squash);ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(0,0,1,0,0,r);
  for(const [at,strength]of [[0,1],[.25,.5625],[.55,.2025],[.8,.04],[1,0]])g.addColorStop(at,`rgba(${rgb},${alpha*strength})`);
  ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
}
function archPath(x,y,w,h){ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x,y+w/2);ctx.arc(x+w/2,y+w/2,w/2,Math.PI,0);ctx.lineTo(x+w,y+h);ctx.closePath();}
function arch(x,y,w,h,color){archPath(x,y,w,h);ctx.fillStyle=color;ctx.fill();}

function bookcase(x,w=196){
  const [sx,sy]=project(x,0); R(sx-7,sy-190,w+14,192,'#34232c');R(sx,sy-183,w,182,'#100f18');
  const rand=random(x);const colors=['#75624d','#654556','#907357','#49616b','#48445e','#9a805a','#5b3c45'];
  for(let row=0;row<4;row++){
    const y=sy-166+row*40;
    for(let bx=7;bx<w-9;){let bw=3+Math.floor(rand()*5),bh=15+rand()*17;R(sx+bx,y+25-bh,bw,bh,colors[Math.floor(rand()*colors.length)]);if(rand()>.4){R(sx+bx,y+28-bh,bw,1,'#c2a57670');R(sx+bx+1,y+27-bh,1,bh-4,'#ead9b31c');}bx+=bw+2;}
    R(sx,y+27,w,5,'#68513f');R(sx,y+32,w,3,'#1d1720');R(sx,y+27,w,1,'#9b785032');
  }
  R(sx-6,sy-190,5,192,'#70503c');R(sx+w+1,sy-190,5,192,'#48313a');R(sx-8,sy-194,w+16,7,'#7f6248');R(sx-8,sy-195,w+16,1,'#bda27955');
}

function wallDoor(x,w,title,kind,theme){
  const [sx,sy]=project(x,0);arch(sx-10,sy-181,w+20,184,'#39303e');arch(sx-6,sy-177,w+12,179,theme.trim);arch(sx,sy-171,w,172,'#100e19');
  if(kind==='wing'){
    arch(sx+7,sy-159,w-14,159,'#2d2029');arch(sx+16,sy-150,w-32,150,'#201920');
    for(let k=0;k<5;k++)R(sx+16+k*(w-32)/5,sy-108,2,105,'#503b3d');
    R(sx+w/2-1,sy-126,2,126,'#594039');R(sx+w/2-8,sy-73,3,12,'#cfad70');
    line([sx+7,sy-4],[sx+w-7,sy-4],'#dfa56577',2);
  }else{
    arch(sx+10,sy-157,w-20,81,'#33253f');arch(sx+15,sy-151,w-30,69,'#514463');
    R(sx+w/2-2,sy-155,4,79,'#282135');R(sx+11,sy-113,w-22,3,'#796079');
    for(let i=0;i<5;i++)R(sx+11,sy-73+i*13,w-22,2,'#4a3948');
  }
  text(title,sx+w/2,sy-197,8,'#aca1ac');
}

function windowWall(theme){
  const sx=510,sy=334,ww=405,hh=222;
  for(let pane=0;pane<3;pane++){
    const wx=sx+pane*140;
    arch(wx-7,sy-hh-8,132,hh+14,'#15121e');
    arch(wx-4,sy-hh-5,126,hh+10,'#6a5266');
    arch(wx,sy-hh,118,hh,'#13101e');
    ctx.save();archPath(wx+3,sy-hh+3,112,hh-5);ctx.clip();
    const sky=ctx.createLinearGradient(0,sy-hh,0,sy+15);theme.sky.forEach((c,i)=>sky.addColorStop(i/2,c));ctx.fillStyle=sky;ctx.fillRect(sx-10,sy-hh,ww+30,hh+20);
    const rand=random(324);for(let i=0;i<110;i++){const x=sx+rand()*ww,y=sy-hh+rand()*130;R(x,y,1+(i%9===0),1+(i%9===0),i%3?'#d7c4de80':'#ebe4dda0');}
    circle(sx+320,sy-147,22,theme.moon);
    if(theme===THEMES.night)circle(sx+327,sy-153,20,theme.sky[1]);
    poly([[sx-10,sy-57],[sx+40,sy-94],[sx+117,sy-61],[sx+168,sy-84],[sx+255,sy-49],[sx+325,sy-93],[sx+430,sy-63],[sx+430,sy],[sx-10,sy]],'#27223e');
    poly([[sx-10,sy-30],[sx+79,sy-56],[sx+169,sy-19],[sx+280,sy-61],[sx+430,sy-32],[sx+430,sy],[sx-10,sy]],'#171726');
    R(sx,sy-19,ww,19,theme===THEMES.night?'#242b45':'#52324b');
    for(let i=0;i<30;i++){const x=sx+rand()*ww,y=sy-18+rand()*19;R(x,y,3+rand()*28,1,theme===THEMES.afternoon?'#e2a47140':'#a6a8d338');}
    for(let k=0;k<16;k++){const x=sx+5+k*28;R(x,sy-31,2,32,'#0d1020');poly([[x-9,sy-6],[x+1,sy-45-k%4*7],[x+10,sy-6]],'#111222');}
    // Sparse Bayer-like fringe makes the sky belong to the pixel landscape.
    for(let y=sy-hh;y<sy;y+=4)for(let x=wx;x<wx+118;x+=4)if((x+y)%8===0)R(x,y,1,1,'#130c2533');
    ctx.restore();
    R(wx+57,sy-hh+10,3,hh-10,'#7c634e');R(wx+58,sy-hh+10,1,hh-10,'#d2a8753b');
    for(const y of [sy-132,sy-68]){R(wx+3,y,112,3,'#73594a');R(wx+3,y,112,1,'#baa2883b');}
    R(wx-7,sy+2,132,6,'#6a5050');R(wx-7,sy+8,132,5,'#1b1824');
  }
}

function frame(x,z,w,h,n,height=150){
  const [sx,sy]=project(x,z,height);R(sx-3,sy-3,w+6,h+6,'#201722');R(sx-1,sy-1,w+2,h+2,'#806340');R(sx+3,sy+3,w-6,h-6,'#a69c86');
  const palette=['#58576d','#946a55','#546477','#7c5360','#a48663'];
  if(n%3===0){for(let i=0;i<5;i++)poly([[sx+6,sy+h-7-i*5],[sx+w*.35,sy+h*.35+i*3],[sx+w*.58,sy+h*.58],[sx+w-6,sy+8+i*4],[sx+w-6,sy+h-7]],palette[(i+n)%5]);}
  else if(n%3===1){for(let i=0;i<4;i++){ctx.strokeStyle=palette[(i+n)%5];ctx.lineWidth=2;ctx.strokeRect(sx+7+i*4,sy+7+i*4,w-14-i*8,h-14-i*8);}}
  else{for(let i=0;i<9;i++){const rand=random(i+n*53);R(sx+8+rand()*(w-18),sy+8+rand()*(h-18),3+rand()*7,3+rand()*9,palette[(i+n)%5]);}}
}

function plant(x,z,size=1,seed=1,pot=true){
  const [sx,sy]=project(x,z),rand=random(seed);
  if(pot){box(x-14*size,z-13*size,28*size,25*size,23*size,'#654233','#3b272a','#291f27');ellipse(sx,sy-24*size,15*size,6*size,'#11151a');}
  for(let k=0;k<15*size;k++){
    const angle=rand()*Math.PI*2,len=(18+rand()*37)*size,ex=sx+Math.sin(angle)*len,ey=sy-26*size-Math.abs(Math.cos(angle))*len;
    line([sx,sy-22*size],[ex,ey],'#304735',1.5*size);
    for(let j=0;j<5;j++){const f=j/5,lx=sx+(ex-sx)*f,ly=sy-22*size+(ey-sy+22*size)*f;R(lx-4*size,ly,7*size,3*size,['#203c2e','#2b4a33','#39563b','#526346'][k%4]);}
  }
}
function tree(x,z){
  box(x-47,z-38,94,75,24,'#4d3c40','#2c222d','#1b1926');plane(x-40,z-31,80,61,25,'#15151d');
  const [sx,sy]=project(x,z),rand=random(331);
  poly([[sx-9,sy-22],[sx-6,sy-151],[sx+3,sy-176],[sx+7,sy-25]],'#4d3b34');
  line([sx-4,sy-25],[sx-2,sy-145],'#896445',2);
  for(let i=0;i<7;i++){const ex=sx-74+rand()*147,ey=sy-146-rand()*65;line([sx,sy-72-i*9],[ex,ey],'#453437',3);}
  for(let i=0;i<410;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand()),px=sx+Math.cos(a)*91*r,py=sy-180+Math.sin(a)*60*r,s=2+rand()*7;R(px,py,s,s*.75,['#14251f','#233a29','#30472f','#425a38','#596845'][Math.floor(rand()*5)]);}
  for(let i=0;i<25;i++)R(sx-55+rand()*110,sy-215+rand()*58,3,2,'#b49b583a');
}

function bench(x,z,w=120,d=36){
  box(x+7,z+4,w-14,d-8,12,'#4a3230','#231a22','#17141e');
  box(x,z,w,d,23,'#624044','#40232e','#291b2b',12);
  box(x,z-5,w,8,39,'#744951','#4c2b38','#2d1e2d',14);
  for(let i=0;i<Math.floor(w/45);i++){
    const cw=w/Math.floor(w/45);box(x+i*cw+2,z+1,cw-4,d-3,27,'#795153','#4d2b33','#35212d',23);
    line(project(x+i*cw+5,z+d-4,27),project(x+(i+1)*cw-5,z+d-4,27),'#9c7770',1);
  }
  box(x+9,z+2,25,23,34,'#a07f53','#655034','#4b332d',27);
}

function stool(x,z,color='#775449') {box(x-9,z-9,5,18,22,'#4b3135','#241a24');box(x+5,z-9,5,18,22,'#4b3135','#241a24');box(x-15,z-13,30,26,25,color,'#4e3037','#34222f');}
function paper(x,z,n=0){plane(x,z,27,29,44,'#bfad90');for(let i=0;i<5;i++)line(project(x+4,z+6+i*4,44.2),project(x+18+(i%2)*5,z+6+i*4,44.2),i===1?'#4c586a':'#786f62',1);if(n%2)plane(x+15,z+3,3,20,45,'#755437');}
function table(x,z,w=250,d=110){
  for(const [a,b]of [[5,8],[w-13,8],[5,d-16],[w-13,d-16]])box(x+a,z+b,8,8,38,'#473035','#201823');
  box(x,z,w,d,43,'#76553f','#442d2a','#30232a',35);
  for(let i=1;i<5;i++)line(project(x,z+i*d/5,43),project(x+w,z+i*d/5,43),'#b68a541c');
  paper(x+18,z+15);paper(x+86,z+45,1);paper(x+178,z+19,1);
  box(x+133,z+17,24,29,50,'#65546a','#372c44','#231d33',43);
  for(let i=0;i<4;i++)box(x+131+i*4,z+19,2,3,65,'#ad8755','#705d4c',undefined,48);
  const a=project(x+63,z+85,49);ellipse(...a,7,5,'#d3b586');R(a[0]-6,a[1],12,9,'#a17e58');
}

function standingLamp(x,z,h=135){const [sx,sy]=project(x,z);ellipse(sx,sy,17,7,'#15111d');R(sx-2,sy-h,4,h,'#755438');poly([[sx-20,sy-h+8],[sx-15,sy-h-12],[sx+15,sy-h-12],[sx+20,sy-h+8]],'#b68d50');R(sx-20,sy-h+8,40,3,'#ffe2a0');}
function floorCushion(x,z,c='#7c4c47'){box(x-20,z-16,40,32,9,c,'#4a2b32','#30202b');line(project(x-16,z+8,10),project(x+17,z+8,10),'#b08265');}
function roundTable(x,z){const [sx,sy]=project(x,z);R(sx-3,sy-29,6,30,'#3e2a2d');ellipse(sx,sy-30,37,19,'#2a2029');ellipse(sx,sy-34,37,19,'#876148');ellipse(sx-7,sy-36,9,4,'#c0a177');R(sx-12,sy-41,10,5,'#856652');}
function wateringCan(x,z){const [sx,sy]=project(x,z,5);R(sx-8,sy-9,15,12,'#476173');line([sx+5,sy-5],[sx+17,sy-11],'#6d8292',3);ctx.strokeStyle='#718195';ctx.lineWidth=2;ctx.strokeRect(sx-12,sy-12,11,11);}
function pendant(x,z){
  const [sx,sy]=project(x,z,190);line([sx,sy-125],[sx,sy],'#493b41',2);
  poly([[sx-38,sy+5],[sx-26,sy-15],[sx+26,sy-15],[sx+38,sy+5]],'#382d40');
  R(sx-38,sy+5,76,4,'#dca55c');R(sx-33,sy+9,66,2,'#ffe6a8');R(sx-25,sy-16,50,2,'#6b5360');
}

const fixtures = [
  {z:96,draw:()=>bench(670,65,193,45)},
  {z:130,draw:()=>plant(885,97,1.25,7)},
  {z:161,draw:()=>roundTable(751,161)},
  {z:167,draw:()=>stool(206,156)},
  {z:210,draw:()=>tree(546,201)},
  {z:286,draw:()=>plant(1210,272,1.3,10)},
  {z:297,draw:()=>{box(92,256,201,34,48,'#614639','#3b2b2c','#261e27');for(let i=0;i<4;i++)box(105+i*42,265,30,18,52,'#9b8665','#473640',undefined,48);plant(273,261,.7,41);}},
  {z:315,draw:()=>bench(460,310,326,34)},
  {z:420,draw:()=>bench(333,374,85,38)},
  {z:468,draw:()=>{floorCushion(780,460,'#7e524a');roundTable(779,388);}},
  {z:366,draw:()=>stool(1028,352)},
  {z:367,draw:()=>stool(1138,352)},
  {z:512,draw:()=>table(953,386,262,112)},
  {z:555,draw:()=>stool(1005,550)},
  {z:555,draw:()=>stool(1130,550)},
  {z:560,draw:()=>{floorCushion(528,550);floorCushion(655,558,'#725268');}},
  {z:630,draw:()=>bench(451,612,329,33)},
  {z:654,draw:()=>standingLamp(829,640,150)},
  {z:410,draw:()=>standingLamp(1267,390,169)},
  {z:716,draw:()=>{plant(1253,689,1.6,66);wateringCan(1213,718);}},
  {z:721,draw:()=>plant(318,694,1.45,44)},
  {z:737,draw:()=>{box(908,700,210,32,34,'#694d3f','#3d2b30','#271e29');for(let i=0;i<7;i++)box(923+i*25,702,17,20,40,['#a18d6b','#445766','#7e5252'][i%3],'#39283b',undefined,34);}}
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

function floorShadow(x,z,w,d,reach=35){
  poly([project(x-5,z),project(x+w,z),project(x+w+reach*.35,z+d+reach),project(x+reach*.35,z+d+reach)],'#08061058');
  plane(x-3,z-3,w+6,d+6,0,'#09071055');
}

function base(theme){
  const canvas=document.createElement('canvas');canvas.width=VIEW.width;canvas.height=VIEW.height;ctx=canvas.getContext('2d');
  box(-4,-4,1328,770,0,theme.floor,'#19131f','#110f19',-36);
  const rand=random(119);
  // Individually laid walnut boards. Their grain stays darker than the light.
  for(let z=0;z<760;z+=22)for(let x=-140+(z%44?80:0);x<1320;x+=137){
    const px=Math.max(0,x),w=Math.min(1320,x+137)-px;if(w<0)continue;
    plane(px,z,w,21,0,theme.plank[Math.floor(rand()*5)]);
    for(let i=0;i<3;i++)line(project(px+4+rand()*12,z+4+i*5),project(px+w-8,z+4+i*5),'#bb816a0a');
    const nail=project(px+4,z+4);R(nail[0],nail[1],1,1,'#aa927129');
  }
  for(let i=0;i<2400;i++){const p=project(rand()*1320,rand()*760);R(p[0],p[1],2+rand()*21,1,i%3?'#d7a97e08':'#06071024');}
  // Narrow woven runner at the entry, followed by the communal hearth rug.
  plane(42,520,247,180,1,'#5a4142');plane(50,528,231,164,1,'#302838');
  for(let x=59;x<280;x+=9)line(project(x,534,1),project(x,685,1),'#9272631a');
  for(let z=535;z<693;z+=11)line(project(56,z,1),project(272,z,1),'#b3917420');
  plane(422,282,400,392,1,'#14131f');plane(427,287,390,382,1,'#635059');plane(433,293,378,370,1,'#29212e');
  plane(441,301,362,354,1,'#704343');plane(449,309,346,338,1,'#432733');plane(458,318,328,320,1,'#4f2c39');
  for(let z=326;z<636;z+=5)line(project(461,z,1),project(782,z,1),'#ba796016');
  for(let x=465;x<784;x+=7)line(project(x,321,1),project(x,638,1),'#c3897710');
  for(let x=459;x<790;x+=20)for(const z of [314,638]){plane(x,z,6,5,1,'#a178543d');plane(x+6,z+5,6,5,1,'#a178543d');}
  for(let i=0;i<3;i++)box(798+i*10,482,10,87,3+i*3,['#4a3841','#57414a','#6d5153'][i],'#28212e','#312630');
  // Furniture has contact and cast shadows even when the room is still.
  for(const o of OBSTACLES)floorShadow(o.x,o.z,o.w,o.d,o.x<850?45:27);
  const tp=project(546,310);for(let i=0;i<80;i++)ellipse(tp[0]+rand()*190-50,tp[1]+rand()*65,3+rand()*11,2+rand()*4,'#0b091026');
  // Stone rises out of darkness. Small joints remain visible near each lamp.
  const wall=ctx.createLinearGradient(0,100,0,337);wall.addColorStop(0,'#171421');wall.addColorStop(.35,theme.wall);wall.addColorStop(1,'#1a1622');
  ctx.fillStyle=wall;ctx.fillRect(40,102,1336,235);
  ctx.save();ctx.beginPath();ctx.rect(40,102,1336,235);ctx.clip();
  for(let y=108;y<326;y+=25)for(let x=43+(y%50?0:-55);x<1370;x+=110){R(x,y,108,24,rand()>.5?'#a884a20a':'#09081622');R(x,y+24,110,1,'#06051038');}
  ctx.restore();
  R(41,97,1334,9,'#61505d');R(41,106,1334,7,'#251b2d');R(42,114,1330,9,'#3e2e3d');R(41,96,1334,1,'#a18b733d');
  R(43,324,1333,13,'#2b1f2c');R(43,324,1333,2,'#86664f55');
  bookcase(34,193);windowWall(theme);wallDoor(300,87,'OBSERVATION','deck',theme);wallDoor(965,109,'RESIDENT WING','wing',theme);
  frame(1120,0,56,67,0,171);frame(1197,0,56,67,1,171);frame(1120,0,56,50,2,83);
  text('COMMON WALL',1243,145,8,'#b5a2a6');
  for(const x of [20,258,422,900,1097,1304]){
    const p=project(x,0);R(p[0],115,13,216,'#40303d');R(p[0]+2,115,2,213,'#9c795331');R(p[0]+10,115,3,213,'#100f195c');
    R(p[0]-5,115,23,9,'#685042');R(p[0]-5,124,23,3,'#221827');R(p[0]-3,321,20,9,'#55404b');
  }
  for(const x of [272,1104]){
    const [sx]=project(x,0);R(sx-2,209,4,35,'#725234');R(sx-10,211,20,5,'#a88046');R(sx-5,200,10,11,'#ac8753');
    R(sx-3,194,6,9,'#ffc883');R(sx-1,191,2,9,'#fff4c7');
  }
  for(let i=0;i<6;i++){box(300,17+i*16,87,16,50-i*8,'#5d4b58','#352838','#271f2f');line(project(300,33+i*16,50-i*8),project(387,33+i*16,50-i*8),'#c698693a');}
  // The four thresholds keep their exact positions in the approved floor plan.
  box(1297,121,30,175,15,'#5b4a55','#302536','#1f1a2a');
  poly([project(1321,130),project(1321,280),project(1321,280,155),project(1321,130,155)],'#35354e68');
  for(const z of [129,280]){const a=project(1322,z);R(a[0]-3,a[1]-166,6,166,'#725747');R(a[0]-2,a[1]-166,1,166,'#e8b97555');}
  line(project(1322,128,165),project(1322,285,165),'#977354',5);line(project(1322,205,0),project(1322,205,159),'#7a5b53',3);
  const gd=project(1322,205,181);text('GARDEN',gd[0]-13,gd[1],8,'#b6a6bb');
  for(const [z,d]of [[12,480],[685,75]])box(-8,z,18,d,32,'#56414e','#2e2232','#211b2b');
  const gp=project(3,585);text('THE GROUNDS',gp[0]+25,gp[1]-48,8,'#c4b9ac');
  line(project(0,514,1),project(0,682,1),'#b7926766',3);plane(0,520,33,158,1,'#5d4445');
  box(-5,751,1330,12,7,'#55404e','#251b2c','#171320',-37);line(project(-5,751,8),project(1323,751,8),'#bb926555',1);
  const [titleX,titleY]=project(532,768,-17);text('THE COMMON ROOM',titleX,titleY,9,'#9b858c','left');
  // Broken window reflections stretch over the floor instead of tinting it all.
  ctx.save();poly([project(0,0),project(1320,0),project(1320,760),project(0,760)],'transparent');ctx.clip();
  for(let i=0;i<3;i++){
    const start=project(473+i*140,0),end=project(580+i*155,620),g=ctx.createLinearGradient(...start,...end);
    g.addColorStop(0,`rgba(${theme.light},${theme.ray})`);g.addColorStop(.55,`rgba(${theme.light},${theme.ray*.55})`);g.addColorStop(1,`rgba(${theme.light},0)`);
    poly([start,project(585+i*140,0),project(694+i*155,620),end],g);
  }
  ctx.restore();
  return canvas;
}

function hearth(time){
  // A low stone fire bowl leaves every sightline and walking route open.
  box(601,440,63,56,13,'#5a454b','#32232c','#211b27');
  plane(607,446,51,43,14,'#160f18');
  const [x,y]=project(631,467,16);
  ellipse(x,y,23,10,'#48272a');ellipse(x,y-2,19,8,'#c66532');ellipse(x,y-5,16,6,'#ee9c48');
  for(let i=0;i<5;i++){
    const xx=x-19+i*8,yy=y-4+(i%2)*3;R(xx,yy,7,6,'#703629');R(xx+1,yy,5,2,'#d28142');
    const h=18+Math.sin(time*2.5+i*2)*6+(i%2)*7;
    poly([[xx,yy],[xx-3,yy-9],[xx+1,yy-h],[xx+4,yy-h-8],[xx+5,yy-12],[xx+9,yy]],'#d67838');
    poly([[xx+1,yy],[xx,yy-8],[xx+4,yy-h+3],[xx+6,yy]],'#ffd184');
    R(xx+2,yy-9,3,7,'#fff0ba');
  }
  for(let i=0;i<3;i++){const age=(time*.25+i*.33)%1;R(x-8+i*9+Math.sin(time+i)*3,y-26-age*27,1,2,`rgba(255,176,92,${(1-age)*.75})`);}
  line(project(601,496,14),project(664,496,14),'#ba805a66',1);
}

function illumination(theme){
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=465;
  const c=canvas.getContext('2d');c.scale(.5,.5);c.fillStyle=theme===THEMES.night?'#777587':'#918795';c.fillRect(0,0,1600,930);c.globalCompositeOperation='screen';
  for(const [x,y,r,a,squash] of [[800,288,325,.37,.78],[782,584,240,.65,.73],[1245,548,216,.57,.82],[1018,568,160,.3,1],[1401,408,160,.4,1],[320,203,121,.48,1],[1152,203,121,.48,1]]){
    c.save();c.translate(x,y);c.scale(1,squash);const g=c.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(.5,`rgba(255,255,255,${a*.5})`);g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(-r,-r,r*2,r*2);c.restore();
  }
  // The glass and small flame cores emit light, so exposure must not dim them.
  c.globalCompositeOperation='source-over';c.fillStyle='#ffffff';
  for(let i=0;i<3;i++){const x=513+i*140,y=115;c.beginPath();c.moveTo(x,332);c.lineTo(x,y+56);c.arc(x+56,y+56,56,Math.PI,0);c.lineTo(x+112,332);c.closePath();c.fill();}
  const core=c.createRadialGradient(782,580,1,782,580,47);core.addColorStop(0,'#ffffff');core.addColorStop(1,'#ffffff00');c.fillStyle=core;c.fillRect(735,533,94,94);
  return canvas;
}

function atmosphere(theme,time,reduced,shade,silhouette){
  ctx.save();
  ctx.globalCompositeOperation='multiply';ctx.drawImage(shade,0,0,1600,930);ctx.globalCompositeOperation='source-over';
  // Violet ambient shadow unifies materials; all visible warmth has a source.
  ctx.fillStyle=`rgba(7,5,20,${theme.grade})`;ctx.fillRect(40,100,1490,735);
  // Restore the scene's original alpha after grading, including overhanging foliage.
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(silhouette,0,0,1600,930);ctx.globalCompositeOperation='source-over';
  for(const x of [320,1152]){bloom(x,203,111,'255,174,86',.21);bloom(x,203,30,'255,195,115',.14);}
  bloom(822,299,310,theme.light,.047,.8);
  const fire=project(631,467,31),flicker=reduced?1:1+Math.sin(time*1.7)*.025+Math.sin(time*3.1)*.018;
  bloom(fire[0],fire[1]+32,257,'236,130,57',.17*flicker,.55);
  bloom(fire[0],fire[1]-7,141,'255,147,68',.26*flicker,.9);
  bloom(fire[0],fire[1]-10,42,'255,181,92',.13*flicker);
  for(const [x,z,h,r] of [[829,640,150,163],[1267,390,169,158]]){
    const a=project(x,z,h-8),floor=project(x,z);bloom(a[0],a[1],r,'255,177,90',.16);
    bloom(floor[0],floor[1]-10,r,'231,151,74',.10,.48);
  }
  const lamp=project(1100,440,179),desk=project(1100,440,44);
  const shaft=ctx.createLinearGradient(lamp[0],lamp[1],desk[0],desk[1]+55);shaft.addColorStop(0,'#ffda8c03');shaft.addColorStop(.65,'#efbd6e0c');shaft.addColorStop(1,'#e7b77200');
  poly([[lamp[0]-32,lamp[1]],[lamp[0]+32,lamp[1]],[desk[0]+133,desk[1]+55],[desk[0]-133,desk[1]+55]],shaft);
  bloom(lamp[0],lamp[1],110,'255,180,87',.11);bloom(desk[0],desk[1],160,'255,183,107',.14,.53);
  // Long, faint window shafts carry a few drifting motes, without a room-wide haze.
  const ray=ctx.createLinearGradient(793,243,916,593);ray.addColorStop(0,`rgba(${theme.light},.018)`);ray.addColorStop(.65,`rgba(${theme.light},.025)`);ray.addColorStop(1,`rgba(${theme.light},0)`);
  poly([[784,210],[806,210],[976,660],[882,660]],ray);
  if(!reduced){const rand=random(80);for(let i=0;i<27;i++){const x=660+rand()*580+Math.sin(time*.12+i)*5,y=300+rand()*340-(time*2+i*8)%35;R(x,y,1,1,i%3?'#f5d7a944':'#c1b4e94d');}}
  ctx.globalCompositeOperation='source-atop';
  const vignette=ctx.createRadialGradient(798,405,285,800,420,790);vignette.addColorStop(0,'#06050c00');vignette.addColorStop(.65,'#06050c08');vignette.addColorStop(1,'#06050c99');ctx.fillStyle=vignette;ctx.fillRect(0,0,1600,930);
  ctx.restore();
}

export function drawFigure(c,n,time,highlight=false){
  ctx=c;const [x,y]=project(n.x,n.z);const moving=n.moving;const bob=moving?Math.sin(time*13+n.seed)*1.5:Math.sin(time*1.5+n.seed)*.6;
  const sit=n.activity==='sitting';const base=y-(sit?8:0);
  ctx.save();ctx.translate(Math.round(x),Math.round(base+bob));ctx.scale(1.2,1.2);
  if(highlight){ellipse(0,1,19,8,'#e4c5a82f');ctx.strokeStyle='#e4c5a8';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,1,19,8,0,0,Math.PI*2);ctx.stroke();}
  const col=n.color,shade=n.shade||'#494257';
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
  if(n.activity==='drawing'){R(8,-19,17,13,'#daceac');line([10,-12],[21,-18+Math.sin(time*5)*2],'#6c607d',2);}
  if(n.activity==='reading'){R(5,-20,15,13,'#cdbf93');R(12,-19,1,11,'#786479');}
  if(n.activity==='tending'){R(9,-15,11,10,'#889db5');line([17,-11],[26,-18],'#889db5',2);for(let i=0;i<3;i++)R(26+i*2,-13+(time*22+i*4)%15,1,2,'#bbc6dd');}
  if(n.carrying){R(8,-23,22,20,'#d0c2a3');R(11,-20,16,14,'#766783');}
  if(n.id==='visitor'){poly([[-4,-53],[4,-53],[0,-49]],'#ece4c3');}
  ctx.restore();
}

export class RoomRenderer {
  constructor(canvas){
    this.canvas=canvas;this.c=canvas.getContext('2d',{alpha:false});this.backgrounds=new Map();this.shadows=new Map();

    // Draw art at one consistent pixel density, then enlarge with nearest-neighbor.
    this.scene=document.createElement('canvas');this.scene.width=VIEW.width/2;this.scene.height=VIEW.height/2;
    this.pixels=this.scene.getContext('2d');
    this.silhouette=document.createElement('canvas');this.silhouette.width=800;this.silhouette.height=465;this.silhouetteContext=this.silhouette.getContext('2d');
  }
  draw(state,camera){
    const c=this.pixels,theme=THEMES[state.theme];
    if(!this.backgrounds.has(state.theme))this.backgrounds.set(state.theme,base(theme));
    if(!this.shadows.has(state.theme))this.shadows.set(state.theme,illumination(theme));
    ctx=c;c.setTransform(.5,0,0,.5,0,0);c.clearRect(0,0,1600,930);c.imageSmoothingEnabled=false;c.drawImage(this.backgrounds.get(state.theme),0,0);
    // Foot shadows remain below every actor and furnishing, with a small cast tail.
    for(const n of [...state.people,state.player]){const [x,y]=project(n.x,n.z);ellipse(x+6,y+6,19,6,'#08061265');ellipse(x,y+2,12,4,'#0806108c');}
    if(state.player.path?.length){const dest=state.player.path.at(-1),[x,y]=project(dest.x,dest.z);c.strokeStyle='#edcea58c';c.lineWidth=1;for(let i=0;i<2;i++){c.beginPath();c.ellipse(x,y,8+i*5,4+i*2,0,0,Math.PI*2);c.stroke();}}
    if(state.trail.length){for(const n of state.trail){const [x,y]=project(n.x,n.z);R(x,y,2,2,'#c5ab8450');}}
    const sorted=[...fixtures.map(f=>({z:f.z,draw:f.draw})),{z:493,draw:()=>hearth(state.reducedMotion?0:state.time)},...state.people.map(n=>({z:n.z,draw:()=>drawFigure(c,n,state.reducedMotion?0:state.time,state.selected===n.id||state.hover===n.id)})),{z:state.player.z,draw:()=>drawFigure(c,state.player,state.reducedMotion?0:state.time,false)}];
    sorted.sort((a,b)=>a.z-b.z).forEach(n=>n.draw());
    pendant(1100,440);
    if(state.works.length>3)frame(1197,0,56,50,state.works.at(-1).pattern,83);
    if(state.hover&&state.hover.startsWith('door:')){const door=state.doors.find(d=>d.id===state.hover),a=project(door.x,door.z);ellipse(...a,33,12,'#ddbd9324');}
    this.silhouetteContext.clearRect(0,0,800,465);this.silhouetteContext.drawImage(this.scene,0,0);
    atmosphere(theme,state.time,state.reducedMotion,this.shadows.get(state.theme),this.silhouette);
    const out=this.c,dpr=Math.min(devicePixelRatio||1,2),w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    out.setTransform(dpr,0,0,dpr,0,0);out.fillStyle=theme.backdrop;out.fillRect(0,0,w,h);
    out.translate(camera.ox,camera.oy);out.scale(camera.scale,camera.scale);out.imageSmoothingEnabled=false;out.drawImage(this.scene,0,0,VIEW.width,VIEW.height);
    out.setTransform(dpr,0,0,dpr,0,0);
  }
}

import { mapLimenMotion } from './limen-motion.js';
/* Retained same-origin receiver. Preparation and entry are acknowledged before
 * ownership changes; only an explicit retry can replace the museum document. */
export function makeAperturePortal({ onOpen, onClose }) {
  const dialog=document.createElement('section');dialog.id='aperture-visit';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','The Aperture museum');dialog.setAttribute('aria-hidden','true');dialog.inert=true;
  dialog.innerHTML='<button class="aperture-return">Return now</button><div class="aperture-loading" role="status">Preparing the Sun chamber…</div>';
  const style=document.createElement('style');style.textContent=`
  #aperture-visit{position:fixed;inset:0;z-index:90;background:#0b0a0e;visibility:hidden;pointer-events:none;color:#eee8de;opacity:0;transition:none}
  #aperture-visit.preview{visibility:visible;opacity:1;background:transparent;pointer-events:none;z-index:70}#aperture-visit.preview .aperture-return,#aperture-visit.preview .aperture-loading{display:none}#aperture-visit.preview iframe{top:0;height:100%}#aperture-visit.active{visibility:visible;pointer-events:auto;opacity:1}#aperture-visit iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0b0a0e}#aperture-visit .aperture-return{position:absolute;top:20px;left:50%;transform:translateX(-50%);z-index:3;min-height:44px;padding:10px 18px;font:10px var(--mono);color:#e8ded1;background:#131318e8;border:1px solid #655c54;cursor:pointer}#aperture-visit .aperture-return:focus-visible{outline:2px solid #d6b693;outline-offset:3px}#aperture-visit .aperture-loading{position:absolute;inset:0;display:grid;place-content:center;font:12px var(--mono)}#aperture-visit.ready .aperture-loading{display:none}@media(prefers-reduced-motion:reduce){#aperture-visit{transition:none}}
  @media(max-width:650px){#aperture-visit iframe{top:0;height:100%}#aperture-visit .aperture-return{top:10px;left:16px;transform:none}#aperture-visit .aperture-loading{top:64px}}
  `;document.head.append(style);document.body.append(dialog);
  let frame=null,ready=false,active=false,revision=0,restoreFocus=null,pending=new Map(), previewPrepared=false, previewBoot=null, committing=false, epoch=0, previewError=null;
  const send=(type,extra={})=>frame?.contentWindow?.postMessage({type,...extra},location.origin);
  const request=(type,extra={})=>new Promise((resolve,reject)=>{
    const id=++revision;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Museum preparation timed out'));},20000);
    pending.set(id,{resolve,reject,timeout});send(type,{revision:id,...extra});
  });
  let boot=null, bootError=null;
  function prepare(retry=false){
    if(bootError&&!retry)return Promise.reject(bootError);
    if(retry)bootError=null;
    if(ready)return Promise.resolve();if(boot)return boot;
    boot=new Promise((resolve,reject)=>{
      const id=0;const timeout=setTimeout(()=>{pending.delete(id);boot=null;bootError=new Error('Museum load timed out');reject(bootError);},20000);pending.set(id,{resolve,reject,timeout});
      if(frame)frame.remove();frame=document.createElement('iframe');frame.title='The Aperture — navigable museum';frame.allow='fullscreen';frame.src='/sanctuary-world/aperture/index.html?host=station';frame.inert=true;dialog.append(frame);
    });return boot;
  }
  async function preparePreview(guide,passage,lens) {
    if(previewBoot)return previewBoot;
    if(previewPrepared)return;
    previewPrepared=false;previewError=null;
    const attempt=epoch;
    previewBoot=(async()=>{
      await prepare(true);await request('aperture:prepare',{guide,passage});
      if(attempt!==epoch)return;
      // The receiver warms a full room; also warm its first clipped doorway
      // view, with the visitor's actual lens, before either body starts moving.
      // This is one suspended render, never a second animation loop.
      const api=frame.contentWindow.__apertureContinuity;
      if(api&&lens){
        const motion=mapLimenMotion(guide?.object?.userData?.limenMotion);
        api.view({position:[1,1.65,25.65],quaternion:[0,Math.sin(.161),0,Math.cos(.161)],fov:lens.fov,aspect:lens.aspect,guidePosition:[0,0,22.85],guideQuaternion:[0,1,0,0],time:motion?.time||0,moving:false,motion,portalRect:[.3,.2,.4,.6]});
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
      if(attempt===epoch)previewPrepared=true;
    })().catch(error=>{if(attempt===epoch)previewError=error;throw error;}).finally(()=>{previewBoot=null;});
    return previewBoot;
  }
  let turn=null,cameraRotation=null,guideRotation=null;
  function preview(T,camera,guide,time,moving) {
    if(committing)return dialog.style.clipPath==='none';
    if(active||!previewPrepared||camera.position.z<7.15){dialog.classList.remove('preview');return false;}
    const api=frame.contentWindow.__apertureContinuity;
    if(!api)return false;
    camera.updateMatrixWorld(true);
    let rect=null,full=camera.position.z>=10.84;
    if(!full) {
      const points=[[5.36,0,10.84],[5.36,2.68,10.84],[8.04,2.68,10.84],[8.04,0,10.84]].map(p=>new T.Vector3(...p).applyMatrix4(camera.matrixWorldInverse));
      const polygon=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length],insideA=a.z<-.05,insideB=b.z<-.05;
        if(insideA)polygon.push(a);
        if(insideA!==insideB)polygon.push(a.clone().lerp(b,(-.05-a.z)/(b.z-a.z)));
      }
      if(polygon.length<3){dialog.classList.remove('preview');return false;}
      const uv=polygon.map(p=>{p.applyMatrix4(camera.projectionMatrix);return [p.x*.5+.5,-p.y*.5+.5];});
      const left=Math.max(0,Math.min(...uv.map(p=>p[0]))),right=Math.min(1,Math.max(...uv.map(p=>p[0]))),top=Math.max(0,Math.min(...uv.map(p=>p[1]))),bottom=Math.min(1,Math.max(...uv.map(p=>p[1])));
      if(right<=left||bottom<=top){dialog.classList.remove('preview');return false;}
      const inside=([x,y])=>{let sign=0;for(let i=0;i<uv.length;i++){const a=uv[i],b=uv[(i+1)%uv.length],cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);if(Math.abs(cross)<1e-8)continue;const next=Math.sign(cross);if(sign&&sign!==next)return false;sign=next;}return true;};
      full=[[0,0],[1,0],[1,1],[0,1]].every(inside);
      // Render only pixels visible through the real doorway. The lens stays
      // full-size, so approaching the threshold never changes perspective.
      rect=full?null:[left,1-bottom,right-left,bottom-top];
      dialog.style.clipPath=full?'none':'polygon('+uv.map(p=>`${p[0]*100}% ${p[1]*100}%`).join(',')+')';
    } else dialog.style.clipPath='none';
    if(!turn){turn=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);cameraRotation=new T.Quaternion();guideRotation=new T.Quaternion();}
    api.view({position:[6.7-camera.position.x,camera.position.y,32.85-camera.position.z],quaternion:cameraRotation.copy(turn).multiply(camera.quaternion).toArray(),fov:camera.fov,aspect:camera.aspect,guidePosition:[6.7-guide.position.x,guide.position.y,32.85-guide.position.z],guideQuaternion:guideRotation.copy(turn).multiply(guide.quaternion).toArray(),time,moving,motion:mapLimenMotion(guide.userData.limenMotion),portalRect:rect});
    dialog.classList.add('preview');
    return full;
  }
  async function open({direct=false,guide,speed=0}={}){
    const attempt=epoch;
    if(!previewPrepared)await preparePreview(guide);
    if(attempt!==epoch)throw Error('Entry cancelled');
    const api=frame.contentWindow.__apertureContinuity;
    if(!direct&&!api)throw Error('Museum continuity receiver unavailable');
    committing=true;restoreFocus=document.activeElement;
    // The final preview is already rendered at this exact pose. Commit keeps it.
    try {
      const commit=request('aperture:commit',{direct,speed});const token=revision;await commit;
      if(token!==revision)throw Error('Entry cancelled');
    } catch(error){committing=false;throw error;}
    committing=false;onOpen();active=true;dialog.inert=false;frame.inert=false;dialog.style.clipPath='none';dialog.classList.remove('preview');dialog.classList.add('active','ready');dialog.removeAttribute('aria-hidden');dialog.setAttribute('aria-modal','true');frame.focus();
  }
  function close(direct=true){
    epoch++;revision++;committing=false;for(const [id,p] of pending){if(id!==0){clearTimeout(p.timeout);p.reject(Error('Visit cancelled'));pending.delete(id);}}
    send('aperture:suspend');previewPrepared=false;dialog.classList.remove('preview');if(!active)return;active=false;
    if(dialog.contains(document.activeElement))document.activeElement.blur();
    frame.inert=true;dialog.classList.remove('active');dialog.removeAttribute('aria-modal');onClose({direct});
    const focus=document.querySelector('#station-journey:not([hidden]) button') || document.querySelector('#room-index-toggle');focus?.focus({preventScroll:true});dialog.inert=true;dialog.setAttribute('aria-hidden','true');
    if(direct&&restoreFocus?.isConnected&&!restoreFocus.closest('[inert]'))restoreFocus.focus({preventScroll:true});
  }
  window.addEventListener('message',ev=>{
    if(!frame||ev.source!==frame.contentWindow||ev.origin!==location.origin)return;
    if(ev.data?.type==='aperture:ready'){ready=true;boot=null;const p=pending.get(0);if(p){clearTimeout(p.timeout);p.resolve();pending.delete(0);}send('aperture:suspend');}
    if(ev.data?.type==='aperture:prepared'||ev.data?.type==='aperture:committed'){
      const p=pending.get(ev.data.revision);if(p){clearTimeout(p.timeout);p.resolve();pending.delete(ev.data.revision);}
    }
    if(ev.data?.type==='aperture:return'&&active)close(ev.data.direct===true);
  });
  dialog.querySelector('button').onclick=()=>close(true);
  return {prepare,preparePreview,preview,previewReady:()=>previewPrepared,previewError:()=>previewError,open,close,active:()=>active,ready:()=>ready};
}

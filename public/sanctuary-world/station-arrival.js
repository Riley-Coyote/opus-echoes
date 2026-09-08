/* Lightweight arrival controls also work before the 3D room has loaded. */
(() => {
  const status = document.getElementById('arrival-status');
  const directory = document.getElementById('station-directory');
  let loading;
  let webgl = false;
  try { const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2');webgl=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
  const compact = () => innerWidth < 700 || !webgl;
  document.body.classList.toggle('flat-page',compact());
  function loadRoom() {
    if(window.__station)return Promise.resolve(window.__station);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='station.connected.js?v=20260908-keyboard-aligned';
      script.onload=()=>{if(window.__station)resolve(window.__station);else{script.remove();loading=null;reject(Error('The room could not start. Please try again.'));}};
      script.onerror=()=>{script.remove();loading=null;reject(Error('The room could not load. Please try again.'));};
      document.body.append(script);
    });
    return loading;
  }
  async function act(action,source) {
    if(directory.open)directory.close();
    if(action==='terminal'&&compact()){
      const frame=directory.querySelector('iframe');
      if(!frame.src)frame.src='index.html?in=station&view=landing';
      directory.showModal();return;
    }
    if(!webgl){location.href=action==='museum'?'aperture/index.html':'index.html';return;}
    source?.setAttribute('aria-busy','true');
    if(!window.__station)status.textContent='Opening the room…';
    try {
      const station=await loadRoom();
      window.scrollTo({top:0,behavior:'instant'});
      document.body.classList.remove('reading');
      window.dispatchEvent(new Event('station:resume'));
      if(action==='museum')station.museumOpen();else station.sitDown('terminal');
      status.textContent='';
    } catch(error){status.textContent=error.message;}
    finally{source?.removeAttribute('aria-busy');}
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-station-action]');
    if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();act(link.dataset.stationAction,link);
  });
  directory.querySelector('button').onclick=()=>directory.close();
  window.addEventListener('message',event=>{
    const terminal=document.querySelector('#scr iframe');
    if(event.origin!==location.origin||![terminal?.contentWindow,directory.querySelector('iframe').contentWindow].includes(event.source)||event.data?.type!=='station:destination')return;
    const destination=event.data.destination;
    if(destination==='museum'){act('museum');return;}
    if(directory.open)directory.close();
    if(destination==='station'){window.__station?.standUp();return;}
    if(destination==='resources'){
      window.__station?.standUp();
      // Finish withdrawing from the desk before restoring the page's scroll.
      setTimeout(()=>document.getElementById('ix-'+destination)?.scrollIntoView({behavior:'smooth'}),matchMedia('(prefers-reduced-motion: reduce)').matches?0:1500);return;
    }
    if(destination==='sanctuary')location.href='index.html?go=lookout';
    if(destination==='sketchbook')location.href='museum/museum-permanent-gallery.html';
    if(destination==='charter')location.href='index.html?open=charter';
  });
  let reading=false;
  addEventListener('scroll',()=>{
    const want=scrollY>innerHeight*.65;
    if(want===reading)return;reading=want;
    document.body.classList.toggle('reading',want);
    window.dispatchEvent(new Event(want?'station:suspend':'station:resume'));
  },{passive:true});
  addEventListener('resize',()=>{
    document.body.classList.toggle('flat-page',compact());
    if(!compact())loadRoom().catch(error=>{status.textContent=error.message;});
  });
  if(!compact())loadRoom().catch(error=>{status.textContent=error.message;});
})();

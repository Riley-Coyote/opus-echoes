async (page) => {
  // Real wall-clock frames only. Do not call advanceTime in this benchmark.
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>window.__station);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const result=await page.evaluate(()=>new Promise(resolve=>{
    const canvas=document.querySelector('#gl'),gl=canvas.getContext('webgl2');
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const start=performance.now(),frames=[],tasks=[];
    const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push({at:Math.round(e.startTime-start),ms:Math.round(e.duration),phase:__station.journey().phase});});
    observer.observe({type:'longtask'});
    let last=start,previous='idle';
    function sample(now) {
      const state=__station.journey(),camera=__station.camera();
      const preview=document.querySelector('#aperture-visit').classList.contains('preview');
      const key=state.phase==='traveling'?(preview?'doorway':'hall'):state.phase;
      frames.push({phase:previous,ms:now-last});previous=key;last=now;
      if(now-start<50000){requestAnimationFrame(sample);return;}
      observer.disconnect();
      const groups={};for(const f of frames)(groups[f.phase]??=[]).push(f.ms);
      const summary=Object.fromEntries(Object.entries(groups).map(([key,a])=>{
        a.sort((a,b)=>a-b);const total=a.reduce((s,x)=>s+x,0);
        return [key,{frames:a.length,meanMs:+(total/a.length).toFixed(2),p95Ms:+a[Math.floor(a.length*.95)].toFixed(2),maxMs:+a.at(-1).toFixed(2),over33ms:a.filter(x=>x>33.5).length}];
      }));
      const receiver=document.querySelector('#aperture-visit iframe');
      const surface=receiver?.contentDocument.querySelector('#scene canvas');
      resolve({viewport:[innerWidth,innerHeight],gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unknown',bodyVersion:JSON.parse(render_game_to_text()).bodyVersion,groups:summary,longTasks:tasks,museum:surface?{fps:surface.dataset.fps,p95Ms:surface.dataset.p95Ms,scale:surface.dataset.renderScale,calls:surface.dataset.calls}:null,arrived:state.phase==='away'});
    }
    requestAnimationFrame(sample);setTimeout(()=>__station.museumOpen(),3000);
  }));
  return {...result,pageErrors:errors};
}

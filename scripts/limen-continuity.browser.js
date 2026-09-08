async (page) => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const results=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:8080/sanctuary-world/station.html?review=limen-continuity-test');
  await page.waitForFunction(()=>window.__station);
  await page.waitForTimeout(1600);
  await page.evaluate(()=>{
    window.__kept=[...document.querySelectorAll('iframe')].map(frame=>({frame,document:frame.contentDocument,time:frame.contentWindow.performance.timeOrigin}));
    window.__crossing=null;
    window.addEventListener('message',e=>{if(e.data?.type==='aperture:committed')window.__crossing=structuredClone(document.querySelector('#aperture-visit iframe').contentWindow.__apertureContinuity.state());});
    __station.museumOpen();
  });
  await page.waitForFunction(()=>document.querySelector('#aperture-visit iframe')?.contentWindow.__apertureContinuity);
  await page.waitForFunction(()=>['staging','traveling'].includes(__station.journey().phase));
  await page.evaluate(()=>{for(let i=0;i<140&&__station.camera().pos[2]<8;i++)advanceTime(200);__station.journeyPause();});
  const pause=await page.evaluate(()=>__station.camera().pos);
  await page.waitForTimeout(250);
  assert(JSON.stringify(pause)===JSON.stringify(await page.evaluate(()=>__station.camera().pos)),'Pause must hold the camera');
  // Headless tabs stay visible when another tab is selected. Exercise the
  // visibility lifecycle explicitly; this does not certify native tab switching.
  const hiddenSteps=await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    return __station.limenEmbodiment().steps;
  });
  await page.waitForTimeout(400);
  assert(await page.evaluate(()=>__station.limenEmbodiment().steps)===hiddenSteps,'Suspension must hold the simulation');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(120);
  assert(await page.evaluate(()=>__station.journey().paused),'Restoration must wait for the visitor to resume');
  assert(JSON.stringify(pause)===JSON.stringify(await page.evaluate(()=>__station.camera().pos)),'Restoration must retain the camera');
  for(const width of [1920,1440,1024,768,540,375]) {
    await page.setViewportSize({width,height:900});await page.waitForTimeout(180);
    const state=await page.evaluate(()=>{
      const panel=document.querySelector('#station-journey').getBoundingClientRect();
      const frame=document.querySelector('#aperture-visit iframe');
      const source=__station.limenMotion(),child=frame.contentWindow.__apertureContinuity.state();
      if(source.version!==3||source.steps!==child.motion.steps)throw Error('Only the station may integrate preview physics');
      const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
      if(delta(source.pose,child.motion.pose)>1e-7)throw Error('Preview body pose must match');
      for(let i=0;i<source.cloth.length;i++)for(const key of ['position','previous'])
        if(delta(source.cloth[i][key],child.motion.cloth[i][key])>1e-7)throw Error('Preview cloth and momentum must match');
      return {parent:__station.camera(),child,panel:{left:panel.left,right:panel.right,bottom:panel.bottom},preview:document.querySelector('#aperture-visit').classList.contains('preview')};
    });
    assert(state.preview,'The actual museum must remain visible through the doorway');
    assert(Math.abs(state.parent.fov-state.child.fov)<.002,'The two lenses must match after resizing');
    assert(state.panel.left>=0&&state.panel.right<=width&&state.panel.bottom<=900,'Journey controls must fit');
    await page.screenshot({path:`/tmp/limen-continuity/doorway-${width}.png`});results.push({width,lens:state.child.fov});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{__station.journeyPause();for(let i=0;i<90&&__station.camera().pos[2]<10.6;i++)advanceTime(50);__station.journeyPause();});
  await page.screenshot({path:'/tmp/limen-continuity/before-crossing.png'});
  await page.evaluate(()=>{__station.journeyPause();advanceTime(650);});
  await page.waitForFunction(()=>__station.journey().phase==='away');
  const crossing=await page.evaluate(()=>__crossing);
  assert(Math.abs(crossing.camera[2]-21.7)<.15,'Crossing must retain the physical doorway position');
  assert(Math.abs(crossing.speed-1.4)<.01,'Walking velocity must carry into the museum');
  assert(crossing.bodyVersion==='living-keeper-3','The museum must use the same Limen body');
  const museum=page.frames().find(f=>f.url().includes('/aperture/'));
  assert(await museum.locator('#places-toggle').isVisible(),'Museum controls must become available');
  assert(!(await museum.locator('body').getAttribute('class'))?.includes('arrival-preview'),'Preview presentation must release');
  await museum.locator('#trip-pause').focus();await page.keyboard.press('Enter');
  const heldCamera=await museum.evaluate(()=>__apertureContinuity.state().camera);
  await page.waitForTimeout(1100);
  assert(JSON.stringify(heldCamera)===JSON.stringify(await museum.evaluate(()=>__apertureContinuity.state().camera)),'Museum pause must hold the camera');
  assert(await museum.evaluate(()=>__apertureContinuity.state().embodiment.attention==='visitor'),'Limen should acknowledge the waiting visitor');
  await page.keyboard.press('Enter');await page.waitForTimeout(350);
  assert(JSON.stringify(heldCamera)!==JSON.stringify(await museum.evaluate(()=>__apertureContinuity.state().camera)),'Keyboard resume must continue the route');
  await museum.locator('#trip-skip').click();
  await page.screenshot({path:'/tmp/limen-continuity/inside-museum.png'});
  await page.locator('#aperture-visit .aperture-return').click();
  await page.waitForFunction(()=>__station.journey().phase==='idle');
  assert(await page.evaluate(()=>__kept.every(k=>k.frame.isConnected&&k.frame.contentDocument===k.document&&k.frame.contentWindow.performance.timeOrigin===k.time)),'Both original computer documents must survive');
  // A second visit reuses the museum document, and cancellation restores the room.
  await page.evaluate(()=>{window.__museumDocument=document.querySelector('#aperture-visit iframe').contentDocument;__station.museumOpen();__station.journeyCancel();});
  await page.waitForTimeout(500);
  assert(await page.evaluate(()=>__station.journey().phase==='idle'&&!document.querySelector('#aperture-visit').classList.contains('active')),'A cancelled preparation must not reopen');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>__station.museumOpen());
  await page.waitForFunction(()=>__station.journey().phase==='away');
  assert(await page.evaluate(()=>document.querySelector('#aperture-visit iframe').contentDocument===__museumDocument),'Repeat visit must retain museum document');
  await page.locator('#aperture-visit .aperture-return').click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  assert(errors.length===0,errors.join('\n'));
  return {passed:true,crossing,viewports:results,retainedComputers:true,cancellation:true,reducedMotion:true,visibilityLifecycle:true,keyboardPauseResume:true,pageErrors:errors};
}

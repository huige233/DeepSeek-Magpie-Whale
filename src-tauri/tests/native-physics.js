(async()=>{
  let probe=0;
  await window.__TAURI__.event.listen('smoke-eat',()=>{
    const p=WhalePhysics.bodies.find(p=>p.kind==='rice');
    if(p)p.el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
  });
  await window.__TAURI__.event.listen('smoke-probe',async()=>{
    const p=window.WhalePhysics;probe++;
    const ok=probe===1?p.bodies.length===1&&p.bodies[0].kind==='rice'&&!p.bodies[0].eating:
      probe===2?p.bodies.length===1&&p.bodies[0].kind==='pot':
      probe===3?p.bodies.length===3&&p.bodies.filter(b=>b.onHead).length===2:p.bodies.length===0;
    if(!ok)await window.__TAURI__.event.emit('smoke-report',{stage:'failed',error:'native physics probe '+probe});
    await window.__TAURI__.event.emit('smoke-report',{stage:'physics',probe,passed:ok,width:innerWidth,height:innerHeight,bodies:p.bodies.map(b=>({kind:b.kind,x:b.x,y:b.y,w:b.w,h:b.h,support:b.support==='head'?'head':b.support==='floor'?'floor':b.support?'bowl':null}))});
  });
})();

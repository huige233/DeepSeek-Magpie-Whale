(async()=>{
  let probe=0;
  await window.__TAURI__.event.listen('smoke-eat',()=>{
    const p=WhalePhysics.bodies.find(p=>p.kind==='rice');
    if(p){
      const capture=p.el.setPointerCapture;p.el.setPointerCapture=()=>{};
      p.el.onpointerdown({button:0,pointerId:999,clientX:p.x+p.w*.5,clientY:p.y+p.h*.22,preventDefault(){}});
      p.el.setPointerCapture=capture;const f=WhalePhysics.face();WhalePhysics.nativePointer([f.x,f.y,true]);
      window.__TAURI__.event.emit('smoke-report',{stage:p.eating>0?'held-face-feed':'failed',passed:p.eating>0,error:p.eating>0?null:'native held cursor did not feed',method:'native WebView2 handler and cursor fallback; no extra click/up'});
    }
  });
  await window.__TAURI__.event.listen('smoke-shield',async()=>{
    try{
      const css=WhalePhysics.layer.style.maskImage;if(!css.includes('data:image/svg+xml'))throw Error('native speech mask missing');
      const img=new Image();img.src=css.slice(5,-2);await img.decode();const c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const data=ctx.getImageData(0,0,c.width,c.height).data;let holes=0;for(let y=0;y<c.height;y+=5)for(let x=0;x<c.width;x+=5)if(WhalePhysics.shielded(x,y)&&data[(y*c.width+x)*4+3]===0)holes++;
      if(holes<10)throw Error('native speech occlusion failed');
      await window.__TAURI__.event.emit('smoke-report',{stage:'speech-above-tableware',holes,passed:true,method:'native overlay alpha mask raster and hit-test geometry'});
    }catch(e){await window.__TAURI__.event.emit('smoke-report',{stage:'failed',error:String(e)});}
  });
  await window.__TAURI__.event.listen('smoke-probe',async()=>{
    const p=window.WhalePhysics;probe++;
    const ok=probe===1?p.bodies.length===1&&p.bodies[0].kind==='rice'&&!p.bodies[0].eating:
      probe===2?p.bodies.length===1&&p.bodies[0].kind==='pot':
      probe===3?p.bodies.length===3&&p.bodies.filter(b=>b.onHead).length===2:
      probe===4||probe===5?p.bodies.length===4&&p.bodies.filter(b=>b.kind==='rice'&&!b.eating).length===1:p.bodies.length===0;
    if(!ok)await window.__TAURI__.event.emit('smoke-report',{stage:'failed',error:'native physics probe '+probe});
    await window.__TAURI__.event.emit('smoke-report',{stage:'physics',probe,passed:ok,width:innerWidth,height:innerHeight,bodies:p.bodies.map(b=>({kind:b.kind,x:b.x,y:b.y,w:b.w,h:b.h,support:b.support==='head'?'head':b.support==='floor'?'floor':b.support?'bowl':null}))});
  });
})();

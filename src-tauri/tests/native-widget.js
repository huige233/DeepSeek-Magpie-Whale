(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),invoke=window.__TAURI__.core.invoke,emit=window.__TAURI__.event.emit;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  try{
    for(let i=0;i<30&&!window.DSW?.hit.hitReady;i++)await wait(300);
    check(DSW.hit.hitReady,'native image hit mask must load');
    await emit('smoke-report',{stage:'ready',hit:DSW.hit.hitReady,cursor:await invoke('get_cursor_position')});
    const settings=await invoke('get_companion_settings');
    await invoke('save_companion_settings',{settings:{...settings,codexEnabled:true,fontFamily:'dsw-tutorial',fontScale:1.3}});
    await wait(500);DSW.bubble.showBubble();
    await document.fonts.ready;
    check(getComputedStyle(DSW.dom.textBox).fontFamily.includes('dsw-tutorial')&&document.fonts.check('700 18px dsw-tutorial'),'native embedded tutorial font');
    check([DSW.dom.amountEl,DSW.dom.hintEl,DSW.dom.periodEl].every(e=>e.scrollWidth<=e.clientWidth+1),'native quota containment');
    await emit('smoke-report',{stage:'font',saved:(await invoke('get_companion_settings')).fontFamily});
    DSW.bubble.hideBubble();DSW.interactions.action('feed');await wait(5000);
    await emit('smoke-probe',true);
    await emit('smoke-eat',true);await wait(2000);await emit('smoke-probe',true);
    DSW.interactions.action('pot');await wait(2200);DSW.interactions.action('pot');await wait(2200);await emit('smoke-probe',true);
    await emit('smoke-fixture','start');await wait(11000);
    check((await invoke('get_companion_history')).history.length===0,'requests must not notify before whole turn ends');
    await emit('smoke-report',{stage:'no-request-spam',passed:true});
    await emit('smoke-fixture','finish');await wait(5000);
    const history=(await invoke('get_companion_history')).history;
    check(history.length===1&&history[0].tokens.input===300&&history[0].tokens.output===60,'one aggregated native turn');
    await emit('smoke-report',{stage:'completed-turn',count:history.length,tokens:history[0].tokens.input+history[0].tokens.output,inside:DSW.dom.textBox.classList.contains('usage-mode')});
    DSW.interactions.action('clear');await wait(600);await emit('smoke-probe',true);
    await emit('smoke-report',{stage:'done',passed:true});
  }catch(e){await emit('smoke-report',{stage:'failed',error:String(e)});}
})();

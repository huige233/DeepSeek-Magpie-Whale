(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),invoke=window.__TAURI__.core.invoke,emit=window.__TAURI__.event.emit;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  try{
    for(let i=0;i<30&&!window.DSW?.hit.hitReady;i++)await wait(300);
    check(DSW.hit.hitReady,'native image hit mask must load');
    await emit('smoke-report',{stage:'ready',hit:DSW.hit.hitReady,cursor:await invoke('get_cursor_position')});
    const settings=await invoke('get_companion_settings');
    await invoke('save_companion_settings',{settings:{...settings,codexEnabled:true,riceOnCompletion:true,fontFamily:'dsw-tutorial',fontScale:1.3}});
    const dataDir=await invoke('get_data_dir');
    const custom=await invoke('import_component_sound',{event:'pot_land',path:dataDir+'/test-anvil.wav'});
    check((await invoke('read_component_sound',{choice:custom})).startsWith('data:audio/wav;base64,'),'native sound import/read');
    await invoke('save_companion_settings',{settings:{...(await invoke('get_companion_settings')),componentSounds:{pot_land:custom}}});
    check((await invoke('get_companion_settings')).componentSounds.pot_land===custom,'native sound selection persisted');
    await emit('smoke-report',{stage:'custom-sound',passed:true});
    const groups=await invoke('list_widget_groups');
    for(const model of ['Claude','GLM','GPT','Grok','Qwen','Gemini','Kimi']){
      const group=model+'-Chibi';check(groups.includes(group),'missing '+group);
      check((await invoke('widget_group_states',{group})).includes('main'),'missing main '+group);
      DSW.flags.widgetBody=group;DSW.images.invalidate?.();
      const src=await invoke('read_widget_image',{group,state:'main'});
      const img=new Image();img.src=src;await img.decode();check(img.width===img.height&&img.width>=610,'native image decode '+group);
    }
    DSW.flags.widgetBody='小鲸鱼';
    await emit('smoke-report',{stage:'seven-character-assets',passed:true});
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
    await emit('smoke-probe',true);await wait(300);
    DSW.magpie.showRecent();await wait(600);await emit('smoke-probe',true);
    DSW.interactions.action('clear');await wait(600);await emit('smoke-probe',true);
    await emit('smoke-report',{stage:'done',passed:true});
  }catch(e){await emit('smoke-report',{stage:'failed',error:String(e)});}
})();

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
    const beforeRoleLines=await invoke('get_companion_settings');
    check(Object.keys(beforeRoleLines.usageSources).length===0,'new sources default disabled without touching IDEs');
    await invoke('save_companion_settings',{settings:{...beforeRoleLines,characterLines:{'Claude-Chibi':{idle:['Native Claude line']},'Kimi-Chibi':{feed:['Native Kimi meal']}}}});
    await wait(100);DSW.flags.widgetBody='Claude-Chibi';check(DSW.characters.pick('idle')==='Native Claude line','live custom role dialogue');
    DSW.flags.widgetBody='Kimi-Chibi';check(DSW.characters.pick('feed')==='Native Kimi meal','live isolated role cue');
    await invoke('save_companion_settings',{settings:beforeRoleLines});DSW.flags.widgetBody='小鲸鱼';
    for(const source of ['cursor','trae'])check((await invoke('export_usage_hook',{source})).includes(source+'-hooks.example.json'),'hook export '+source);
    await emit('smoke-report',{stage:'role-dialogue-and-hook-export',passed:true});
    const custom=await invoke('import_component_sound',{event:'pot_land',path:dataDir+'/test-anvil.wav'});
    check((await invoke('read_component_sound',{choice:custom})).startsWith('data:audio/wav;base64,'),'native sound import/read');
    await invoke('save_companion_settings',{settings:{...(await invoke('get_companion_settings')),componentSounds:{pot_land:custom}}});
    check((await invoke('get_companion_settings')).componentSounds.pot_land===custom,'native sound selection persisted');
    await emit('smoke-report',{stage:'custom-sound',passed:true});
    const roleCustom=await invoke('import_component_sound',{event:'kimi_feed',path:dataDir+'/test-anvil.wav'});
    await invoke('save_companion_settings',{settings:{...(await invoke('get_companion_settings')),characterSounds:{'Kimi-Chibi':{feed:roleCustom}},characterSoundEnabled:{'Kimi-Chibi':false}}});
    const roleSaved=await invoke('get_companion_settings');
    check(roleSaved.characterSounds['Kimi-Chibi'].feed===roleCustom&&roleSaved.characterSoundEnabled['Kimi-Chibi']===false,'role custom/mute persisted');
    check(roleSaved.componentSounds.pot_land===custom,'role settings preserve component sound');
    check((await invoke('read_component_sound',{choice:roleCustom})).startsWith('data:audio/wav;base64,'),'native role sound read');
    const audioContext=new AudioContext();let audioCount=0;
    const groups=await invoke('list_widget_groups');
    for(const model of ['Claude','GLM','GPT','Grok','Qwen','Gemini','Kimi']){
      const group=model+'-Chibi';check(groups.includes(group),'missing '+group);
      const states=await invoke('widget_group_states',{group});check(states.length===9,'nine states '+group);
      DSW.flags.widgetBody=group;DSW.images.invalidate?.();
      const src=await invoke('read_widget_image',{group,state:'main'});
      const img=new Image();img.src=src;await img.decode();check(img.width===img.height&&img.width>=610,'native image decode '+group);
      const frames={main:src};
      for(const state of states.filter(s=>s!=='main')){
        const data=await invoke('read_widget_image',{group,state});const frame=new Image();frame.src=data;await frame.decode();
        check(frame.width===img.width&&frame.height===img.height,'original canvas preserved '+group+':'+state);frames[state]=data;
      }
      check(new Set(Object.values(frames)).size===9,'nine distinct frames '+group);
      for(const cue of ['pat','angry','feed']){
        const url=await WhaleCharacterAudio.resolve(group,cue,'default');
        const response=await fetch(url);check(response.ok,'bundled role sound '+group+':'+cue);
        const decoded=await audioContext.decodeAudioData(await response.arrayBuffer());
        check(decoded.duration>0.5&&decoded.duration<2&&decoded.getChannelData(0).some(v=>Math.abs(v)>.01),'native audio decode '+group+':'+cue);
        check(await WhaleCharacterAudio.play(group,cue,.01,'default'),'native HTML audio play '+group+':'+cue);
        await wait(30);WhaleCharacterAudio.stop();audioCount++;
      }
      DSW.flags.mood='normal';DSW.flags.exhaustedMode=false;DSW.flags.pressing=false;
      await new Promise(r=>DSW.images.resolve(DSW.C.IMG_URL,r));await wait(50);
      DSW.expression.syncVisualState();check(DSW.expression.isBlinkAllowed(),'blink enabled '+group);
      DSW.expression.cancelBlink(false);
      for(const [mood,state] of [['normal','main'],['shy','shy'],['angry','angry'],['disappointed','disappointed'],['exhausted','exhausted']]){
        DSW.flags.mood=mood;DSW.flags.exhaustedMode=mood==='exhausted';DSW.expression.syncVisualState();await wait(50);
        check(DSW.dom.img.src===frames[state],'native expression switch '+group+':'+state);
      }
      DSW.flags.mood='normal';DSW.flags.exhaustedMode=false;DSW.flags.pressing=true;DSW.expression.syncVisualState();await wait(50);
      check(DSW.dom.img.src===frames.main,'native press keeps original pixels '+group);DSW.flags.pressing=false;
      DSW.expression.syncVisualState();DSW.expression.enterShy();await wait(50);check(DSW.dom.img.src===frames.shy,'shy action '+group);
      DSW.expression.exitShy(false);DSW.expression.clearMoodTimers();DSW.expression.enterAngry();await wait(50);
      check(DSW.dom.img.src===frames.angry,'angry action '+group);DSW.expression.exitAngry();DSW.expression.clearMoodTimers();
      check(DSW.characters.profiles[group].idle.includes(DSW.widgetConfig.pickDialogueLine()),'character dialogue '+group);
      await emit('smoke-report',{stage:'character-expressions',group,states:states.length,passed:true});

    }
    await audioContext.close();await emit('smoke-report',{stage:'character-audio',count:audioCount,customAndMutePersisted:true,passed:true});
    DSW.flags.widgetBody='小鲸鱼';DSW.images.invalidate();DSW.expression.handleWidgetConfigChange();DSW.bubble.hideBubble();
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
    DSW.bubble.showDialogueLine('气泡应该始终在铁盆上方');await wait(900);await emit('smoke-shield',true);
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

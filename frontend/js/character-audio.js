(function(root){
  "use strict";
  const themes={Claude:"暖木琴",GLM:"狐耳铃铛",GPT:"白龙竖琴",Grok:"俏皮电子音",Qwen:"古风拨弦",Gemini:"星光钟琴",Kimi:"月夜短笛"};
  const cues=["pat","angry","feed"],cache=new Map(),last=new Map();
  let settings={},revision=0,request=0,playing=null;
  const model=group=>typeof group==="string"&&group.endsWith("-Chibi")&&Object.hasOwn(themes,group.slice(0,-6))?group.slice(0,-6):null;
  const has=group=>!!model(group);
  function stop(){request++;if(playing){playing.pause();playing=null;}}
  function configure(next){settings=next||{};revision++;cache.clear();stop();}
  function choiceFor(group,cue){return settings.characterSounds?.[group]?.[cue]||"default";}
  async function resolve(group,cue,choice){
    const name=model(group);if(!name||!cues.includes(cue))throw Error("未知角色音效");
    if(choice==="none")return null;
    if(choice==="default")return "../assets/characters/audio/"+name.toLowerCase()+"_"+cue+".wav";
    if(!choice.startsWith("custom:"))throw Error("无效角色音效");
    if(!cache.has(choice))cache.set(choice,root.__TAURI__.core.invoke("read_component_sound",{choice}).catch(e=>{cache.delete(choice);throw e;}));
    return cache.get(choice);
  }
  async function play(group,cue,volume=1,override){
    if(!has(group)||!cues.includes(cue)||volume<=0)return false;
    const preview=override!==undefined;
    if(!preview&&settings.characterSoundEnabled?.[group]===false)return false;
    const key=group+":"+cue,now=Date.now();
    if(!preview&&now-(last.get(key)||0)<180)return false;
    last.set(key,now);stop();const token=request,rev=revision;
    const src=await resolve(group,cue,override??choiceFor(group,cue));
    if(!src||token!==request||rev!==revision)return false;
    const a=new Audio(src);a.volume=Math.max(0,Math.min(1,volume));playing=a;
    a.onended=a.onerror=()=>{if(playing===a)playing=null;};
    try{await a.play();return true;}catch(e){if(playing===a)playing=null;throw e;}
  }
  function handles(){return has(root.DSW?.flags.widgetBody);}
  function trigger(cue){
    const f=root.DSW?.flags;if(!handles())return false;
    if(f.soundOn)play(f.widgetBody,cue,f.soundVol||0).catch(e=>console.warn("角色音效播放失败",String(e)));
    return true;
  }
  root.WhaleCharacterAudio={themes,cues,model,has,choiceFor,resolve,play,stop,configure};
  if(root.DSW)root.DSW.characterSound={trigger,handles,stop};
  root.__TAURI__?.core?.invoke("get_companion_settings").then(configure).catch(()=>{});
  root.__TAURI__?.event?.listen("companion-settings-changed",e=>configure(e.payload));
  root.__TAURI__?.event?.listen("widget-config-changed",stop);
  root.__TAURI__?.event?.listen("widget-visibility",e=>{if(!e.payload)stop();});
  root.addEventListener?.("beforeunload",stop);
})(typeof window==="undefined"?globalThis:window);

(function(root){
  "use strict";
  const invoke=root.__TAURI__?.core?.invoke,cache=new Map(),playing=new Set(),last=new Map();
  const files={pot_land:"pot_land.mp3",pot_tap:"pot_land.mp3",pot_off:"pot_off.mp3",rice_land:"pot_land.mp3",feed:"feed.mp3"};
  let choices={};
  const choiceFor=event=>choices[event]||(event==="pot_land"?"anvil":"default");
  function configure(settings){choices={...(settings?.componentSounds||{})};cache.clear();}
  async function resolve(event,choice){
    if(!(event in files))throw Error("未知组件音效");
    if(choice==="none")return null;
    if(choice==="anvil")return "../assets/feeding/anvil.wav";
    if(choice==="default")return "../assets/feeding/"+files[event];
    if(!choice.startsWith("custom:")||!invoke)throw Error("自定义音效不可用");
    if(!cache.has(choice))cache.set(choice,invoke("read_component_sound",{choice}).catch(e=>{cache.delete(choice);throw e;}));
    return cache.get(choice);
  }
  async function play(event,volume=1,override){
    if(volume<=0)return false;
    const now=Date.now();if(override===undefined&&now-(last.get(event)||0)<120)return false;last.set(event,now);
    const src=await resolve(event,override??choiceFor(event));if(!src)return false;
    const a=new Audio(src);a.volume=Math.max(0,Math.min(1,volume));
    if(playing.size>=6){const old=playing.values().next().value;old.pause();playing.delete(old);}
    playing.add(a);a.onended=a.onerror=()=>playing.delete(a);
    try{await a.play();return true;}catch(e){playing.delete(a);throw e;}
  }
  function stop(){for(const a of playing)a.pause();playing.clear();}
  root.WhaleComponentAudio={configure,choiceFor,resolve,play,stop};
  invoke?.("get_companion_settings").then(configure).catch(()=>{});
  root.__TAURI__?.event?.listen("companion-settings-changed",e=>configure(e.payload));
  root.addEventListener?.("beforeunload",stop);
})(typeof window==="undefined"?globalThis:window);

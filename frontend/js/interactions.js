(function (DSW) {
  "use strict";
  let count=0,busy=false,stopped=false;
  function speak(text){DSW.bubble.showDialogueLine(text);DSW.expression.resetIdle();}
  async function sync(action) {
    if(stopped||!DSW.invoke||busy&&!action)return;
    busy=true;const r=DSW.dom.img.getBoundingClientRect();
    try{await DSW.invoke("sync_physics",{pet:{x:r.x,y:r.y,width:r.width,height:r.height,left:DSW.state.h==="left",characterSound:DSW.characterSound?.handles()||false,sound:!!DSW.flags.soundOn,volume:DSW.flags.soundVol||0},action:action||null});}
    catch(e){if(action&&action!=="reward")speak("餐具窗口暂时不可用，请重启桌宠再试。");else console.warn("自动掉饭暂不可用",String(e));}
    finally{busy=false;}
  }
  function action(name){
    if(["feed","pot","clear","reward"].includes(name)){sync(name);return;}
    if(name==="usage"){DSW.magpie.showRecent();return;}
    if(name==="pat"){DSW.expression.enterShy();speak(DSW.characters?.pick("pat","摸摸可以，别把我的铁盆塔碰倒啦～")||"摸摸可以，别把我的铁盆塔碰倒啦～");}
    if(name==="talk")speak(DSW.widgetConfig.pickDialogueLine()||"我在呢，大肥鱼随时待命！");
  }
  const follow=setInterval(()=>{if(count)sync();},80);
  window.__TAURI__?.event?.listen("pet-action",e=>action(e.payload));
  window.__TAURI__?.event?.listen("physics-state",e=>{
    count=e.payload.count;DSW.flags.feeding=e.payload.feeding;
    if(e.payload.cue==="feed")DSW.characterSound?.trigger("feed");
    if(e.payload.message)speak(DSW.characters?.pick(e.payload.cue,e.payload.message)||e.payload.message);
  });
  window.__TAURI__?.event?.listen("widget-visibility",e=>{if(!e.payload){count=0;DSW.flags.feeding=false;}});
  window.addEventListener("beforeunload",()=>{stopped=true;clearInterval(follow);});
  DSW.interactions={action,isInteractiveAt:(x,y)=>!!document.elementFromPoint(x,y)?.closest(".usage-toast")};
})(window.DSW);

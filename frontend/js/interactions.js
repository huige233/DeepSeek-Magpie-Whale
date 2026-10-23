(function (DSW) {
  "use strict";
  let count=0,busy=false,stopped=false;
  let riceAutoEat=true,settingsChanged=false;
  const settingsReady=DSW.invoke?.("get_companion_settings").then(s=>{if(!settingsChanged)riceAutoEat=s.riceAutoEat!==false;}).catch(()=>{});
  window.__TAURI__?.event?.listen("companion-settings-changed",e=>{
    settingsChanged=true;riceAutoEat=e.payload.riceAutoEat!==false;if(count)sync();
  });
  function bubbleShields(){
    const shapes=[];
    for(const el of DSW.dom.bubbleBox.querySelectorAll('svg path,svg ellipse')){
      if(Number(getComputedStyle(el).opacity)<=.001)continue;
      const m=el.getScreenCTM();if(!m)continue;
      let d=el.getAttribute('d');
      if(!d){const x=+el.getAttribute('cx'),y=+el.getAttribute('cy'),rx=+el.getAttribute('rx'),ry=+el.getAttribute('ry');d=`M ${x-rx} ${y} a ${rx} ${ry} 0 1 0 ${rx*2} 0 a ${rx} ${ry} 0 1 0 ${-rx*2} 0`;}
      shapes.push({d,matrix:[m.a,m.b,m.c,m.d,m.e,m.f],stroke:22});
    }
    const toast=document.querySelector('.usage-toast:not([hidden])');
    if(toast){const r=toast.getBoundingClientRect();shapes.push({d:`M ${r.left-3} ${r.top-3} h ${r.width+6} v ${r.height+6} h ${-r.width-6} Z`,matrix:[1,0,0,1,0,0],stroke:2});}
    return shapes;
  }
  function speak(text){DSW.bubble.showDialogueLine(text);DSW.expression.resetIdle();}
  async function sync(action) {
    if(stopped||!DSW.invoke||busy&&!action)return;
    busy=true;await settingsReady;
    if(stopped){busy=false;return;}
    const r=DSW.dom.img.getBoundingClientRect();
    try{await DSW.invoke("sync_physics",{pet:{x:r.x,y:r.y,width:r.width,height:r.height,left:DSW.state.h==="left",group:DSW.flags.widgetBody,shields:bubbleShields(),riceAutoEat,characterSound:DSW.characterSound?.handles()||false,sound:!!DSW.flags.soundOn,volume:DSW.flags.soundVol||0},action:action||null});}
    catch(e){if(action&&action!=="reward")speak("餐具窗口暂时不可用，请重启桌宠再试。");else console.warn("自动掉饭暂不可用",String(e));}
    finally{busy=false;}
  }
  function action(name){
    if(["feed","pot","clear","reward"].includes(name)){sync(name);return;}
    if(name==="usage"){DSW.magpie.showRecent();return;}
    if(name==="pat"){DSW.expression.enterShy();speak(DSW.characters?.pick("pat","摸摸可以，别把我的铁盆塔碰倒啦～")||"摸摸可以，别把我的铁盆塔碰倒啦～");}
    if(name==="talk")speak(DSW.widgetConfig.pickDialogueLine()||"我在呢，大肥鱼随时待命！");
  }
  const follow=setInterval(()=>{if(count)sync();},30);
  window.__TAURI__?.event?.listen("pet-action",e=>action(e.payload));
  window.__TAURI__?.event?.listen("physics-state",e=>{
    count=e.payload.count;DSW.flags.feeding=e.payload.feeding;
    if(e.payload.cue==="feed")DSW.characterSound?.trigger("feed");
    if(e.payload.message)speak(DSW.characters?.pick(e.payload.cue,e.payload.message)||e.payload.message);
  });
  window.__TAURI__?.event?.listen("widget-visibility",e=>{if(!e.payload){count=0;DSW.flags.feeding=false;}});
  window.addEventListener("beforeunload",()=>{stopped=true;clearInterval(follow);});
  DSW.interactions={action,bubbleShields,isInteractiveAt:(x,y)=>!!document.elementFromPoint(x,y)?.closest(".usage-toast")};
})(window.DSW);

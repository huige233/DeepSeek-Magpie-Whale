(function (DSW,H) {
  "use strict";
  let settings={accountId:"",notifications:true,notificationSeconds:12,notificationPlacement:"inside"},accounts=[],error="正在连接 Magpie…",refreshing=null;
  let stopped=false,pollTimer=null,active=null,history=[],queue=[],toastTimer=null,placement="inside";
  const toast=document.createElement("aside");toast.className="usage-toast";toast.hidden=true;toast.setAttribute("aria-live","polite");document.body.appendChild(toast);
  DSW.state.peakSupported=false;
  function shortWindow(name){return String(name||"").replace(/5 hours?/i,"5小时").replace(/7 days?/i,"7天").replace(/weekly/i,"周额度").replace(/daily/i,"日额度");}
  function absoluteReset(at){const d=new Date(at);return Number.isFinite(d.getTime())?(d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+" 重置":"重置未知";}
  function countdown(at){const min=Math.ceil((Date.parse(at)-Date.now())/60000);return !Number.isFinite(min)?"重置未知":min<=0?"等待刷新":min>=1440?Math.floor(min/1440)+"天"+Math.floor(min%1440/60)+"时后重置":Math.floor(min/60)+"时"+String(min%60).padStart(2,"0")+"分后重置";}
  function fit() {
    const {amountEl,hintEl,periodEl}=DSW.dom;
    for(const [el,max,min] of [[amountEl,25,13],[hintEl,11,8],[periodEl,10,8]]){
      const ratio=settings.fontScale||1;el.style.fontSize=(max*ratio)+"px";let n=max*ratio;
      while(el.scrollWidth>el.clientWidth&&n>min){el.style.fontSize=--n+"px";}
      el.title=el.textContent;
    }
  }
  function fitText(){
    const box=DSW.dom.textBox;
    if(box.classList.contains("quota-mode")){fit();return;}
    const els=[DSW.dom.amountEl,DSW.dom.hintEl,DSW.dom.periodEl];
    els.forEach(el=>el.style.fontSize="");
    for(let step=0;step<24;step++){
      const overflow=box.scrollHeight>box.clientHeight+1||els.some(el=>el.scrollWidth>el.clientWidth+1);
      if(!overflow)break;
      let changed=false;
      els.forEach(el=>{const size=parseFloat(getComputedStyle(el).fontSize);if(size>7){el.style.fontSize=Math.max(7,size-.5)+"px";changed=true;}});
      if(!changed)break;
    }
  }
  function render(){
    if(DSW.flags.bubbleRandomActive||active)return;
    if(DSW.modular?.isActive()){DSW.dom.textBox.classList.remove("quota-mode");DSW.modular.render();return;}
    DSW.modular?.setVisible(false);DSW.dom.textBox.classList.add("quota-mode");
    const a=H.selected(accounts,settings.accountId),w=H.tightest(a),{amountEl,hintEl,periodEl}=DSW.dom;
    amountEl.textContent=error?"Magpie 未连接":w?Number(w.remaining.toFixed(1))+"%":a?.balance||"额度未知";
    hintEl.textContent=error?"请检查本机连接":a?[a.provider||a.name,a.user||a.plan].filter(Boolean).join(" · ")+(H.stale(a)?" · 旧数据":""):"请在设置中重新选择账号";
    periodEl.textContent=w?shortWindow(w.name)+"额度剩余 · "+absoluteReset(w.resetsAt):"右键打开配置";
    fit();
  }
  function refresh(){
    if(!DSW.invoke||stopped)return Promise.resolve();if(refreshing)return refreshing;
    refreshing=DSW.invoke("get_magpie_quotas").then(data=>{
      accounts=Array.isArray(data.data)?data.data:[];error="";const w=H.tightest(H.selected(accounts,settings.accountId));
      DSW.state.balance=w?w.remaining:null;DSW.state.status="ok";DSW.expression?.syncExhaustedMode();
    }).catch(e=>{error=String(e);DSW.state.balance=null;DSW.state.status="error";}).finally(()=>{refreshing=null;render();});return refreshing;
  }
  function place(){
    const r=DSW.dom.bubbleBox.getBoundingClientRect(),width=Math.min(280,innerWidth-16);
    toast.style.width=width+"px";
    const top=r.top-toast.offsetHeight-10;
    if(top<8)return false;
    toast.style.left=Math.max(8,Math.min(innerWidth-width-8,r.left+r.width*.44-width/2))+"px";
    toast.style.top=top+"px";return true;
  }
  function line(tag,text,cls){const el=document.createElement(tag);el.textContent=text;el.className=cls;toast.appendChild(el);return el;}
  function cleanup(){clearTimeout(toastTimer);toast.hidden=true;active=null;DSW.flags.usageVisible=false;DSW.dom.textBox.classList.remove("usage-mode");}
  function interrupt(){if(!active)return;cleanup();DSW.widgetConfig.scheduleNextDialogue();if(queue.length)toastTimer=setTimeout(next,500);}
  function dismiss(){const wasInside=active&&placement==="inside";cleanup();if(wasInside)DSW.bubble.hideBubble();else DSW.widgetConfig.scheduleNextDialogue();if(queue.length)toastTimer=setTimeout(next,400);}
  function inside(n){
    placement="inside";toast.hidden=true;
    // Reuse the existing thought-bubble silhouette and text layer, not an overlapping card.
    DSW.bubble.showDialogueLine("");
    clearTimeout(DSW.flags.bubbleTimer);DSW.flags.bubbleTimer=null;
    DSW.dom.textBox.classList.remove("quota-mode");DSW.dom.textBox.classList.add("usage-mode");
    DSW.bubble.applyBubbleLines([
      {t:H.noticeTitle(n),s:"C"},
      {t:H.number(n.tokens.input+n.tokens.output)+" tokens",s:"B"},
      {t:"输入 "+H.number(n.tokens.input)+" · 输出 "+H.number(n.tokens.output)+"\n"+(n.cost==null?"费用未提供":H.noticeCost(n)),s:"P",w:true}
    ]);
    for(const el of [DSW.dom.amountEl,DSW.dom.periodEl,DSW.dom.hintEl])el.style.fontSize="";
    fitText();
    DSW.dom.textBox.title=H.noticeTitle(n)+"\n"+n.model+"\n缓存 "+H.number(n.tokens.cached)+" · 推理 "+H.number(n.tokens.reasoning)+"（已含）\n"+H.noticeCost(n);
  }
  function show(n,manual=false){
    const previousBubble=!!DSW.flags.bubbleShown;
    dismiss();placement=settings.notificationPlacement==="above"?"above":"inside";
    if(placement==="above"){
      toast.replaceChildren();const close=line("button","×","usage-close");close.title="关闭提示";close.onclick=dismiss;
      line("div",H.noticeTitle(n),"usage-eyebrow");line("strong",H.number(n.tokens.input+n.tokens.output)+" tokens","usage-total");
      line("div","输入 "+H.number(n.tokens.input)+" · 输出 "+H.number(n.tokens.output),"usage-detail");
      line("div",H.noticeCost(n),"usage-foot");toast.hidden=false;
      if(!place())inside(n);
    }else inside(n);
    active=n;DSW.flags.usageVisible=true;DSW.widgetConfig.pauseDialogue();
    requestAnimationFrame(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return[r.left,r.top,r.width,r.height];};
      DSW.invoke?.("record_usage_display",{id:n.id,manual,placement,previousBubble,bubble:rect(DSW.dom.bubbleBox),toast:toast.hidden?null:rect(toast)}).catch(()=>{});
    });
    clearTimeout(toastTimer);toastTimer=setTimeout(dismiss,(settings.notificationSeconds||12)*1000);
  }
  function next(){
    if(stopped||active||!queue.length)return;
    if(DSW.flags.bubbleShown||DSW.flags.pressing||DSW.flags.drag?.active||DSW.flags.feeding){toastTimer=setTimeout(next,400);return;}
    show(queue.shift());
  }
  async function poll(){
    if(stopped||!DSW.invoke)return;
    try{const result=await DSW.invoke("poll_companion");history=result.history||[];settings=result.settings||settings;
      const events=(result.events||[]).filter(n=>n.kind==="turn");
      if(events.length){queue.push(...events);queue=queue.slice(-30);await refresh();next();}
      window.dispatchEvent(new CustomEvent("companion-status",{detail:result}));
    }catch(e){console.warn("用量监听暂不可用",String(e));}finally{if(!stopped)pollTimer=setTimeout(poll,2000);}
  }
  function stop(){stopped=true;clearTimeout(pollTimer);dismiss();queue=[];clearInterval(positionTimer);}
  const positionTimer=setInterval(()=>{if(active&&placement==="above"&&!place()){const n=active;cleanup();inside(n);active=n;DSW.flags.usageVisible=true;toastTimer=setTimeout(dismiss,(settings.notificationSeconds||12)*1000);}},100);
  DSW.magpie={render,refresh,interrupt,fitText,history:()=>history,summary:()=>{const a=H.selected(accounts,settings.accountId),w=H.tightest(a);return{amount:error?"--":w?"剩余 "+w.remaining+"%":a?.balance||"--",countdown:w?shortWindow(w.name)+" · "+countdown(w.resetsAt):"重置时间未知"};},showRecent:()=>{if(history.length)show(history[0],true);else DSW.bubble.showDialogueLine("还没有整轮用量。请在设置中开启 Codex 读取，完成一轮对话后查看。");}};
  if(DSW.invoke)DSW.invoke("get_companion_settings").then(s=>{settings=s;H.applyFont(s,document);refresh();poll();});
  window.__TAURI__?.event?.listen("companion-settings-changed",e=>{settings=e.payload;H.applyFont(settings,document);fitText();if(!settings.notifications){queue=[];dismiss();}refresh();});
  window.__TAURI__?.event?.listen("app-quit",stop);window.__TAURI__?.event?.listen("widget-visibility",e=>{if(!e.payload)dismiss();});
  window.addEventListener("beforeunload",stop);
  document.addEventListener("companion-font-ready",fitText);
})(window.DSW,window.WhaleCompanion);

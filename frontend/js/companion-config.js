(function (H) {
  "use strict";
  const invoke=window.__TAURI__?.core?.invoke;
  if(!invoke)return;
  const content=document.querySelector("main.content");
  document.querySelector(".overview-row").hidden=true;
  document.getElementById("supplierCard").hidden=true;
  const legacyToken=document.getElementById("tokenUsage");
  if(legacyToken)legacyToken.closest(".field")?.setAttribute("hidden","");
  const panel=document.createElement("section");panel.className="card companion-panel";
  panel.innerHTML=`<h2>Magpie 额度与对话用量</h2>
    <p class="companion-note">显示本机 Magpie 的额度。只读查询，不会切换账号或改变模型路由。</p>
    <label for="companionAccount">桌宠显示的账号</label><select id="companionAccount"><option value="">自动 · 最近使用的账号</option></select>
    <div class="companion-tools"><button id="companionRefresh" type="button">刷新额度</button><span id="quotaStatus" class="companion-status">正在连接…</span></div>
    <div id="companionAccounts" class="companion-accounts"></div>
    <label class="companion-toggle"><input type="checkbox" id="companionNotify">整轮对话结束后推送 Token / 费用</label>
    <label class="companion-toggle"><input type="checkbox" id="companionRice">显示整轮 Token 提示时，掉落一份大白饭</label>
    <p class="companion-note">默认关闭。仅成功完成一轮并自动展示用量时掉一份；手动查看历史、中断、失败不掉饭。等待原台词结束，白饭落在角色前面，点击或拖到脸部松手才吃。已有 12 件餐具时跳过，不覆盖用量提示。</p>
    <label class="companion-toggle"><input type="checkbox" id="companionCodex">读取本机 Codex 的整轮结束事件（可关闭）</label>
    <p class="companion-note">一次用户输入到 Codex 最终完成算一轮；中间的工具调用、多次模型请求不弹提示。只读本机用量日志，不读取密钥。关闭后仍显示 Magpie 额度，但不伪造整轮通知。费用仅在 Magpie 完整记录与本轮用量匹配时显示。</p>
    <label for="companionPlacement">用量提示位置</label><select id="companionPlacement"><option value="inside">肥鱼对话气泡里面（默认）</option><option value="above">气泡上方（空间不足时放回气泡内）</option></select><p class="companion-note">自动提示等待当前台词结束，不遮盖气泡。完整缓存、推理用量可在下方历史中查看。</p>
    <div class="companion-tools"><label>提示停留 <input id="companionSeconds" class="companion-port" type="number" min="5" max="120"> 秒</label></div>
    <details><summary>连接设置</summary><div class="companion-tools"><label>本机端口 <input id="companionPort" class="companion-port" type="number" min="1" max="65535"></label><button id="companionSave" type="button">保存连接与提示设置</button></div></details>
    <p id="companionSaveStatus" class="companion-status" role="status"></p>
    <p id="companionMonitor" class="companion-status">等待用量监听启动…</p>
    <details class="companion-history"><summary>最近 30 条用量（本次运行）</summary><div id="companionHistory">还没有新记录</div></details>`;
  content.prepend(panel);
  const $=id=>document.getElementById(id);
  const nav=document.createElement("nav");nav.className="companion-tabs";nav.setAttribute("aria-label","设置分类");
  const appearance=Array.from(content.children).find(e=>e.querySelector("h2")?.textContent==="挂件配置");
  const system=Array.from(content.children).find(e=>e.querySelector("h2")?.textContent==="系统配置");
  const fontPanel=document.createElement("section");fontPanel.className="card companion-panel";
  fontPanel.innerHTML=`<h2>气泡字体与角色台词</h2>
    <label class="companion-toggle"><input type="checkbox" id="characterDialogue">七位 AI 娘使用角色专属台词</label>
    <p class="companion-note">按当前角色切换闲聊、摸头、害羞、生气、喂饭等文案。原自定义台词不被改写；关闭后恢复原台词。肥鱼和其他自定义角色不受影响。</p>
    <label for="companionFont">字体名称（可输入已安装的字体）</label>
    <input id="companionFont" class="companion-font-input" list="companionFonts" maxlength="100" placeholder="Microsoft YaHei UI">
    <datalist id="companionFonts"><option value="dsw-tutorial">使用教程同款 · 星期八de電子日記</option><option value="Microsoft YaHei UI">微软雅黑</option><option value="DengXian">等线</option><option value="SimHei">黑体</option><option value="SimSun">宋体</option><option value="KaiTi">楷体</option><option value="FangSong">仿宋</option></datalist>
    <div class="companion-tools"><button id="companionTutorialFont" type="button">使用教程同款字体</button></div>
    <div class="companion-tools"><label>字号比例 <input id="companionFontScale" type="number" min="80" max="140" step="5" value="100"> %</label><button id="companionFontReset" type="button">恢复默认字体</button></div>
    <p class="whale-font-preview">大肥鱼吃饭啦 · 12,345 tokens · 剩余 80%</p>
    <p class="companion-note">教程同款为内置「星期八de電子日記」（XQBDDZRJ），无需安装。修改后自动保存，统一应用于额度、台词和用量提示。不存在的字体会回退到微软雅黑；长文字自动缩小以留在气泡内。自定义气泡模块单独指定的字体保持不变。</p><p id="companionFontStatus" role="status"></p>`;
  content.appendChild(fontPanel);
  const soundEvents={pot_land:"铁盆砸落 / 叠上头顶",pot_tap:"点击敲盆",pot_off:"摘下铁盆",rice_land:"白饭落地 / 碰撞",feed:"开始进食"};
  const soundPanel=document.createElement("section");soundPanel.className="card companion-panel";
  soundPanel.innerHTML='<h2>组件音效</h2><p class="companion-note">每种交互独立选择音效，播放跟随桌宠的声音总开关和音量。铁砧是内置合成金属重击声，并非游戏原音。可导入自己的 WAV / MP3 / OGG / FLAC / M4A（每个不超过 8 MiB）；导入后复制到本软件 data，移动原文件不影响使用。</p>';
  for(const [key,label] of Object.entries(soundEvents)){
    const row=document.createElement("div");row.className="component-sound-row";
    row.innerHTML=`<label for="sound-${key}">${label}</label><select id="sound-${key}"><option value="default">原版音效</option><option value="anvil">铁砧 · 金属重击</option><option value="none">此项静音</option></select><div class="companion-tools"><button type="button" id="preview-${key}">试听</button><button type="button" id="import-${key}">导入音效</button></div>`;
    soundPanel.appendChild(row);
  }
  const soundStatus=document.createElement("p");soundStatus.id="componentSoundStatus";soundStatus.className="companion-status";soundStatus.setAttribute("role","status");soundPanel.appendChild(soundStatus);content.appendChild(soundPanel);
  const groups=[[panel],[appearance,soundPanel],[fontPanel,$("dialogueCard"),$("bubbleCard")],[system]];
  ["额度概览","桌宠外观","气泡与台词","进阶设置"].forEach((name,i)=>{
    const b=document.createElement("button");b.type="button";b.textContent=name;
    b.onclick=()=>{groups.forEach((g,j)=>g.forEach(e=>{if(e)e.hidden=i!==j;}));Array.from(nav.children).forEach((e,j)=>{e.classList.toggle("is-active",i===j);e.setAttribute("aria-current",i===j?"page":"false");});};nav.appendChild(b);
  });
  content.prepend(nav);nav.firstChild.click();
  let settings,accounts=[],saving=false,saveAgain=false,refreshing=false;
  function text(parent,tag,value,className) {const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;parent.appendChild(e);return e;}
  function renderAccounts() {
    const selected=H.selected(accounts,settings.accountId);
    $("companionAccount").replaceChildren(new Option("自动 · 最近使用的账号",""));
    accounts.forEach(a=>$("companionAccount").add(new Option((a.name||a.provider)+(a.user?" · "+a.user:"")+(a.plan?" · "+a.plan:""),H.accountId(a))));
    if(settings.accountId&&!accounts.some(a=>H.accountId(a)===settings.accountId))$("companionAccount").add(new Option("原选账号不可用，请重新选择",settings.accountId));
    $("companionAccount").value=settings.accountId;
    $("companionAccounts").replaceChildren();
    accounts.forEach(a=>{
      const card=document.createElement("article");card.className="companion-account"+(a===selected?" is-selected":"");
      text(card,"h3",(a.name||a.provider)+(a===selected?" · 当前显示":""));
      text(card,"small",[a.plan,a.user].filter(Boolean).join(" · "));
      if(a.balance)text(card,"div",a.balance,"companion-window");
      H.windows(a).forEach(w=>{
        const e=text(card,"div",w.name+" · "+(w.remaining===null?"额度未知":"剩余 "+w.remaining+"%"),"companion-window");
        if(w.remaining!==null){const p=document.createElement("progress");p.max=100;p.value=w.remaining;e.appendChild(p);}
        text(e,"em",H.reset(w.resetsAt));
      });
      text(card,"small",a.readAt?(H.stale(a)?"旧数据 · ":"读取于 ")+new Date(a.readAt).toLocaleString():"读取时间未提供");
      $("companionAccounts").appendChild(card);
    });
  }
  async function refresh() {
    if(refreshing||!settings)return;refreshing=true;$("companionRefresh").disabled=true;
    try {const r=await invoke("get_magpie_quotas");accounts=r.data||[];renderAccounts();$("quotaStatus").textContent="已连接 · "+accounts.length+" 个账号";$("quotaStatus").classList.remove("is-error");}
    catch(e){$("quotaStatus").textContent=String(e);$("quotaStatus").classList.add("is-error");$("companionAccounts").replaceChildren();}
    finally{refreshing=false;$("companionRefresh").disabled=false;}
  }
  async function save() {
    if(!settings)return;
    if(saving){saveAgain=true;return;}
    if(!$("companionFontScale").reportValidity()||!$("companionPort").reportValidity()||!$("companionSeconds").reportValidity())return;
    saving=true;
    try {
      settings=await invoke("save_companion_settings",{settings:{...settings,accountId:$("companionAccount").value,notifications:$("companionNotify").checked,riceOnCompletion:$("companionRice").checked,characterDialogue:$("characterDialogue").checked,codexEnabled:$("companionCodex").checked,port:Number($("companionPort").value),notificationSeconds:Number($("companionSeconds").value),notificationPlacement:$("companionPlacement").value,fontFamily:$("companionFont").value,fontScale:Number($("companionFontScale").value)/100,componentSounds:Object.fromEntries(Object.keys(soundEvents).map(key=>[key,$("sound-"+key).value]))}});
      $("companionSaveStatus").textContent="已保存，桌宠立即生效";$("companionFontStatus").textContent="字体已保存，桌宠立即生效";H.applyFont(settings,document);await refresh();
    }catch(e){$("companionSaveStatus").textContent="保存失败："+String(e);$("companionFontStatus").textContent="保存失败："+String(e);}finally{saving=false;if(saveAgain){saveAgain=false;save();}}
  }
  function status(r) {
    $("companionMonitor").textContent=[r.magpieError||"Magpie 额度已连接（不逐请求推送）",settings?.codexEnabled?(r.codexError||"Codex 监听中 · "+(r.codexFiles||0)+" 个近期会话文件"):"Codex 本机读取已关闭"].join("\n");
    if(!r.history?.length)return;
    $("companionHistory").replaceChildren();
    r.history.forEach(n=>{const row=text($("companionHistory"),"article","");text(row,"strong",H.noticeTitle(n)+" · "+H.number(n.tokens.input+n.tokens.output)+" tokens");text(row,"div",n.model+" · "+H.noticeCost(n));text(row,"small",new Date(n.at).toLocaleString()+" · 输入 "+H.number(n.tokens.input)+" / 输出 "+H.number(n.tokens.output)+" / 缓存 "+H.number(n.tokens.cached)+" / 推理 "+H.number(n.tokens.reasoning)+"（已含）");});
  }
  $("companionRefresh").onclick=refresh;$("companionSave").onclick=save;
  ["characterDialogue","companionAccount","companionNotify","companionRice","companionCodex","companionSeconds","companionPlacement","companionFont","companionFontScale"].forEach(id=>$(id).onchange=save);
  function previewFont(){H.applyFont({fontFamily:$("companionFont").value,fontScale:Number($("companionFontScale").value)/100},document);}
  $("companionFont").oninput=previewFont;$("companionFontScale").oninput=previewFont;
  $("companionFontReset").onclick=()=>{$("companionFont").value="Microsoft YaHei UI";$("companionFontScale").value=100;previewFont();save();};
  $("companionTutorialFont").onclick=()=>{$("companionFont").value="dsw-tutorial";previewFont();save();};
  function setSound(key,value){const select=$("sound-"+key);if(value.startsWith("custom:")&&!Array.from(select.options).some(o=>o.value===value))select.add(new Option("已导入自定义音效",value));select.value=value;}
  for(const key of Object.keys(soundEvents)){
    $("sound-"+key).onchange=save;
    $("preview-"+key).onclick=async()=>{try{window.WhaleComponentAudio.stop();const played=await window.WhaleComponentAudio.play(key,.5,$("sound-"+key).value);soundStatus.textContent=played?"正在试听 · 50% 音量":"此项已静音";}catch(e){soundStatus.textContent="音效无法播放，请重新导入："+String(e);}};
    $("import-"+key).onclick=async()=>{const button=$("import-"+key);button.disabled=true;try{const path=await invoke("pick_audio_file");if(!path)return;const choice=await invoke("import_component_sound",{event:key,path});setSound(key,choice);await save();soundStatus.textContent="音效已复制到本软件，选择已保存";}catch(e){soundStatus.textContent="导入失败："+String(e);}finally{button.disabled=false;}};
  }
  invoke("get_companion_settings").then(s=>{
    for(const key of Object.keys(soundEvents))setSound(key,s.componentSounds?.[key]||(key==="pot_land"?"anvil":"default"));
    settings=s;$("characterDialogue").checked=s.characterDialogue!==false;$("companionFont").value=s.fontFamily||"Microsoft YaHei UI";$("companionFontScale").value=Math.round((s.fontScale||1)*100);H.applyFont(s,document);$("companionPlacement").value=s.notificationPlacement||"inside";$("companionNotify").checked=s.notifications;$("companionRice").checked=!!s.riceOnCompletion;$("companionCodex").checked=s.codexEnabled;$("companionPort").value=s.port;$("companionSeconds").value=s.notificationSeconds;refresh();
    invoke("get_companion_history").then(status);
  }).catch(e=>{$("quotaStatus").textContent=String(e);});
  window.__TAURI__?.event?.listen("companion-status",e=>status(e.payload));
  setInterval(refresh,60000);
})(window.WhaleCompanion);

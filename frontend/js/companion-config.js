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
    <p class="companion-note">默认关闭。仅成功完成一轮并自动展示用量时掉一份；手动查看历史、中断、失败不掉饭。等待原台词结束，白饭落在角色前面，点击或送到脸前即吃，无需松手。已有 12 件餐具时跳过，不覆盖用量提示。</p>
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
  const sources={claude:"Claude Code",ccswitch:"CC Switch",opencode:"OpenCode",cursor:"Cursor",trae:"Trae"};
  const sourcePanel=document.createElement("section");sourcePanel.className="card companion-panel";
  sourcePanel.innerHTML='<h2>AI IDE 用量来源</h2><p class="companion-note">独立开关、阶段模式和读取间隔。仅从启用后开始通知，不补弹历史；改路径/模式会重新建立监听边界。新来源默认关闭，原 Codex 配置保留。读取只涉及本地记录，不切换账号、不读取密钥、不执行 CC Switch 的供应商脚本。</p>';
  for(const [key,label] of Object.entries(sources)){
    const item=document.createElement("fieldset");item.className="ide-usage-source";
    const note={claude:"读取 .claude/projects。整轮等待 system/turn_duration；不支持该标记的版本请选阶段模式。原生子代理不单独推送，统计主会话已记录用量。",ccswitch:"只读 cc-switch.db 的代理请求记录，仅支持阶段通知；跳过已启用的 Codex / Claude Code / OpenCode 以及镜像会话记录，避免重复。数据库没有独立推理数时无法拆分。",opencode:"只读 opencode.db，支持 V1/V2；V2 等待 idle 标记，V1 等待最终响应。子代理不单独推送。",cursor:"需导出模板并合并到 ~/.cursor/hooks.json；仅使用 start/stop 元数据，不记录正文。IDE 不提供 Token 时显示“Token 未提供”，不伪造 0。",trae:"需导出模板并合并到 TRAE 的 Hook 配置（国内版 ~/.trae-cn/hooks.json，或项目 .trae/hooks.json）。使用 Notification / idle_prompt 完成通知，不以可阻断的 Stop 作为结束。官方事件不保证提供 Token，届时只提示完成，不估算。"}[key];
    item.innerHTML=`<legend>${label}</legend><label class="companion-toggle"><input id="source-${key}" type="checkbox">启用读取</label><label>通知阶段 <select id="sourceMode-${key}"><option value="turn">整轮结束（默认）</option><option value="stage">每次请求 / 阶段结束</option></select></label><label>读取间隔 <input id="sourceInterval-${key}" type="number" min="2" max="300" value="5"> 秒</label><label for="sourcePath-${key}">本地路径（留空自动定位）</label><input id="sourcePath-${key}" class="companion-font-input" maxlength="2048"><p class="companion-note">${note}</p><p id="sourceStatus-${key}" role="status">已关闭</p>`;
    sourcePanel.appendChild(item);
    if(key==="cursor"||key==="trae"){
      const b=document.createElement("button");b.type="button";b.textContent="导出 Hook 接入模板（不覆盖 IDE 配置）";
      b.onclick=async()=>{try{const path=await invoke("export_usage_hook",{source:key});$("sourceStatus-"+key).textContent="模板已生成："+path+"。请合并 hooks 条目，勿覆盖原配置；移动便携目录后需重新导出。";}catch(e){$("sourceStatus-"+key).textContent=String(e);}};item.appendChild(b);
    }
    const mode=item.querySelector("select");if(key==="ccswitch"){mode.value="stage";mode.disabled=true;}if(key==="cursor"||key==="trae"){mode.value="turn";mode.disabled=true;}
  }
  content.appendChild(sourcePanel);
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
  let roleLines={};
  const dialogueEditor=document.createElement("div");dialogueEditor.className="role-dialogue-editor";
  dialogueEditor.innerHTML='<label for="roleDialogueGroup">台词所属角色</label><select id="roleDialogueGroup"><option value="">肥鱼 / 原自定义台词（保留原列表）</option></select><div id="roleDialogueFields" hidden><label for="roleDialogueCue">互动场景</label><select id="roleDialogueCue"></select><label for="roleDialogueText">每行一条（最多 100 条，每条 300 字）</label><textarea id="roleDialogueText" rows="7" spellcheck="false"></textarea><div class="companion-tools"><button type="button" id="roleDialogueSave">保存这位角色的台词</button><button type="button" id="roleDialogueReset">恢复这个场景的原配台词</button></div><p class="companion-note">只修改所选角色与场景，不切换桌宠、不覆盖其他角色。留空恢复原配；七位角色需开启专属台词。播放模式与间隔仍使用下方公共设置。</p><p id="roleDialogueStatus" role="status"></p></div>';
  $("dialogueBody").querySelector(".collapsible-inner").prepend(dialogueEditor);
  const dialogueProfiles=window.DSW.characters.profiles;
  for(const key of Object.keys(dialogueProfiles))$("roleDialogueGroup").add(new Option(key.replace("-Chibi"," 娘"),key));
  for(const [key,label] of Object.entries({idle:"日常闲聊",pat:"摸头",shy:"害羞",angry:"生气",warn:"连点提醒",lonely:"失落 / 久未互动",return:"回来啦",feed:"开始吃饭",fed:"吃饱",exhausted:"疲惫"}))$("roleDialogueCue").add(new Option(label,key));
  function renderRoleDialogue(){
    const group=$("roleDialogueGroup").value,cue=$("roleDialogueCue").value;
    $("roleDialogueFields").hidden=!group;$("dialogueList").hidden=!!group;$("addLine").hidden=!!group;$("resetLines").hidden=!!group;
    $("roleDialogueText").value=group?(roleLines[group]?.[cue]||dialogueProfiles[group][cue]).join("\n"):"";
    $("roleDialogueStatus").textContent=roleLines[group]?.[cue]?"正在编辑自定义台词":"正在使用原配台词";
  }
  $("roleDialogueGroup").onchange=renderRoleDialogue;$("roleDialogueCue").onchange=renderRoleDialogue;
  $("roleDialogueSave").onclick=async()=>{const group=$("roleDialogueGroup").value,cue=$("roleDialogueCue").value,lines=$("roleDialogueText").value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(lines.length>100||lines.some(s=>Array.from(s).length>300)){$("roleDialogueStatus").textContent="超出条数或长度限制，未保存";return;}(roleLines[group]??={})[cue]=lines;if(!lines.length)delete roleLines[group][cue];if(await save()){$("roleDialogueStatus").textContent="已保存，只影响当前角色与场景";}else{$("roleDialogueStatus").textContent="保存失败，请重试";}};
  $("roleDialogueReset").onclick=async()=>{const group=$("roleDialogueGroup").value,cue=$("roleDialogueCue").value;if(roleLines[group])delete roleLines[group][cue];if(await save())renderRoleDialogue();};
  renderRoleDialogue();
  const soundEvents={pot_land:"铁盆砸落 / 叠上头顶",pot_tap:"点击敲盆",pot_off:"摘下铁盆",rice_land:"白饭落地 / 碰撞",feed:"开始进食"};
  const soundPanel=document.createElement("section");soundPanel.className="card companion-panel";
  soundPanel.innerHTML='<h2>组件音效</h2><p class="companion-note">每种交互独立选择音效，播放跟随桌宠的声音总开关和音量。铁砧是内置合成金属重击声，并非游戏原音。可导入自己的 WAV / MP3 / OGG / FLAC / M4A（每个不超过 8 MiB）；导入后复制到本软件 data，移动原文件不影响使用。</p>';
  for(const [key,label] of Object.entries(soundEvents)){
    const row=document.createElement("div");row.className="component-sound-row";
    row.innerHTML=`<label for="sound-${key}">${label}</label><select id="sound-${key}"><option value="default">原版音效</option><option value="anvil">铁砧 · 金属重击</option><option value="none">此项静音</option></select><div class="companion-tools"><button type="button" id="preview-${key}">试听</button><button type="button" id="import-${key}">导入音效</button></div>`;
    soundPanel.appendChild(row);
  }
  const soundStatus=document.createElement("p");soundStatus.id="componentSoundStatus";soundStatus.className="companion-status";soundStatus.setAttribute("role","status");soundPanel.appendChild(soundStatus);content.appendChild(soundPanel);
  const roleAudio=window.WhaleCharacterAudio;
  let roleSounds={},roleEnabled={};
  const rolePanel=document.createElement("section");rolePanel.className="card companion-panel";
  rolePanel.innerHTML='<h2>每位角色的互动音效</h2><p class="companion-note">七套原创合成音效，不是角色配音。摸头、生气、吃饭各有独立声音，跟随桌宠声音总开关与音量。这里选择角色只编辑其音效，不切换桌宠。旧音效组和组件音效保留；七位角色的进食使用这里的设置，不叠播公共进食声。</p><label for="roleSoundModel">要编辑的角色</label><select id="roleSoundModel"></select><label class="companion-toggle"><input type="checkbox" id="roleSoundEnabled">启用这位角色的互动音效</label>';
  for(const cue of roleAudio.cues){
    const label={pat:"摸头 / 轻按",angry:"生气",feed:"开始吃饭"}[cue],row=document.createElement("div");row.className="component-sound-row";
    row.innerHTML=`<label for="roleSound-${cue}">${label}</label><select id="roleSound-${cue}"><option value="default">角色原配音效</option><option value="none">此项静音</option></select><div class="companion-tools"><button type="button" id="rolePreview-${cue}">试听</button><button type="button" id="roleImport-${cue}">替换音效</button></div>`;rolePanel.appendChild(row);
  }
  rolePanel.insertAdjacentHTML("beforeend",'<p class="companion-note">可替换为 WAV / MP3 / OGG / FLAC / M4A，最多 8 MiB；文件复制到本软件 data，原文件移走也可使用。试听为 50% 音量，显式试听不受角色开关影响。</p><p id="roleSoundStatus" role="status"></p>');
  content.appendChild(rolePanel);
  for(const [name,theme] of Object.entries(roleAudio.themes))$("roleSoundModel").add(new Option(name+" · "+theme,name+"-Chibi"));
  function renderRole(){
    const group=$("roleSoundModel").value;$("roleSoundEnabled").checked=roleEnabled[group]!==false;
    for(const cue of roleAudio.cues){const sel=$("roleSound-"+cue),choice=roleSounds[group]?.[cue]||"default";
      sel.replaceChildren(new Option("角色原配 · "+roleAudio.themes[roleAudio.model(group)],"default"),new Option("此项静音","none"));
      if(choice.startsWith("custom:"))sel.add(new Option("已替换的自定义音效",choice));sel.value=choice;
    }
  }
  $("roleSoundModel").onchange=()=>{roleAudio.stop();renderRole();};
  $("roleSoundEnabled").onchange=()=>{roleEnabled[$("roleSoundModel").value]=$("roleSoundEnabled").checked;save();};
  for(const cue of roleAudio.cues){
    $("roleSound-"+cue).onchange=()=>{const group=$("roleSoundModel").value;(roleSounds[group]??={})[cue]=$("roleSound-"+cue).value;save();};
    $("rolePreview-"+cue).onclick=async()=>{try{window.WhaleComponentAudio.stop();const ok=await roleAudio.play($("roleSoundModel").value,cue,.5,$("roleSound-"+cue).value);$("roleSoundStatus").textContent=ok?"正在试听 · 50% 音量":"此项已静音";}catch(e){$("roleSoundStatus").textContent="无法播放，请重新替换："+String(e);}};
    $("roleImport-"+cue).onclick=async()=>{const button=$("roleImport-"+cue),group=$("roleSoundModel").value;button.disabled=true;try{const path=await invoke("pick_audio_file");if(!path)return;const choice=await invoke("import_component_sound",{event:roleAudio.model(group).toLowerCase()+"_"+cue,path});(roleSounds[group]??={})[cue]=choice;renderRole();await save();$("roleSoundStatus").textContent="已替换 "+group+" 的音效，文件已复制到本软件";}catch(e){$("roleSoundStatus").textContent="替换失败："+String(e);}finally{button.disabled=false;}};
  }
  const groups=[[panel,sourcePanel],[appearance,soundPanel,rolePanel],[fontPanel,$("dialogueCard"),$("bubbleCard")],[system]];
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
    if(!$("companionFontScale").reportValidity()||!$("companionPort").reportValidity()||!$("companionSeconds").reportValidity()||Object.keys(sources).some(key=>!$("sourceInterval-"+key).reportValidity()))return;
    saving=true;
    try {
      settings=await invoke("save_companion_settings",{settings:{...settings,usageSources:Object.fromEntries(Object.keys(sources).map(key=>[key,{enabled:$("source-"+key).checked,path:$("sourcePath-"+key).value,mode:$("sourceMode-"+key).value,intervalSeconds:Number($("sourceInterval-"+key).value)}])),characterLines:JSON.parse(JSON.stringify(roleLines)),characterSounds:JSON.parse(JSON.stringify(roleSounds)),characterSoundEnabled:{...roleEnabled},accountId:$("companionAccount").value,notifications:$("companionNotify").checked,riceOnCompletion:$("companionRice").checked,characterDialogue:$("characterDialogue").checked,codexEnabled:$("companionCodex").checked,port:Number($("companionPort").value),notificationSeconds:Number($("companionSeconds").value),notificationPlacement:$("companionPlacement").value,fontFamily:$("companionFont").value,fontScale:Number($("companionFontScale").value)/100,componentSounds:Object.fromEntries(Object.keys(soundEvents).map(key=>[key,$("sound-"+key).value]))}});
      $("companionSaveStatus").textContent="已保存，桌宠立即生效";$("companionFontStatus").textContent="字体已保存，桌宠立即生效";H.applyFont(settings,document);await refresh();return true;
    }catch(e){$("companionSaveStatus").textContent="保存失败："+String(e);$("companionFontStatus").textContent="保存失败："+String(e);}finally{saving=false;if(saveAgain){saveAgain=false;save();}}
  }
  function status(r) {
    for(const key of Object.keys(sources))if(r.sourceStatus?.[key])$("sourceStatus-"+key).textContent=r.sourceStatus[key];
    $("companionMonitor").textContent=[r.magpieError||"Magpie 额度已连接（不逐请求推送）",settings?.codexEnabled?(r.codexError||"Codex 监听中 · "+(r.codexFiles||0)+" 个近期会话文件"):"Codex 本机读取已关闭"].join("\n");
    if(!r.history?.length)return;
    $("companionHistory").replaceChildren();
    r.history.forEach(n=>{const row=text($("companionHistory"),"article","");text(row,"strong",H.noticeTitle(n)+" · "+H.noticeTotal(n));text(row,"div",n.model+" · "+H.noticeCost(n));text(row,"small",new Date(n.at).toLocaleString()+" · "+(n.usageUnavailable?"IDE 未提供 Token 计数":("输入 "+H.number(n.tokens.input)+" / 输出 "+H.number(n.tokens.output)+" / "+H.noticeBreakdown(n))));});
  }
  $("companionRefresh").onclick=refresh;$("companionSave").onclick=save;
  ["characterDialogue","companionAccount","companionNotify","companionRice","companionCodex","companionSeconds","companionPlacement","companionFont","companionFontScale"].forEach(id=>$(id).onchange=save);
  for(const key of Object.keys(sources))for(const prefix of ["source-","sourceMode-","sourcePath-","sourceInterval-"])$(prefix+key).onchange=save;
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
    roleLines=JSON.parse(JSON.stringify(s.characterLines||{}));renderRoleDialogue();
    for(const key of Object.keys(sources)){const v=s.usageSources?.[key]||{};$("source-"+key).checked=!!v.enabled;$("sourcePath-"+key).value=v.path||"";$("sourceInterval-"+key).value=v.intervalSeconds||5;$("sourceMode-"+key).value=key==="ccswitch"?"stage":(key==="cursor"||key==="trae")?"turn":v.mode||"turn";}
    for(const key of Object.keys(soundEvents))setSound(key,s.componentSounds?.[key]||(key==="pot_land"?"anvil":"default"));
    roleSounds=JSON.parse(JSON.stringify(s.characterSounds||{}));roleEnabled={...(s.characterSoundEnabled||{})};renderRole();
    settings=s;$("characterDialogue").checked=s.characterDialogue!==false;$("companionFont").value=s.fontFamily||"Microsoft YaHei UI";$("companionFontScale").value=Math.round((s.fontScale||1)*100);H.applyFont(s,document);$("companionPlacement").value=s.notificationPlacement||"inside";$("companionNotify").checked=s.notifications;$("companionRice").checked=!!s.riceOnCompletion;$("companionCodex").checked=s.codexEnabled;$("companionPort").value=s.port;$("companionSeconds").value=s.notificationSeconds;refresh();
    invoke("get_companion_history").then(status);
  }).catch(e=>{$("quotaStatus").textContent=String(e);});
  window.__TAURI__?.event?.listen("companion-status",e=>status(e.payload));
  setInterval(refresh,60000);
})(window.WhaleCompanion);

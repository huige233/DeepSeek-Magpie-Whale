// Run against an isolated release EXE with WebView2 remote debugging on 9328.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dir=path.resolve(process.argv[2]),pid=process.argv[3];
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
let browser;
for(let i=0;i<60;i++){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9328');break;}catch{await pause();}
}
assert.ok(browser,'isolated debugging endpoint is available');
let fixture;
try{
  let widget,physics;
  for(let i=0;i<100;i++){
    const pages=browser.contexts().flatMap(context=>context.pages());
    widget=pages.find(page=>page.url().includes('widget.html'));
    physics=pages.find(page=>page.url().includes('physics.html'));
    if(widget&&physics)break;
    await pause();
  }
  assert.ok(widget&&physics);
  assert.equal(path.resolve(await widget.evaluate(()=>__TAURI__.core.invoke('get_data_dir'))),
    path.join(dir,'data'),'never change desktop settings');
  await widget.waitForFunction(()=>DSW?.interactions);
  await physics.waitForFunction(()=>window.WhalePhysics);
  fixture=spawn('python',[fileURLToPath(new URL('./native-topmost-fixture.py',import.meta.url)),pid],
    {stdio:['pipe','pipe','inherit']});
  const replies=createInterface({input:fixture.stdout})[Symbol.asyncIterator]();
  async function command(action){
    fixture.stdin.write(JSON.stringify({action})+'\n');
    const {value,done}=await Promise.race([
      replies.next(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fixture timed out')),5000).unref()),
    ]);
    assert.ok(!done,'native fixture remains alive');
    const result=JSON.parse(value);assert.ok(!result.error,result.error);return result;
  }
  const setTop=enabled=>widget.evaluate(async enabled=>{
    const settings=await __TAURI__.core.invoke('get_companion_settings');
    await __TAURI__.core.invoke('save_companion_settings',{settings:{...settings,alwaysOnTop:enabled}});
  },enabled);
  const row=(state,title)=>state.windows.find(window=>window.title===title);
  const above=(state,a,b)=>state.windows.indexOf(row(state,a))<state.windows.indexOf(row(state,b));
  async function until(predicate,label){
    let state;
    for(let i=0;i<40;i++){state=await command('snapshot');if(predicate(state))return state;await pause();}
    assert.fail(label+': '+JSON.stringify(state));
  }
  if(process.argv[4]==='hidden'){
    await setTop(true);
    const before=await command('snapshot');
    assert.equal(row(before,'小鲸鱼').visible,false,'pet starts app-managed hidden');
    await command('topmost');
    await new Promise(resolve=>setTimeout(resolve,500));
    const after=await command('snapshot');
    assert.equal(row(after,'小鲸鱼').visible,false,'foreign window events do not unhide the pet');
    assert.equal(row(after,'Whale tableware').visible,false,'foreign window events do not unhide tableware');
    assert.deepEqual(row(after,'小鲸鱼').rect,row(before,'小鲸鱼').rect);
    await setTop(false);
    fs.writeFileSync(path.join(dir,'hidden-topmost-verification.json'),JSON.stringify({passed:true,before,after},null,2));
    console.log('PASS: enabled event guard preserves the app-managed hidden pet and overlay.');
  }else{
  await setTop(true);
  const baseline=await command('snapshot');
  assert.equal(row(baseline,'小鲸鱼').visible,true);
  const petRect=row(baseline,'小鲸鱼').rect;
  await command('normal');
  await until(state=>above(state,'小鲸鱼','fixture'),'pet above an ordinary window');
  await command('away');
  await new Promise(resolve=>setTimeout(resolve,300));
  const away=await command('snapshot');
  assert.ok(above(away,'fixture','小鲸鱼'),'an offscreen topmost window does not cause an unnecessary raise');
  const created=await command('topmost');
  assert.equal(row(created,'fixture').topmost,true,'fixture really is topmost');
  const recovered=await until(state=>above(state,'小鲸鱼','fixture'),'recover after another topmost window appears');
  assert.equal(recovered.foreground,created.foreground,'z-order repair must not steal focus');
  assert.deepEqual(row(recovered,'小鲸鱼').rect,petRect,'z-order repair must not move or resize the pet');
  const focused=await command('foreground');
  let afterSwitch={tested:false,reason:'Windows denied the fixture foreground activation'};
  if(focused.foreground===row(focused,'fixture').hwnd){
    afterSwitch=await until(state=>above(state,'小鲸鱼','fixture'),'recover after a topmost foreground switch');
    assert.equal(afterSwitch.foreground,row(afterSwitch,'fixture').hwnd,'foreground focus remains on the other app');
  }
  await widget.evaluate(()=>DSW.interactions.action('pot'));
  await physics.waitForFunction(()=>WhalePhysics.bodies.length>0);
  await until(state=>row(state,'Whale tableware').visible,'tableware becomes visible');
  await command('topmost');
  const overlay=await until(state=>above(state,'Whale tableware','小鲸鱼')&&
    above(state,'小鲸鱼','fixture'),'restore both windows and preserve owner layering');
  assert.equal(row(overlay,'Whale tableware').owner,row(overlay,'小鲸鱼').hwnd);
  await command('hide');
  await physics.evaluate(()=>WhalePhysics.clear());
  await until(state=>!row(state,'Whale tableware').visible,'empty overlay stays hidden');
  await command('topmost');
  const empty=await until(state=>above(state,'小鲸鱼','fixture'),'hidden overlay cannot block pet recovery');
  assert.equal(row(empty,'Whale tableware').visible,false,'recovery does not show an empty overlay');
  await setTop(false);
  await until(state=>!row(state,'小鲸鱼').topmost&&!row(state,'Whale tableware').topmost,'disable both windows');
  await command('topmost');
  await new Promise(resolve=>setTimeout(resolve,500));
  const disabled=await command('snapshot');
  assert.ok(above(disabled,'fixture','小鲸鱼'),'disabled guard allows the pet to be covered');
  await setTop(true);
  const enabled=await until(state=>row(state,'小鲸鱼').topmost&&above(state,'小鲸鱼','fixture'),
    'enabling restores actual order immediately');
  await command('hide');
  // Leave switches off for the existing hidden-restart integration phase.
  await widget.evaluate(async()=>{
    const settings=await __TAURI__.core.invoke('get_companion_settings');
    await __TAURI__.core.invoke('save_companion_settings',{settings:{...settings,alwaysOnTop:false,riceAutoEat:false}});
  });
  fs.writeFileSync(path.join(dir,'topmost-verification.json'),JSON.stringify({
    passed:true,method:'Isolated release EXE, real settings IPC, disposable Win32 topmost window and native z-order/focus/geometry assertions; not manual visual testing',
    baseline,away,recovered,afterSwitch,overlay,empty,disabled,enabled,
  },null,2));
  console.log('PASS: actual z-order recovers above competing topmost windows; focus, geometry, overlay order, hidden overlay and off switch preserved.');
  }
}finally{
  if(fixture){fixture.stdin.end('{"action":"quit"}\n');fixture.unref();}
  await browser.close();
}

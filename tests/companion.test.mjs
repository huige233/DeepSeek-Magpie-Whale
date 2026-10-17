import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = name => fs.readFileSync(new URL('../frontend/js/'+name, import.meta.url),'utf8');
function runtime() {
  let next=1;const timers=new Map();
  const c={console,Math,Date, setTimeout(fn,ms){const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 0;},clearInterval(){}};
  c.window=c;vm.createContext(c);c.timers=timers;return c;
}
test('unknown quota is never converted to zero and missing selected account is not substituted',()=>{
  const c=runtime();vm.runInContext(source('companion-common.js'),c);
  const H=c.WhaleCompanion;
  assert.equal(H.windows({windows:[{name:'week'}]})[0].remaining,null);
  assert.equal(H.tightest({windows:[{name:'unknown'},{name:'week',used:99}]}).remaining,1);
  assert.equal(H.selected([{name:'one',provider:'x',last:true}],'missing'),null);
  assert.equal(H.noticeCost({cost:null}),'未提供本轮费用');
});
test('font selection is CSS-quoted, bounded and falls back without dropping other settings',()=>{
  const c=runtime();vm.runInContext(source('companion-common.js'),c);
  const properties={};const doc={documentElement:{style:{setProperty(k,v){properties[k]=v;}}}};
  c.WhaleCompanion.applyFont({fontFamily:'KaiTi',fontScale:9},doc);
  assert.match(properties['--companion-font'],/^"KaiTi",/);
  assert.equal(properties['--companion-font-scale'],'1.4');
  c.WhaleCompanion.applyFont({},doc);
  assert.match(properties['--companion-font'],/Microsoft YaHei UI/);
  assert.equal(properties['--companion-font-scale'],'1');
});
test('balance bubble closing resumes scheduled dialogue after any number of clicks',()=>{
  const c=runtime(),node=()=>({style:{},classList:{add(){},remove(){}},textContent:''});
  c.DSW={C:{BUBBLE_MS:5000,DIALOGUE_SHOW_MS:4000},flags:{dialogueLines:['hello'],dialogueIntervalMin:1,dialogueJitter:0,dialogueMode:'carousel',dialogueIndex:0},state:{},balance:{render(){},clamp:(v,a,b)=>Math.max(a,Math.min(b,v))},dom:{amountEl:node(),periodEl:node(),hintEl:node(),bubbleBox:node(),textBox:node()}};
  vm.runInContext(source('widget-config.js'),c);vm.runInContext(source('bubble.js'),c);
  c.DSW.widgetConfig.scheduleNextDialogue();assert.ok(c.DSW.flags.dialogueTimer);
  c.DSW.bubble.showBubble();assert.equal(c.DSW.flags.dialogueTimer,null);
  c.DSW.bubble.hideBubble();const id=c.DSW.flags.dialogueTimer;assert.ok(id);assert.equal(c.timers.get(id).ms,60000);
  c.timers.get(id).fn();assert.equal(c.DSW.dom.periodEl.textContent,'hello');
});
test('busy automatic dialogue retries soon instead of waiting another full interval',()=>{
  const c=runtime();c.DSW={C:{},state:{},flags:{dialogueLines:['hello'],dialogueIntervalMin:5,dialogueJitter:0,usageVisible:true},balance:{},bubble:{showDialogueLine(){throw Error('must not interrupt usage');}}};
  vm.runInContext(source('widget-config.js'),c);c.DSW.widgetConfig.scheduleNextDialogue();
  c.timers.get(c.DSW.flags.dialogueTimer).fn();assert.equal(c.timers.get(c.DSW.flags.dialogueTimer).ms,1000);
});

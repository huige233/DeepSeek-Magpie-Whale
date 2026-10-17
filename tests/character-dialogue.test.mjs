import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
  const DSW={flags:{widgetBody:'Claude-Chibi',dialogueMode:'carousel'}};
  vm.runInNewContext(fs.readFileSync(new URL('../frontend/js/character-dialogue.js',import.meta.url),'utf8'),{window:{DSW},Map,Math});
  return DSW;
}
test('seven complete, distinct fictional dialogue profiles, no adjacent repeats',()=>{
  const d=setup(),seen=new Set();
  assert.equal(Object.keys(d.characters.profiles).length,7);
  for(const [group,profile] of Object.entries(d.characters.profiles)){
    d.flags.widgetBody=group;
    for(const cue of ['idle','pat','shy','angry','warn','lonely','return','feed','fed','exhausted']){
      assert.ok(profile[cue].length>=2,group+':'+cue);
      for(const line of profile[cue]){assert.ok(line.length<=35);assert.ok(!seen.has(line));seen.add(line);}
      const first=d.characters.pick(cue);assert.notEqual(d.characters.pick(cue),first);
    }
  }
  assert.equal(seen.size,154);
});
test('setting off and unknown groups preserve original dialogue; per-character rotation isolated',()=>{
  const d=setup();
  const first=d.characters.pick('idle');
  d.flags.widgetBody='GPT-Chibi';d.characters.pick('idle');
  d.flags.widgetBody='Claude-Chibi';assert.notEqual(d.characters.pick('idle'),first);
  d.characters.configure({characterDialogue:false});assert.equal(d.characters.pick('pat','custom line'),'custom line');
  assert.equal(d.characters.lines('idle'),undefined);
  d.characters.configure({});d.flags.widgetBody='小鲸鱼';assert.equal(d.characters.pick('angry','whale'),'whale');
  d.flags.widgetBody='my-own-pet';assert.equal(d.characters.pick('idle','custom'),'custom');
});

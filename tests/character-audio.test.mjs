import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const sounds=[],events={};let pending;
 const c={console,Map,Math,Date,Object,DSW:{flags:{widgetBody:'Claude-Chibi',soundOn:true,soundVol:.4}},Audio:class{constructor(src){this.src=src;sounds.push(this);}play(){return Promise.resolve();}pause(){this.paused=true;}}};
 c.__TAURI__={core:{invoke:async cmd=>cmd==='get_companion_settings'?{}:new Promise(r=>pending=r)},event:{listen:(name,fn)=>{events[name]=fn;}}};c.window=c;
 vm.runInNewContext(fs.readFileSync(new URL('../frontend/js/character-audio.js',import.meta.url),'utf8'),c);
 return{c,sounds,events,complete:()=>pending?.('data:audio/wav;base64,test')};
}
test('21 unique WAVs, complete role routes, independent mute and custom replacement',async()=>{
 const {c,sounds}=setup();await Promise.resolve();const A=c.WhaleCharacterAudio,paths=new Set();
 for(const model of Object.keys(A.themes))for(const cue of A.cues){
   const src=await A.resolve(model+'-Chibi',cue,'default');paths.add(src);
   const bytes=fs.readFileSync(new URL('../frontend/'+src.slice(3),import.meta.url));
   assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.ok(bytes.length>20000);
 }
 assert.equal(paths.size,21);
 A.configure({characterSoundEnabled:{'Claude-Chibi':false},characterSounds:{'GPT-Chibi':{angry:'none'}}});
 assert.equal(await A.play('Claude-Chibi','pat',1),false);assert.equal(await A.play('GPT-Chibi','angry',1),false);
 assert.equal(await A.play('Claude-Chibi','pat',.5,'default'),true,'explicit preview overrides role master');
 assert.equal(sounds.at(-1).volume,.5);
 assert.equal(c.DSW.characterSound.trigger('pat'),true,'muted role still suppresses legacy sound');
 c.DSW.flags.widgetBody='小鲸鱼';assert.equal(c.DSW.characterSound.trigger('pat'),false);
 await assert.rejects(A.resolve('../gpt','pat','default'));await assert.rejects(A.resolve('GPT-Chibi','hack','default'));
});
test('pending imported audio is cancelled by settings or role change; global mute and volume respected',async()=>{
 const {c,sounds,events,complete}=setup();await Promise.resolve();const A=c.WhaleCharacterAudio;
 const task=A.play('Claude-Chibi','feed',.4,'custom:claude_feed-1.wav');
 A.configure({characterSoundEnabled:{'Claude-Chibi':false}});complete();assert.equal(await task,false);assert.equal(sounds.length,0);
 await A.play('GPT-Chibi','pat',5,'default');assert.equal(sounds.at(-1).volume,1);
 events['widget-config-changed']();assert.ok(sounds.at(-1).paused);
 A.configure({});c.DSW.flags.soundOn=false;c.DSW.characterSound.trigger('angry');await Promise.resolve();assert.equal(sounds.length,1);
 assert.equal(await A.play('Grok-Chibi','feed',0,'default'),false);
});

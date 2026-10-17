import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('seven roles keep original artwork during ordinary press; moods and legacy pets remain independent',()=>{
  const DSW={C:{IMG_URL:'main',IMG_URL_PRESS:'stroking',IMG_EXHAUSTED:'exhausted',IMG_ANGRY:'angry',IMG_SHY:'shy',IMG_DISAPPOINTED:'disappointed'},flags:{mood:'normal',pressing:true},state:{},dom:{img:{}},images:{resolve:(src,fn)=>fn(src)}};
  const context=vm.createContext({window:{DSW},Map,Math});
  for(const file of ['character-dialogue.js','expression.js'])vm.runInContext(fs.readFileSync(new URL('../frontend/js/'+file,import.meta.url),'utf8'),context);
  DSW.characters.configure({characterDialogue:false});
  for(const group of Object.keys(DSW.characters.profiles)){
    DSW.flags.widgetBody=group;
    for(const exhausted of [false,true]){
      DSW.flags.mood='normal';DSW.flags.exhaustedMode=exhausted;
      DSW.expression.syncVisualState();assert.equal(DSW.dom.img.src,exhausted?'exhausted':'main',group);
    }
    DSW.flags.exhaustedMode=false;
    for(const mood of ['angry','shy','disappointed']){DSW.flags.mood=mood;DSW.expression.syncVisualState();assert.equal(DSW.dom.img.src,mood,group+':'+mood);}
  }
  DSW.flags.mood='normal';DSW.flags.exhaustedMode=false;
  for(const group of ['小鲸鱼','custom-pet']){DSW.flags.widgetBody=group;DSW.expression.syncVisualState();assert.equal(DSW.dom.img.src,'stroking');}
});

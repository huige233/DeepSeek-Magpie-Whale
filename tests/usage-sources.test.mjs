import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/js/companion-common.js';
test('unknown IDE usage is not displayed as zero or rewarded; stages never reward rice',()=>{
  const h=globalThis.WhaleCompanion,s={notifications:true,riceOnCompletion:true};
  const n={id:'t',source:'Trae',kind:'turn',tokens:{input:0,output:0},usageUnavailable:true};
  assert.equal(h.noticeTotal(n),'Token 未提供');assert.ok(!h.noticeDetail(n).includes('0'));assert.equal(h.claimCompletionRice(s,n,false,new Set()),false);
  n.kind='stage';n.usageUnavailable=false;n.tokens.input=10;assert.ok(h.noticeTitle(n).includes('阶段'));assert.equal(h.claimCompletionRice(s,n,false,new Set()),false);
});

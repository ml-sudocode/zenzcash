import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeJsonAtomic,readJsonStrict} from '../tools/lib/fsio.mjs';
import {inspectSpending,checkSpendingBeforeCall,releaseSpendingHold} from '../tools/lib/spending-guard.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'spending-')),state={id:'run',topics:[{id:'one',snapshot_sha256:'a'},{id:'two',snapshot_sha256:'b'}]};
  const policy={format:'zforum-spending-review-1',run:'run',attempt_limit:4,topics:state.topics.map(t=>({...t,max_tokens:250,jobs:[{name:'job',max_tokens:100}]}))};
  const save=(topic,attempts)=>writeJsonAtomic(join(root,'run',topic,'candidate','manifest.json'),{attempts});
  writeJsonAtomic(join(root,'run','spending-review.json'),policy);
  return {root,state,policy,save,close:()=>rmSync(root,{recursive:true,force:true})};
}
const attempt=(input,output,extra={})=>({job:'job',status:'complete',usage:{input_tokens:input,cached_input_tokens:input,output_tokens:output},...extra});
test('spending guard holds only the anomalous topic, counts cached input once, and keeps holds across resumes',()=>{
  for(const tokens of [0,1,99,100,101,200]){
    const f=fixture();try{
      f.save('one',[attempt(tokens,0)]);f.save('two',[attempt(20,10)]);
      const result=inspectSpending(f.state,f.root);
      assert.equal(result.topics[0].completed_tokens,tokens);assert.equal(result.attempts,2);
      assert.deepEqual(Object.keys(result.holds),tokens>100?['one']:[]);
      assert.doesNotThrow(()=>checkSpendingBeforeCall(f.state,f.root,'two'));
      if(tokens>100){assert.throws(()=>checkSpendingBeforeCall(f.state,f.root,'one'),{message:`Spending review required for one: Job job used ${tokens} tokens; review ceiling 100`});assert.deepEqual(inspectSpending(f.state,f.root).holds,result.holds);}
    }finally{f.close();}
  }
});
test('cumulative limits, missing completed usage, unreviewed jobs and lifetime attempts fail closed',()=>{
  const f=fixture();try{
    f.save('one',[attempt(90,0),attempt(90,0),attempt(90,0)]);
    assert.equal(inspectSpending(f.state,f.root).holds.one.reason,'Thread used 270 tokens; review ceiling 250');
    f.save('two',[attempt(0,0,{status:'running',usage:null}),attempt(0,0,{status:'running',usage:null})]);
    assert.throws(()=>checkSpendingBeforeCall(f.state,f.root,'two'),{message:'Total approved attempt limit 4 reached; approval is required to spend more'});
  }finally{f.close();}
  for(const [row,reason] of [[attempt(0,0,{usage:null}),'Completed job job has no token usage'],[attempt(0,0,{job:'unexpected'}),'Unreviewed job unexpected']]){
    const f=fixture();try{f.save('one',[row]);assert.equal(inspectSpending(f.state,f.root).holds.one.reason,reason);}finally{f.close();}
  }
});
test('reviewed releases retain the lifetime cap and only acknowledge earlier completed attempts',()=>{
  const f=fixture();try{
    f.save('one',[attempt(101,0)]);inspectSpending(f.state,f.root);
    releaseSpendingHold(f.state,f.root,{topic:'one',maxTokens:300,jobLimits:[],reason:'User approved remaining work'});
    assert.deepEqual(inspectSpending(f.state,f.root).holds,{});
    assert.equal(inspectSpending(f.state,f.root).attempt_limit,4);
    f.save('one',[attempt(101,0),attempt(101,0)]);
    assert.equal(inspectSpending(f.state,f.root).holds.one.actual_tokens,101);
    const ledger=readJsonStrict(join(f.root,'run','spending-holds.json'));assert.equal(ledger.released.length,1);assert.equal(ledger.released[0].attempt_count,1);
    f.save('one',[attempt(101,0),attempt(0,0,{status:'running',usage:null})]);
    assert.throws(()=>releaseSpendingHold(f.state,f.root,{topic:'one',maxTokens:300,jobLimits:[],reason:'User approved'}),{message:'Wait for in-flight attempts before releasing one'});
  }finally{f.close();}
});
test('spending review validates frozen identities and exact usage fields before enforcement',()=>{
  const f=fixture();try{
    const bad=structuredClone(f.policy);bad.topics[0].snapshot_sha256='changed';writeJsonAtomic(join(f.root,'run','spending-review.json'),bad);
    assert.throws(()=>inspectSpending(f.state,f.root),{message:'Invalid spending limits for one'});
    writeJsonAtomic(join(f.root,'run','spending-review.json'),f.policy);f.save('one',[attempt(NaN,1)]);
    assert.throws(()=>inspectSpending(f.state,f.root),{message:'Invalid token usage for one/job'});
  }finally{f.close();}
});

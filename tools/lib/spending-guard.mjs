import { existsSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonStrict,writeJsonAtomic } from './fsio.mjs';
import { isDeepStrictEqual } from 'node:util';

export const SPENDING_REVIEW='spending-review.json';
export const SPENDING_HOLDS='spending-holds.json';
const positive=value=>Number.isSafeInteger(value)&&value>0;
const keys=(value,expected)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),expected.toSorted());

export class SpendingHold extends Error {
  constructor(topic,hold){super(`Spending review required for ${topic}: ${hold.reason}`);this.notInvoked=true;this.spendingHold=true;this.topic=topic;}
}

function withSpendingLock(state,root,action) {
  const path=join(root,state.id,'.spending-lock');let fd;
  for(let attempt=0;attempt<100;attempt++){
    try{fd=openSync(path,'wx',0o600);break;}catch(error){if(error.code!=='EEXIST')throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
  }
  if(fd===undefined)throw new Error(`Spending review lock remains held: ${path}; inspect its owner before retrying`);
  try{return action();}finally{closeSync(fd);unlinkSync(path);}
}

export function inspectSpending(state,root) {
  if(!existsSync(join(root,state.id,SPENDING_REVIEW)))return null;
  return withSpendingLock(state,root,()=>inspectUnlocked(state,root));
}

function inspectUnlocked(state,root) {
  const directory=join(root,state.id),path=join(directory,SPENDING_REVIEW);
  if(!existsSync(path))return null;
  const policy=readJsonStrict(path);
  if(!keys(policy,['format','run','attempt_limit','topics'])||policy.format!=='zforum-spending-review-1'||policy.run!==state.id||!positive(policy.attempt_limit)||!Array.isArray(policy.topics)||!isDeepStrictEqual(policy.topics.map(t=>t.id),state.topics.map(t=>t.id)))throw new Error('Spending review does not match the frozen run');
  for(const [index,topic] of policy.topics.entries()){
    if(!keys(topic,['id','snapshot_sha256','max_tokens','jobs'])||topic.snapshot_sha256!==state.topics[index].snapshot_sha256||!positive(topic.max_tokens)||!Array.isArray(topic.jobs)||new Set(topic.jobs.map(j=>j.name)).size!==topic.jobs.length||topic.jobs.some(j=>!keys(j,['name','max_tokens'])||typeof j.name!=='string'||!positive(j.max_tokens)))throw new Error(`Invalid spending limits for ${topic.id}`);
  }
  const holdPath=join(directory,SPENDING_HOLDS);
  const ledger=existsSync(holdPath)?readJsonStrict(holdPath):{run:state.id,active:{},released:[]};
  if(!keys(ledger,['run','active','released'])||ledger.run!==state.id||!ledger.active||typeof ledger.active!=='object'||Array.isArray(ledger.active)||!Array.isArray(ledger.released)||ledger.released.some(entry=>!entry||typeof entry.topic!=='string'||!Number.isSafeInteger(entry.attempt_count)||entry.attempt_count<0)||Object.keys(ledger.active).some(id=>!state.topics.some(t=>t.id===id)))throw new Error('Invalid spending hold ledger');
  let attempts=0,changed=false;const topics=[];
  for(const topic of policy.topics){
    const file=join(directory,topic.id,'candidate','manifest.json');
    const rows=existsSync(file)?readJsonStrict(file).attempts:[];
    if(!Array.isArray(rows))throw new Error(`Missing attempts for spending review: ${topic.id}`);
    attempts+=rows.length;
    let tokens=0,unknown=0,violation=null;
    const reviewedThrough=Math.max(0,...ledger.released.filter(entry=>entry.topic===topic.id).map(entry=>entry.attempt_count));
    if(!Number.isSafeInteger(reviewedThrough)||reviewedThrough>rows.length)throw new Error(`Invalid reviewed attempt count for ${topic.id}`);
    for(const [index,row] of rows.entries()){
      const limit=topic.jobs.find(j=>j.name===row.job);
      if(limit===undefined){violation={reason:`Unreviewed job ${row.job}`,job:row.job,actual_tokens:null,max_tokens:null};continue;}
      if(row.status==='running')continue;
      if(row.usage===null||row.usage===undefined){unknown++;if(row.status==='complete'&&index>=reviewedThrough)violation={reason:`Completed job ${row.job} has no token usage`,job:row.job,actual_tokens:null,max_tokens:limit.max_tokens};continue;}
      const {input_tokens:input,output_tokens:output}=row.usage;
      if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)throw new Error(`Invalid token usage for ${topic.id}/${row.job}`);
      const total=input+output;
      if(!Number.isSafeInteger(total)||!Number.isSafeInteger(tokens+total))throw new Error(`Invalid token usage for ${topic.id}/${row.job}`);
      tokens+=total;
      if(total>limit.max_tokens&&index>=reviewedThrough)violation={reason:`Job ${row.job} used ${total} tokens; review ceiling ${limit.max_tokens}`,job:row.job,actual_tokens:total,max_tokens:limit.max_tokens};
    }
    if(tokens>topic.max_tokens)violation={reason:`Thread used ${tokens} tokens; review ceiling ${topic.max_tokens}`,job:null,actual_tokens:tokens,max_tokens:topic.max_tokens};
    if(violation!==null&&!Object.hasOwn(ledger.active,topic.id)){
      ledger.active[topic.id]={...violation,observed_at:new Date().toISOString(),completed_tokens:tokens,unknown_usage:unknown};changed=true;
    }
    topics.push({id:topic.id,completed_tokens:tokens,unknown_usage:unknown,attempts:rows.length});
  }
  if(changed)writeJsonAtomic(holdPath,ledger);
  return {attempts,attempt_limit:policy.attempt_limit,holds:ledger.active,topics};
}

export function checkSpendingBeforeCall(state,root,topic) {
  const review=inspectSpending(state,root);
  if(review===null)return;
  if(review.holds[topic])throw new SpendingHold(topic,review.holds[topic]);
  // The caller has already recorded this prospective attempt. It removes that
  // record when notInvoked is raised; concurrent in-flight calls count as spent.
  if(review.attempts>review.attempt_limit)throw Object.assign(new Error(`Total approved attempt limit ${review.attempt_limit} reached; approval is required to spend more`),{notInvoked:true});
}

export function releaseSpendingHold(state,root,{topic,maxTokens,jobLimits,reason}) {
  return withSpendingLock(state,root,()=>{
  const review=inspectUnlocked(state,root);
  if(review===null||!Object.hasOwn(review.holds,topic))throw new Error(`No spending hold for ${topic}`);
  if(!positive(maxTokens)||typeof reason!=='string'||!reason.trim()||reason.length>500||!Array.isArray(jobLimits)||jobLimits.some(j=>!keys(j,['name','max_tokens'])||!positive(j.max_tokens))||new Set(jobLimits.map(j=>j.name)).size!==jobLimits.length)throw new Error(`Invalid reviewed spending release for ${topic}`);
  const directory=join(root,state.id),path=join(directory,SPENDING_REVIEW),policy=readJsonStrict(path),entry=policy.topics.find(t=>t.id===topic);
  if(maxTokens<entry.max_tokens||maxTokens<review.topics.find(t=>t.id===topic).completed_tokens||jobLimits.some(j=>!entry.jobs.some(old=>old.name===j.name)||j.max_tokens<entry.jobs.find(old=>old.name===j.name).max_tokens))throw new Error(`Reviewed limits cannot shrink or add unreviewed jobs for ${topic}`);
  const previous=structuredClone(entry);entry.max_tokens=maxTokens;
  for(const job of jobLimits)entry.jobs.find(old=>old.name===job.name).max_tokens=job.max_tokens;
  const ledger=readJsonStrict(join(directory,SPENDING_HOLDS));
  const attemptCount=review.topics.find(t=>t.id===topic).attempts;
  const manifest=readJsonStrict(join(directory,topic,'candidate','manifest.json'));
  if(manifest.attempts.some(a=>a.status==='running'))throw new Error(`Wait for in-flight attempts before releasing ${topic}`);
  ledger.released.push({topic,reason,reviewed_at:new Date().toISOString(),attempt_count:attemptCount,hold:ledger.active[topic],previous,replacement:entry});
  delete ledger.active[topic];
  // A crash between writes leaves the hold in place, never an unapproved resume.
  writeJsonAtomic(path,policy);writeJsonAtomic(join(directory,SPENDING_HOLDS),ledger);
  });
}

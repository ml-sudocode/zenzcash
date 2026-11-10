import { isDeepStrictEqual } from 'node:util';
import { readJsonStrict } from './fsio.mjs';
import { sha256 } from './jobs.mjs';
import { importTimestamp } from './import-time.mjs';
import { PARTIAL_HISTORY } from './source-coverage.mjs';

const HISTORY_SCOPES=['full',PARTIAL_HISTORY];

function exactKeys(value,keys,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort()))throw new Error(`${label}: expected fields ${keys.join(', ')}`);
}

export function selectionTopics(registered,selection) {
  const topics=registered.filter(topic=>selection.choices.some(choice=>choice.id===topic.id));
  if(topics.length!==selection.choices.length)throw new Error('Selected topic membership changed since discovery');
  for(const topic of topics){
    const choice=selection.choices.find(choice=>choice.id===topic.id);
    if(!isDeepStrictEqual(topic.threadIds,choice.thread_ids))throw new Error(`Selected thread membership changed: ${topic.id}`);
  }
  return topics;
}

export function validateFrozenSelection(selection) {
  exactKeys(selection,['review_sha256','baseline_sha256','since','until','choices'],'Frozen selection');
  if(!/^[a-f0-9]{64}$/.test(selection.review_sha256)||!/^[a-f0-9]{64}$/.test(selection.baseline_sha256)||importTimestamp(selection.since)>=importTimestamp(selection.until)||!Array.isArray(selection.choices)||selection.choices.length===0||new Set(selection.choices.map(c=>c.id)).size!==selection.choices.length)throw new Error('Invalid frozen download selection');
  for(const choice of selection.choices){
    exactKeys(choice,['id','history','thread_ids','baseline_release'],'Frozen choice');
    if(typeof choice.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(choice.id)||!HISTORY_SCOPES.includes(choice.history)||!Array.isArray(choice.thread_ids)||choice.thread_ids.length===0||choice.thread_ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(choice.thread_ids).size!==choice.thread_ids.length||!(choice.baseline_release===null||/^[a-f0-9]{64}$/.test(choice.baseline_release)))throw new Error(`Invalid frozen choice ${choice.id}`);
  }
}

export function readDownloadSelection(file,store,settings) {
  const value=readJsonStrict(file);
  exactKeys(value,['format','review','review_sha256','choices'],'Download selection');
  if(value.format!=='zforum-download-selection-1')throw new Error(`Unknown download selection format ${value.format}`);
  const review=value.review;
  if(review?.format!=='zforum-pull-selection-1'||value.review_sha256!==sha256(JSON.stringify(review)))throw new Error('Download selection discovery hash mismatch');
  const since=importTimestamp(review.since),until=importTimestamp(review.until);
  if(since>=until)throw new Error(`Invalid download selection window ${since} to ${until}`);
  if(review.baseline_sha256!==sha256(JSON.stringify(store.discoveryBaseline()))||review.previous_cutoff!==store.cutoff())throw new Error('Published baseline or cutoff changed since discovery; repeat selection review');
  if(!Array.isArray(review.candidates)||new Set(review.candidates.map(c=>c.id)).size!==review.candidates.length)throw new Error('Invalid discovery candidates');
  if(!Array.isArray(value.choices)||value.choices.length===0||new Set(value.choices.map(c=>c.id)).size!==value.choices.length)throw new Error('Download selection requires distinct nonempty choices');
  const choices=value.choices.map(choice=>{
    exactKeys(choice,['id','history'],'Download choice');
    if(typeof choice.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(choice.id))throw new Error(`Invalid selected topic ID ${choice.id}`);
    if(!HISTORY_SCOPES.includes(choice.history))throw new Error(`Unknown selected history ${choice.history}`);
    const candidate=review.candidates.find(c=>c.id===choice.id);
    if(!candidate||!Array.isArray(candidate.thread_ids)||candidate.thread_ids.length===0||new Set(candidate.thread_ids).size!==candidate.thread_ids.length||candidate.thread_ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error(`Invalid selected discovery candidate ${choice.id}`);
    if(candidate.baseline_release!==store.release(choice.id))throw new Error(`Selected release changed: ${choice.id}`);
    const resuming=store.active()?.selection?.review_sha256===value.review_sha256;
    if(choice.history!=='full'&&(candidate.baseline_release!==null||(!resuming&&store.previous(choice.id).threads.length>0)||candidate.thread_ids.length!==1))throw new Error(`Partial history requires a new single-thread topic: ${choice.id}`);
    for(const id of candidate.thread_ids)if((settings.excludedDiscoveryThreads??[]).includes(id)||store.threadReview(id)?.decision==='exclude')throw new Error(`Selected thread ${id} is excluded`);
    return {...choice,thread_ids:candidate.thread_ids,baseline_release:candidate.baseline_release};
  });
  const selection={review_sha256:value.review_sha256,baseline_sha256:review.baseline_sha256,since,until,choices};
  validateFrozenSelection(selection);
  const threads=choices.flatMap(choice=>choice.thread_ids.map(id=>({id})));
  selectionTopics(store.register(threads,{dryRun:true}),selection);
  return selection;
}

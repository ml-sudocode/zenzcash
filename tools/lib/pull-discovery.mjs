import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { discoverImport } from './discovery.mjs';
import { importTimestamp } from './import-time.mjs';
import { assertLocalPreparation } from './preparation-boundary.mjs';
import { importAudit, summarizeForum } from './import-audit.mjs';
import { writeJsonAtomic } from './fsio.mjs';
import { writeReviewJson, REVIEW_INSTRUCTIONS } from './review-display.mjs';
import { sha256 } from './jobs.mjs';
import { FORUM_ORIGIN } from './config.mjs';

export async function discoverPull({store,root,settings,get,since,clock,progress}) {
  assertLocalPreparation(store.path,root);
  if(store.active()!==null)throw new Error('Finish or explicitly resolve the unfinished local import before starting a new discovery review');
  const cutoff=store.cutoff();
  if(since===undefined&&cutoff===null)throw new Error('First discovery requires a UTC start timestamp');
  const start=since===undefined?new Date(Date.parse(cutoff)-300000).toISOString():importTimestamp(since);
  const until=importTimestamp(clock());
  if(start>=until)throw new Error(`Discovery start ${start} must precede ${until}`);
  const excluded=settings.excludedDiscoveryThreads??[];
  if(!Array.isArray(excluded)||excluded.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(excluded).size!==excluded.length)throw new Error('Invalid excluded discovery thread IDs');
  const baseline=store.discoveryBaseline(),byThread=new Map(baseline.map(row=>[row.thread,row]));
  const directory=join(root,`discovery-${randomUUID()}`);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const audit=importAudit(directory),metadata=new Map();
  const listingOnly=async path=>{
    if(!/^\/latest\.json\?order=activity&page=\d+$/.test(path))throw new Error(`Discovery refuses non-listing request: ${path}`);
    const response=await audit.measure('fetch.discovery',{path},()=>get(path,{observe:({category,...details})=>audit.record(category,{...details,section:'discovery'})}));
    for(const topic of response.body?.topic_list?.topics??[]){
      if(topic.posts_count!==undefined&&(!Number.isSafeInteger(topic.posts_count)||topic.posts_count<0))throw new Error(`Invalid post count for discovered thread ${topic.id}`);
      metadata.set(topic.id,{posts:topic.posts_count??null});
    }
    return response;
  };
  let review;
  try {
    await audit.measure('stage.discover',{},async()=>{
      const discovery=await discoverImport({get:listingOnly,since:start,until,maxPages:settings.discoveryMaxPages,progress});
      const candidates=new Map(),exclusions=[];
      for(const thread of discovery.threads){
        const previous=byThread.get(thread.id),decision=store.threadReview(thread.id);
        if(excluded.includes(thread.id)||(!previous&&decision?.decision==='exclude')){
          exclusions.push({id:thread.id,title:thread.title,reason:excluded.includes(thread.id)?'Configured exclusion':decision.reason});continue;
        }
        const id=previous?.topic??`thread-${thread.id}`;
        if(!candidates.has(id)){
          const members=previous?baseline.filter(row=>row.topic===id):[];
          candidates.set(id,{id,title:previous?.topic_title??thread.title,kind:previous?'existing':'new',
            baseline_release:previous?.release??null,thread_ids:previous?members.map(row=>row.thread):[thread.id],
            published_posts:previous?members.reduce((n,row)=>n+row.posts,0):0,
            existing_opening_excerpt:previous?.opening_excerpt??null,active_threads:[],decision:'pending',reason:''});
        }
        candidates.get(id).active_threads.push({...thread,url:`${FORUM_ORIGIN}/t/${thread.slug}/${thread.id}`,listed_posts:metadata.get(thread.id).posts,
          published_posts:previous?.posts??0});
      }
      review={format:'zforum-pull-selection-1',status:'awaiting-selection',instructions:REVIEW_INSTRUCTIONS,source_label:'untrusted_forum_content',
        since:start,until,previous_cutoff:cutoff,baseline_sha256:sha256(JSON.stringify(baseline)),passes:discovery.passes,
        candidates:[...candidates.values()],exclusions,
        note:'Listing metadata and retained local excerpts only. New/edited reply counts and analysis costs are unknown until selected sources are fetched. Grouped topics must be reviewed as a whole. This review does not advance the cutoff or approve downloads, analysis or publication.'};
      writeReviewJson(join(directory,'selection-review.json'),review);
    });
  } finally {
    writeJsonAtomic(join(directory,'audit.json'),{stages:audit.events.filter(e=>e.category==='stage.discover'),forum:summarizeForum(audit.events),model_calls:0,input_tokens:0,output_tokens:0,
      note:'Tokens here describe importer model jobs only; operator conversation/planning usage is not exposed.'});
  }
  progress(`Selection review: ${join(directory,'selection-review.json')} (${review.candidates.length} candidates, ${review.exclusions.length} prior exclusions). No full threads, profiles or model calls. Database and cutoff unchanged.`);
  return {directory,review};
}

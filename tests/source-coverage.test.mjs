import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedPostStream } from '../tools/lib/source-coverage.mjs';
import { fetchSnapshot } from '../tools/lib/refresh-source.mjs';
import { sourceRecords,structuredPrompt } from '../tools/lib/model-input.mjs';

test('opening plus recent selection deduplicates short histories and retains its initial range across growth and removal',()=>{
  for(let length=0;length<=100;length++){
    const stream=Array.from({length},(_,i)=>i+1);
    const initial=selectedPostStream(stream,undefined,'opening-and-latest-10',7);
    const expected=stream.filter((_,i)=>i===0||i>=length-10);
    assert.deepEqual(initial.stream,expected);
    assert.equal(initial.coverage.omitted_posts,Math.max(0,length-11));
    for(let growth=0;growth<5;growth++){
      const added=Array.from({length:growth},(_,i)=>length+i+1);
      const next=selectedPostStream([...stream,...added],{source_coverage:initial.coverage},undefined,7);
      assert.deepEqual(next.stream,[...expected,...added]);
      const surviving=stream.filter(id=>id%3!==0);
      assert.deepEqual(selectedPostStream([...surviving,...added],{source_coverage:initial.coverage},'full',7).stream,[...expected.filter(id=>id%3!==0),...added]);
    }
    assert.deepEqual(selectedPostStream(stream,undefined,'full',7),{stream});
  }
  assert.throws(()=>selectedPostStream([1,2],{posts:[]},'opening-and-latest-10',7),{message:'Thread 7: cannot truncate an existing full history'});
  assert.throws(()=>selectedPostStream([1],undefined,'guess',7),{message:'Thread 7: unknown history guess'});
  assert.throws(()=>selectedPostStream([1],{source_coverage:{policy:'broken'}},undefined,7),{message:'Thread 7: invalid retained source coverage'});
});

test('partial refresh checks edits/hiding in retained posts, fetches subsequent replies, and exposes coverage to models',async()=>{
  const date='2026-11-01T00:00:00.000Z';let count=25,hidden=false;
  const paths=[];
  const get=async path=>{
    paths.push(path);
    if(!path.includes('/posts.json'))return {body:{id:7,title:'Thread',slug:'thread',created_at:date,post_stream:{stream:Array.from({length:count},(_,i)=>i+1)}}};
    const ids=new URL(`https://example.org${path}`).searchParams.getAll('post_ids[]').map(Number);
    return {body:{post_stream:{posts:ids.map(number=>({id:number,post_number:number,post_type:1,username:'alice',created_at:date,reply_to_post_number:null,hidden:hidden&&number===16,raw:hidden?'Edited':'Original'}))}}};
  };
  const options={get,previous:{threads:[]},topic:{id:'thread-7',threadIds:[7]},history:'opening-and-latest-10',checkpoint:async()=>{},profile:async()=>({created_at:date}),clock:()=>date,retainForumIds:true};
  const first=await fetchSnapshot(options);
  assert.deepEqual(first.threads[0].posts.map(p=>p.number),[1,16,17,18,19,20,21,22,23,24,25]);
  count=27;hidden=true;
  const next=await fetchSnapshot({...options,history:undefined,previous:first});
  assert.deepEqual(next.threads[0].posts.map(p=>p.number),[1,16,17,18,19,20,21,22,23,24,25,26,27]);
  assert.equal(next.threads[0].posts[0].raw,'Edited');assert.equal(next.threads[0].posts[1].raw,null);
  assert.equal(paths.length,4);
  const job={task:'summary',name:'summary-thread-7'};
  const source=sourceRecords(next.threads,job);
  assert.deepEqual(source.threads[0].source_coverage,next.threads[0].source_coverage);
  const prompt=structuredPrompt({source,job,prompt:'Summarize'});
  assert.equal(prompt.includes('Missing middle posts were not supplied.'),true);
});

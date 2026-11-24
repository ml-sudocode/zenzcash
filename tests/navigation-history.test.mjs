import test from 'node:test';
import assert from 'node:assert/strict';
import { NavigationHistory, captureReader, restoreReader, parseNavigationView } from '../site/js/navigation-history.js';
import { DEFAULT_SETTINGS } from '../site/js/logic.js';

const readerState = () => ({ thread:7,shown:new Map([['all',60]]),versions:new Map([['7/9','original']]),selecting:true,
  revealed:new Set(['7/2']),shownFiltered:new Set(['7/3']),collapsed:new Set(['7/4']),selected:new Set(['7/9']),
  open:{summary:true,expert:true,newPoints:false,flags:false,infos:new Set(['toneBands']),marks:new Set(['7/9']),questions:new Set(['q1']),arguments:new Set(['q1'])},readingHistory:{bookmarkPages:2} });
const view = (hash,y) => ({hash,release:'release',visibilityPending:false,position:{x:0,y,panelScroll:30,focusedId:null,focusedPost:'post-7-9',details:[],posts:[]},settings:structuredClone(DEFAULT_SETTINGS),directory:{query:'grants',sort:'posts'},reader:captureReader(readerState())});
function environment() {
  let sequence=0;
  const stored=new Map(),errors=[];
  const history={state:null,replaceState(value){this.state=structuredClone(value);}};
  const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const create=()=>new NavigationHistory(history,storage,error=>errors.push(error),()=>`entry-${++sequence}`);
  return {history,storage,stored,errors,create};
}
test('each occurrence in the Back stack retains its own view across traversal and reload',()=>{
  const env=environment();let pages=env.create();
  const entries=[];
  for(let i=0;i<60;i++) {
    env.history.state=null;
    const hash=['#/topic/zcg','#/topics','#/how-to-use','#/topic/zcg/post/7/9'][i%4];
    assert.equal(pages.enter(hash),null);
    const saved=view(hash,i*123);pages.remember(saved);
    entries.push({state:structuredClone(env.history.state),saved:structuredClone(saved)});
    saved.position.y=-1; // The cache must own its snapshot, not a live reference.
  }
  for(const entry of [...entries].reverse()) {
    env.history.state=entry.state;
    assert.deepEqual(pages.enter(entry.saved.hash),entry.saved);
    pages=env.create();
    assert.deepEqual(pages.enter(entry.saved.hash),entry.saved);
  }
  assert.deepEqual(env.errors,[]);
});
test('reader state restores maps, sets, loaded batches and versions without carrying account secrets',()=>{
  const state=readerState();state.account={csrf:'SECRET',personal:{recovery_codes:['SECRET']}};
  const captured=captureReader(state),target=readerState();
  target.shown.clear();target.versions.clear();target.open.questions.clear();
  restoreReader(target,captured);
  assert.deepEqual(captureReader(target),captured);
  assert.equal(JSON.stringify(captured).includes('SECRET'),false);
  assert.equal(parseNavigationView(view('#/saved',999)).reader.savedPages,2);
});
test('invalid and unavailable storage is reported while in-memory navigation still works',()=>{
  const env=environment();env.storage.getItem=()=>'{invalid';
  const pages=env.create();assert.match(env.errors[0],/^Reading history could not be restored:/);
  env.storage.setItem=()=>{throw new Error('quota');};
  pages.enter('#/topic/zcg');pages.remember(view('#/topic/zcg',500));
  assert.equal(env.errors.at(-1),'Reading positions will last for this page session only: quota');
  assert.equal(pages.enter('#/topic/zcg').position.y,500);
  for(const mutate of [v=>v.position.y=NaN,v=>v.reader.shown=[['all',Infinity]],v=>v.reader.open.infos='bad',v=>v.reader.savedPages=-1,v=>v.account='secret',v=>v.position.posts=[{id:'post-7-1',details:[{label:'x',open:1}]}]]) {
    const invalid=view('#/topic/zcg',1);mutate(invalid);
    assert.throws(()=>parseNavigationView(invalid),{message:'Invalid saved navigation state'});
  }
});

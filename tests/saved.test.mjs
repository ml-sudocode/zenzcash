import test from 'node:test';
import assert from 'node:assert/strict';
import { savedItems, topicSaveButton } from '../site/js/saved.js';
import { installDom, nodes, descendants, click } from './recorded-dom.mjs';
import { parsePersonal } from '../site/js/personal.js';

test('Saved presents separate topic and post lists with working links and independent removals',t=>{
  installDom(t);const calls=[];
  const state={account:{authenticated:true,personal:{saved_topics:['zcg','missing'],reading:{'7/9':{bookmarked:true,read:false},'7/10':{bookmarked:false,read:true}}}},catalog:{topics:[{topic:{id:'zcg',card:{title:'Grants'},threads:[{id:7}]}}]},readingHistory:{bookmarksNext:null}};
  const actions={saveTopic:(...args)=>calls.push(args),setReading:(...args)=>calls.push(args)};
  const root=savedItems(state,actions);
  assert.equal(root.querySelector('h1').textContent,'Saved');
  assert.equal(nodes(root,'saved-topics')[0].querySelector('h2').textContent,'Saved topics (2)');
  assert.equal(nodes(root,'saved-posts')[0].querySelector('h2').textContent,'Saved posts (1)');
  assert.deepEqual(descendants(root).filter(n=>n.tag==='a').map(n=>n.attributes.get('href')),['#/topic/zcg','#/topic/zcg/post/7/9']);
  assert.match(root.textContent,/missing · unavailable/);
  descendants(root).filter(n=>n.tag==='button').forEach(n=>click(n));
  assert.deepEqual(calls,[['zcg',false],['missing',false],['7/9',{bookmarked:false}]]);
  state.account.personal.saved_topics=[];state.account.personal.reading={};
  assert.match(savedItems(state,actions).textContent,/Use Save topic/);
  assert.match(savedItems(state,actions).textContent,/Use Save post/);
  state.account.personal=null;assert.equal(savedItems(state,actions),null);
});
test('topic save control handles guests, saved topics and unsaved topics',t=>{
  installDom(t);
  for(const [authenticated,saved] of [[false,false],[true,false],[true,true]]) {
    const calls=[],state={account:{authenticated,personal:authenticated?{saved_topics:saved?['zcg']:[]}:null}};
    const button=topicSaveButton({id:'zcg'},state,{saveTopic:(...args)=>calls.push(args),openAccount:reason=>calls.push(reason)});
    assert.equal(button.attributes.get('aria-pressed'),String(saved));click(button);
    assert.deepEqual(calls,authenticated?[['zcg',!saved]]:['save topics']);
  }
});
test('account responses reject malformed topic bookmark collections',()=>{
  const personal={label:'Reader',appearance:'cat',recovery_remaining:10,reading:{},moods:{},progress:{head:0,emotions:0},preferences:null,saved_topics:[]};
  for(const saved_topics of [undefined,null,'zcg',['zcg','zcg'],['../zcg'],['topics'],[1],Array.from({length:1001},(_,i)=>`topic-${i}`)]) assert.throws(()=>parsePersonal({...personal,saved_topics}),{message:'invalid saved topics'});
  assert.deepEqual(parsePersonal({...personal,saved_topics:['zcg','thread-58906']}).saved_topics,['zcg','thread-58906']);
});

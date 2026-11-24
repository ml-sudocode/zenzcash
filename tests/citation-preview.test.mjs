import assert from 'node:assert/strict';
import test from 'node:test';
import { cites } from '../site/js/citations.js';
import { closeCitationPreview } from '../site/js/citation-preview.js';
import { installDom, nodes, descendants, click } from './recorded-dom.mjs';

function fixture(t) {
  installDom(t);
  const post={key:'7/1',number:1,author:'alice',created_at:'2026-10-31T12:00:00Z',hidden:false,segments:[{kind:'text',text:'Original @alice <img src=x onerror=alert(1)>'}],analysis:{summary:'A short summary',dimensions:{tone:{score:2}},tone_peak:null}};
  const opened=[];
  const view={state:{data:{topic:{id:'funding'}},settings:{anonymous:false}},posts:new Map([['7/1',post]]),threadOf:new Map([['7/1',{id:7,title:'Discussion',url:'https://forum.example/t/discussion/7'}]]),letterOf:new Map([[7,'A']]),numbers:new Map([['alice',1]]),transform:text=>text,actions:{openPost:key=>opened.push(key)}};
  return {post,view,opened};
}

test('citation links preserve native modified and middle-click behavior, without opening a preview',t=>{
  const {view}=fixture(t);
  const anchor=nodes(cites(['7/1'],view),'cite')[0];
  assert.equal(anchor.tag,'a');
  assert.equal(anchor.attributes.get('href'),'#/topic/funding/post/7/1');
  for(const modifiers of [{button:1},{button:2},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true}]) {
    assert.equal(click(anchor,modifiers).defaultPrevented,false);
    assert.equal(nodes(document.body,'citation-preview').length,0);
  }
});

test('ordinary citation click shows original text safely, preserves source routes and restores focus',t=>{
  const {view,opened}=fixture(t);
  const anchor=nodes(cites(['7/1'],view),'cite')[0];
  assert.equal(click(anchor).defaultPrevented,true);
  const dialog=nodes(document.body,'citation-preview')[0];
  assert.equal(dialog.open,true);
  assert.equal(document.body.style.overflow,'hidden');
  assert.equal(nodes(dialog,'citation-body')[0].textContent,'Original @alice <img src=x onerror=alert(1)>');
  assert.equal(descendants(dialog).some(n=>n.tag==='img'||n.tag==='script'),false);
  assert.deepEqual(opened,[]);
  const newTab=descendants(dialog).find(n=>n.textContent==='Open in new tab');
  assert.equal(newTab.attributes.get('href'),'#/topic/funding/post/7/1');
  assert.equal(newTab.attributes.get('target'),'_blank');
  assert.equal(newTab.attributes.get('rel'),'noopener');
  const external=descendants(dialog).find(n=>n.tag==='a'&&n.textContent==='Original forum post ↗');
  assert.equal(external.attributes.get('href'),'https://forum.example/t/discussion/7/1');
  click(descendants(dialog).find(n=>n.tag==='button'&&n.textContent==='Close ✕'));
  assert.equal(nodes(document.body,'citation-preview').length,0);
  assert.equal(document.body.style.overflow,'');
  assert.equal(document.activeElement,anchor);
  assert.deepEqual(anchor.focusOptions,{preventScroll:true});
});

test('preview masks mentions, never renders hidden text, and cleans up replaced previews',t=>{
  const {post,view,opened}=fixture(t);
  view.state.settings.anonymous=true;view.transform=text=>text.replaceAll('@alice','@Participant 1');
  const anchor=nodes(cites(['7/1'],view),'cite')[0];
  click(anchor);
  assert.equal(document.body.textContent.includes('@alice'),false);
  assert.equal(document.body.textContent.includes('@Participant 1'),true);
  click(anchor);
  assert.equal(nodes(document.body,'citation-preview').length,1);
  const dialog=nodes(document.body,'citation-preview')[0];
  click(descendants(dialog).find(n=>n.tag==='button'&&n.textContent==='Read in discussion'));
  assert.deepEqual(opened,['7/1']);
  assert.equal(document.body.style.overflow,'');
  post.hidden=true;post.segments=null;
  click(anchor);
  assert.equal(nodes(document.body,'citation-body')[0].textContent,'This post is no longer public.');
  assert.equal(document.body.textContent.includes('Original @'),false);
  closeCitationPreview();
  assert.equal(document.body.style.overflow,'');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { captureReadingPosition, restoreReadingPosition } from '../site/js/reading-return.js';

test('login return retains matching disclosure states when saved account preferences remove notes', t => {
  const originals = new Map(['document','window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => { for (const [key, value] of originals) if (value) Object.defineProperty(globalThis,key,value); else delete globalThis[key]; });
  const detail = (label, open) => ({ open, querySelector: selector => { assert.equal(selector,'summary'); return { textContent:label }; } });
  const all = [detail('Give feedback',true), detail('Disputed assumption',false), detail('Disputed assumption',true), detail('AI analysis and sources',true)];
  let details = all;
  const focusCalls = [], scrollCalls = [];
  const post = { id:'post-7-1', querySelectorAll: selector => { assert.equal(selector,'details'); return details; }, focus: options => focusCalls.push(options) };
  const panel = { scrollTop:73 };
  const root = { querySelector: selector => { assert.equal(selector,'.settings-panel'); return panel; }, querySelectorAll: selector => { assert.ok(['.post','details'].includes(selector)); return selector === '.post' ? [post] : []; } };
  globalThis.document = { activeElement: { closest: selector => { assert.equal(selector,'.post'); return post; } }, getElementById: id => { assert.equal(id,post.id); return post; } };
  globalThis.window = { scrollX:0, scrollY:3456, scrollTo:(...args) => scrollCalls.push(args) };
  const saved = captureReadingPosition(root);
  assert.deepEqual(saved, { x:0,y:3456,panelScroll:73,focusedPost:'post-7-1',details:[],posts:[{id:'post-7-1',details:[{label:'Give feedback',open:true},{label:'Disputed assumption',open:false},{label:'Disputed assumption',open:true},{label:'AI analysis and sources',open:true}]}] });
  for (const includeNotes of [false,true]) {
    details = includeNotes ? all.map(item => detail(item.querySelector('summary').textContent,false)) : [detail('Give feedback',false),detail('AI analysis and sources',false)];
    panel.scrollTop = 0;
    restoreReadingPosition(root,saved);
    assert.deepEqual(details.map(item => item.open), includeNotes ? [true,false,true,true] : [true,true]);
    assert.equal(panel.scrollTop,73);
    assert.deepEqual(scrollCalls.at(-1),[0,3456]);
    assert.deepEqual(focusCalls.at(-1),{preventScroll:true});
  }
  globalThis.document.getElementById = () => null;
  restoreReadingPosition(root,saved);
  assert.deepEqual(scrollCalls.at(-1),[0,3456]);
});

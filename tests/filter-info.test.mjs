import test from 'node:test';
import assert from 'node:assert/strict';
import { filterInfo } from '../site/js/filter-info.js';
import { installDom, click } from './recorded-dom.mjs';

test('help click closes both pinned and preview states until intentional re-entry', t => {
  installDom(t);
  for (const initiallyPinned of [false,true]) {
    const infos=new Set(initiallyPinned?['tone']:[]);
    const view={state:{open:{infos}},actions:{setOpen(kind,key,open){assert.equal(kind,'infos');if(open)infos.add(key);else infos.delete(key);}}};
    const root=filterInfo('tone','Tone','Explanation',view),button=root.children[0];
    for(let count=0;count<6;count++) {
      const open=!infos.has('tone');click(button);
      assert.equal(infos.has('tone'),open);
      assert.equal(button.attributes.get('aria-expanded'),String(open));
      assert.equal(root.classList.contains('is-open'),open);
      assert.equal(root.classList.contains('is-dismissed'),!open);
      for(const event of ['mouseleave','focusout'])root.dispatchEvent(new Event(event));
      assert.equal(root.classList.contains('is-dismissed'),!open);
    }
    const escape=new Event('keydown');Object.assign(escape,{key:'Escape'});button.dispatchEvent(escape);
    assert.equal(infos.has('tone'),false);
    assert.equal(root.classList.contains('is-dismissed'),true);
    for(const event of ['mouseenter','focusin']) {
      root.dispatchEvent(new Event(event));
      assert.equal(root.classList.contains('is-dismissed'),false);
      assert.equal(infos.has('tone'),false);
      button.dispatchEvent(escape);
    }
  }
});

import assert from 'node:assert/strict';

export async function checkFilterInfo({send,evaluate,capture}) {
  const display=()=>evaluate("getComputedStyle(document.querySelector('#info-toneBands')).display");
  const press=async(touch)=>{
    const {x,y}=await evaluate("(()=>{const r=document.querySelector('#info-toneBands-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    if(touch) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
    }
  };
  for(const width of [1280,390]) {
    const touch=width===390;
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:touch});
    await send('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
    await evaluate("document.querySelector('#info-toneBands-button').scrollIntoView({block:'center',behavior:'instant'});if(document.querySelector('#info-toneBands-button').getAttribute('aria-expanded')==='true')document.querySelector('#info-toneBands-button').click()");
    for(let cycle=0;cycle<2;cycle++) {
      await press(touch);assert.equal(await display(),'block');
      assert.equal(await evaluate("document.querySelector('#info-toneBands-button').getAttribute('aria-expanded')"),'true');
      await press(touch);assert.equal(await display(),'none');
      assert.equal(await evaluate("document.querySelector('#info-toneBands-button').getAttribute('aria-expanded')"),'false');
    }
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:width-1,y:899});
    assert.equal(await display(),'none','Moving away must not reopen a dismissed explanation through focus');
    assert.equal(await evaluate("(()=>{const input=document.querySelector('#setting-toneBands-good'),r=input.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input})()"),true,'The option below is visible and reachable');
    await capture(`filter-help-closed-${width}.png`);
    await evaluate("document.querySelector('#info-toneBands-button').blur();document.querySelector('#info-toneBands-button').focus()");
    assert.equal(await display(),'block','A fresh focus can preview the explanation again');
    for(const expected of ['block','none']) {
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert.equal(await display(),expected);
    }
  }
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
}

import assert from 'node:assert/strict';

export async function checkReadingFlow({send,evaluate,waitFor,capture}) {
  const mouse = async (selector, button = 'left') => {
    const {x,y} = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,clickCount:1});
  };
  for (const [width,height] of [[1280,900],[390,844]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Page.reload');
    await waitFor("document.querySelector('.topic-summary .cite') !== null && document.querySelector('.post-content') !== null");
    assert.equal(await evaluate("[...document.querySelectorAll('.post:not(.compact-post)')].every(post=>{const avatar=post.querySelector('.avatar'),badge=post.querySelector('.age-badge'),relative=post.querySelector('.post-relative-date');return avatar&&badge&&relative&&getComputedStyle(avatar).borderRadius==='50%'&&avatar.getBoundingClientRect().width===44&&getComputedStyle(badge).display!=='none'&&relative.textContent.length>0})"),true,'Author context stays visible on desktop and mobile');
    if(width===390)assert.equal(await evaluate("document.querySelector('.topic-summary').getBoundingClientRect().top < document.querySelector('.settings-panel').getBoundingClientRect().top"),true,'Mobile summary precedes the open controls');
    await evaluate("document.querySelector('.topic-summary .cite').scrollIntoView({block:'center'}); document.querySelector('.topic-summary .cite').focus({preventScroll:true})");
    const before = await evaluate("({y:scrollY,href:document.activeElement.href})");
    await mouse('.topic-summary .cite');
    await waitFor("document.querySelector('dialog.citation-preview')?.open === true");
    assert.equal(await evaluate('scrollY'),before.y,'Preview keeps the reading position');
    assert.equal(await evaluate("document.body.style.overflow"),'hidden');
    assert.equal(await evaluate("document.querySelector('.citation-preview a[target=\"_blank\"]').href"),before.href);
    assert.ok(await evaluate("document.querySelector('.citation-body').textContent.length > 20"));
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    await capture(`content-first-citation-${width}.png`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor("document.querySelector('.citation-preview') === null");
    assert.deepEqual(await evaluate("({y:scrollY,href:document.activeElement.href})"),before,'Escape restores position and citation focus');
    assert.equal(await evaluate('document.body.style.overflow'),'');

    const targetIds = new Set((await send('Target.getTargets',{},true)).targetInfos.map(target=>target.targetId));
    await mouse('.topic-summary .cite','middle');
    let opened;
    for (let attempt=0;attempt<30;attempt++) {
      opened=(await send('Target.getTargets',{},true)).targetInfos.find(target=>!targetIds.has(target.targetId)&&target.url===before.href);
      if(opened)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(opened,'Middle-click opens a real post link in another tab');
    await send('Target.closeTarget',{targetId:opened.targetId},true);
    assert.equal(await evaluate('scrollY'),before.y);
    assert.equal(await evaluate("document.querySelector('.citation-preview')"),null);

    await evaluate("document.querySelector('.post:not(.hidden-post):not(.compact-post)').scrollIntoView({block:'start'}); window.scrollBy(0,100)");
    const nextId = await evaluate("[...document.querySelectorAll('.post')].filter(p=>p.querySelector('.post-content')&&!p.querySelector('.post-content').hidden)[1].id");
    await mouse('.next-post');
    await waitFor(`document.activeElement.id === ${JSON.stringify(nextId)}`);
    assert.equal(await evaluate(`document.querySelector('#${nextId} .post-content').hidden`),false);
    assert.equal(await evaluate("(()=>{const r=document.querySelector('.next-post').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===document.querySelector('.next-post')})()"),true,'Next stays visible and clickable after skipping');
    await capture(`content-first-posts-${width}.png`);
    const savedTheme=await evaluate('document.documentElement.dataset.theme');
    for(const theme of ['light','dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      assert.equal(await evaluate("(()=>{const posts=[...document.querySelectorAll('.forum-posts > .post')];return posts.every((post,index)=>{const style=getComputedStyle(post),rect=post.getBoundingClientRect(),footer=post.querySelector('.post-actions');return style.boxShadow==='none'&&style.borderLeftWidth==='1px'&&style.borderRightWidth==='1px'&&(!footer||(footer.closest('.post')===post&&footer.getBoundingClientRect().bottom<=rect.bottom))&&(index===0||rect.top-posts[index-1].getBoundingClientRect().bottom>=15);})})()"),true,`Distinct post boundaries and contained footers at ${width}px in ${theme}`);
      assert.equal(await evaluate("[...document.querySelectorAll('.version')].every(n=>getComputedStyle(n).borderLeftWidth==='0px')"),true,'Text versions do not look like nested post sections');
      await capture(`post-boundaries-${theme}-${width}.png`);
    }
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(savedTheme)}`);
    const thirdId = await evaluate("[...document.querySelectorAll('.post')].filter(p=>p.querySelector('.post-content')&&!p.querySelector('.post-content').hidden)[2].id");
    await mouse('.next-post');
    await waitFor(`document.activeElement.id === ${JSON.stringify(thirdId)}`);
    // Jump from the last rendered post across a lazy-loading boundary. The button
    // must work even before the intersection observer has loaded the next batch.
    const result = await evaluate("(()=>{const posts=[...document.querySelectorAll('.post')].filter(p=>p.querySelector('.post-content')&&!p.querySelector('.post-content').hidden);const last=posts.at(-1);const count=document.querySelectorAll('.post').length;last.scrollIntoView({block:'start',behavior:'instant'});const geometry={y:scrollY,height:innerHeight,total:document.documentElement.scrollHeight,top:last.getBoundingClientRect().top,bottom:last.getBoundingClientRect().bottom,nav:document.querySelector('.post-navigation').getBoundingClientRect().bottom};document.querySelector('.next-post').click();return {count,after:document.querySelectorAll('.post').length,before:last.id,focused:document.activeElement.id,geometry};})()");
    assert.ok(result.after>result.count,`Next loads the next batch: ${JSON.stringify(result)}`);
    assert.notEqual(result.focused,result.before);
    assert.ok(result.focused.startsWith('post-'));
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    const lastId=await evaluate("(()=>{for(let batch=0;batch<30&&!document.querySelector('.load-more').hidden;batch++)document.querySelector('.load-more').click();const last=[...document.querySelectorAll('.post')].filter(p=>p.querySelector('.post-content')&&!p.querySelector('.post-content').hidden).at(-1);last.scrollIntoView({block:'start',behavior:'instant'});document.querySelector('.next-post').click();return last.id})()");
    assert.equal(await evaluate("document.querySelector('.post-navigation [aria-live]').textContent"),'You’re at the last post.');
    assert.equal(await evaluate(`document.querySelector('#${lastId} .post-content').hidden`),false);
    await evaluate('window.scrollTo(0,0)');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
}

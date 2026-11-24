import assert from 'node:assert/strict';

export async function checkReadingFlow({send,evaluate,waitFor,capture}) {
  const mouse = async (selector, button = 'left') => {
    const {x,y} = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,clickCount:1});
  };
  for(const width of [1280,1024,800,701,700,390,320]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate("document.querySelector('.post:not(.compact-post):not(.hidden-post)').scrollIntoView({block:'start',behavior:'instant'})");
    assert.equal(await evaluate("(()=>{const panel=document.querySelector('.settings-panel'),r=panel.getBoundingClientRect();return r.width>=240&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.settings-panel')===panel})()"),true,`Reading controls stay visible and at least 240px wide at ${width}px`);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`No overflow at ${width}px`);
    assert.equal(await evaluate("['.previous-post','.next-post'].every(selector=>{const button=document.querySelector(selector),r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===button})"),true,`Both post navigation buttons are visible and clickable at ${width}px`);
  }
  for (const [width,height] of [[1280,900],[390,844]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate', {url:`${await evaluate('location.origin')}/?reading-flow=${width}#/topic/zcg`});
    await waitFor("document.querySelector('.topic-summary .cite') !== null && document.querySelector('.post-content') !== null");
    await evaluate(`document.querySelector('#setting-postOrder').value=${JSON.stringify(width===390?'oldest':'newest')};document.querySelector('#setting-postOrder').dispatchEvent(new Event('change'))`);
    const noFilterCount=await evaluate("document.querySelector('.match-count').textContent");
    assert.equal(await evaluate("document.querySelectorAll('.filter-options input:checked').length"),0);
    assert.equal(await evaluate("[...document.querySelectorAll('.settings-panel button')].some(button=>button.textContent==='Any')"),false);
    for (const [group,option] of [['toneBands','good'],['supportBands','high'],['postVersions','rewritten']]) {
      const selector=`#setting-${group}-${option}`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).checked`),true);
      assert.notEqual(await evaluate("document.querySelector('.match-count').textContent"),noFilterCount);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      assert.equal(await evaluate("document.querySelector('.match-count').textContent"),noFilterCount);
      assert.equal(await evaluate("document.querySelectorAll('.compact-post').length"),0);
    }
    assert.equal(await evaluate("[...document.querySelectorAll('.post:not(.compact-post)')].every(post=>{const avatar=post.querySelector('.avatar'),badge=post.querySelector('.age-badge'),relative=post.querySelector('.post-relative-date');return avatar&&badge&&relative&&getComputedStyle(avatar).borderRadius==='50%'&&avatar.getBoundingClientRect().width===44&&getComputedStyle(badge).display!=='none'&&relative.textContent.length>0})"),true,'Author context stays visible on desktop and mobile');
    assert.equal(await evaluate("document.querySelector('.question-summary').open"),false,'Main questions start collapsed');
    assert.equal(await evaluate("document.querySelector('.question-summary > summary').textContent"),'Explore the main questions');
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
    const firstId=await evaluate("document.querySelector('.post:not(.hidden-post):not(.compact-post)').id");
    await mouse('.previous-post');await waitFor(`document.activeElement.id === ${JSON.stringify(firstId)}`);
    await mouse('.previous-post');
    assert.equal(await evaluate("document.querySelector('.post-navigation [aria-live]').textContent"),'You’re at the first post.');
    await mouse('.next-post');await waitFor(`document.activeElement.id === ${JSON.stringify(nextId)}`);
    assert.equal(await evaluate(`document.querySelector('#${nextId} .post-content').hidden`),false);
    assert.equal(await evaluate("(()=>{const r=document.querySelector('.next-post').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===document.querySelector('.next-post')})()"),true,'Next stays visible and clickable after skipping');
    await capture(`content-first-posts-${width}.png`);
    const savedTheme=await evaluate('document.documentElement.dataset.theme');
    for(const theme of ['light','dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
      assert.equal(await evaluate("(()=>{const posts=[...document.querySelectorAll('.forum-posts > .post')];return posts.every((post,index)=>{const style=getComputedStyle(post),rect=post.getBoundingClientRect(),footer=post.querySelector('.post-actions');return style.boxShadow==='none'&&style.borderLeftWidth==='1px'&&style.borderRightWidth==='1px'&&(!footer||(footer.closest('.post')===post&&footer.getBoundingClientRect().bottom<=rect.bottom))&&(index===0||rect.top-posts[index-1].getBoundingClientRect().bottom>=15);})})()"),true,`Distinct post boundaries and contained footers at ${width}px in ${theme}`);
      assert.equal(await evaluate("[...document.querySelectorAll('.version')].every(n=>getComputedStyle(n).borderLeftWidth==='0px')"),true,'Text versions do not look like nested post sections');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.version-neutral')).backgroundColor"),theme==='light'?'rgb(238, 245, 252)':'rgb(27, 43, 61)','Rewrites have a subtle blue background');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.version-original')).backgroundColor"),'rgba(0, 0, 0, 0)','Originals keep the post background');
      await capture(`post-boundaries-${theme}-${width}.png`);
      const previousY=await evaluate('scrollY');
      await evaluate("document.querySelector('.version-neutral').closest('.post').scrollIntoView({block:'start',behavior:'instant'})");
      await capture(`rewrite-blue-${theme}-${width}.png`);
      await evaluate(`window.scrollTo(0,${previousY})`);
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
    const beforeLast=await evaluate("[...document.querySelectorAll('.post:not(.hidden-post):not(.compact-post)')].at(-2).id");
    await mouse('.previous-post');await waitFor(`document.activeElement.id === ${JSON.stringify(beforeLast)}`);
    await evaluate('window.scrollTo(0,0)');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('#setting-postOrder').value='newest';document.querySelector('#setting-postOrder').dispatchEvent(new Event('change'))");
}

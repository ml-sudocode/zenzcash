import assert from 'node:assert/strict';

export async function checkSavedHistory({send,evaluate,waitFor,capture,authenticate}) {
  const waitTopic = id => waitFor(`document.querySelector('.topic-head h1') !== null && document.querySelector('.save-topic') !== null && location.hash==='#/topic/${id}' && !document.querySelector('.notice')?.textContent.includes('Loading topic')`);
  const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const mark = async index => {
    const id = await evaluate(`(()=>{
      for(let i=0;i<8&&!document.querySelector('.load-more').hidden;i++)document.querySelector('.load-more').click();
      const post=[...document.querySelectorAll('.post:not(.hidden-post):not(.compact-post)')][${index}];
      post.querySelector('.version-tab-original')?.click();
      post.querySelectorAll('details').forEach(detail=>{detail.open=true});
      post.querySelector('.post-actions').scrollIntoView({block:'center',behavior:'instant'});window.scrollBy(0,17);
      document.querySelector('.settings-panel').scrollTop=60;
      return post.id;
    })()`);
    await settle();
    const expression = `(()=>{const post=document.getElementById(${JSON.stringify(id)});return {y:scrollY,panel:document.querySelector('.settings-panel').scrollTop,top:post.getBoundingClientRect().top,details:[...post.querySelectorAll('details')].map(d=>d.open),version:post.querySelector('.version').className,loaded:document.querySelectorAll('.post').length,order:document.querySelector('#setting-postOrder').value}})()`;
    return {id,expression,value:await evaluate(expression)};
  };
  const expect = async saved => {
    await waitFor(`document.getElementById(${JSON.stringify(saved.id)}) !== null`);
    await settle();assert.deepEqual(await evaluate(saved.expression),saved.value);
  };
  for(const width of [1280,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:`http://localhost:8017/?navigation=${width}#/topic/zcg`});await waitTopic('zcg');
    await evaluate("document.querySelector('#setting-postOrder').value='oldest';document.querySelector('#setting-postOrder').dispatchEvent(new Event('change'))");
    const first = await mark(65);
    assert.ok(first.value.loaded>60);assert.ok(first.value.y>1000);
    await evaluate("location.hash='#/how-to-use'");await waitFor("document.querySelector('.info-page h1')?.textContent==='How to use Zenzcash'");
    await evaluate('history.back()');await expect(first);
    await evaluate("location.hash='#/topic/history-other'");await waitFor("document.querySelector('.topic-head h1')?.textContent==='History test discussion'");
    const second=await mark(25);
    await evaluate("location.hash='#/topic/zcg'");await waitFor("document.querySelector('.topic-head h1')?.textContent==='What should happen to Zcash’s grants funding?'");
    const repeated=await mark(5);
    assert.notEqual(first.value.y,repeated.value.y);
    await evaluate("location.hash='#/'");await waitFor("document.querySelector('.info-page') !== null");
    await evaluate('history.back()');await expect(repeated);
    await evaluate('history.back()');await expect(second);
    await evaluate('history.back()');await expect(first);
    await evaluate('history.forward()');await expect(second);
    await evaluate('history.back()');await expect(first);
    await send('Page.reload');await expect(first);
    await send('Page.navigate',{url:'http://127.0.0.1:8017/prompt.md'});
    await waitFor("document.querySelector('.topic') === null && document.body?.textContent.startsWith('# Explore these selected forum posts')");
    await evaluate('history.back()');await expect(first);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await capture(`history-return-${width}.png`);
  }
  await evaluate("document.querySelector('.save-topic').click()");await waitFor("document.querySelector('#account-panel') !== null");
  assert.match(await evaluate("document.querySelector('#account-panel').textContent"),/Sign in to save topics/);
  await evaluate('history.back()');await waitFor("document.querySelector('.save-topic') !== null");
  await authenticate();await send('Page.reload');await waitFor("document.querySelector('#header-logout') !== null");
  assert.equal(await evaluate("document.querySelector('#site-nav a[href=\"#/saved\"]').textContent"),'Saved');
  await evaluate("document.querySelector('.save-topic').click()");await waitFor("document.querySelector('.save-topic').getAttribute('aria-pressed')==='true'");
  await evaluate("document.querySelector('[aria-label=\"Save post\"]').click()");await waitFor("document.querySelector('[aria-label=\"Remove bookmark\"]') !== null");
  await evaluate("location.hash='#/saved'");await waitFor("document.querySelector('.saved-page') !== null");
  for(const width of [1280,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.reload');await waitFor("document.querySelector('.saved-page') !== null");
    assert.equal(await evaluate("document.querySelector('.saved-topics h2').textContent"),'Saved topics (1)');
    assert.equal(await evaluate("document.querySelector('.saved-posts h2').textContent"),'Saved posts (1)');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await capture(`saved-items-${width}.png`);
  }
  await evaluate("document.querySelector('.saved-topics a').click()");await waitFor("document.querySelector('.save-topic') !== null");
  assert.equal(await evaluate("document.querySelector('.save-topic').getAttribute('aria-pressed')"),'true');
  await evaluate("location.hash='#/topic/history-other'");await waitFor("document.querySelector('.topic-head h1')?.textContent==='History test discussion'");
  await evaluate("document.querySelector('.save-topic').click()");await waitFor("document.querySelector('.save-topic').getAttribute('aria-pressed')==='true'");
  await evaluate("location.hash='#/saved'");await waitFor("document.querySelector('.saved-topics h2')?.textContent==='Saved topics (2)'");
  await evaluate("document.querySelector('.saved-topics button').click()");await waitFor("document.querySelector('.saved-topics h2')?.textContent==='Saved topics (1)'");
  assert.equal(await evaluate("document.querySelector('.saved-posts h2').textContent"),'Saved posts (1)');
  await evaluate("document.querySelector('.saved-posts button').click()");await waitFor("document.querySelector('.saved-posts h2')?.textContent==='Saved posts (0)'");
  assert.equal(await evaluate("document.querySelector('.saved-topics h2').textContent"),'Saved topics (1)');
  console.log('Saved/history browser passed: account topic/post saves, reload persistence, independent removal, Back/Forward across topics, repeated URLs, loaded batches, text versions, open details, reload and leaving the site at desktop/phone widths.');
}

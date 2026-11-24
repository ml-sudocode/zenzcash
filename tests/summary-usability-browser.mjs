import assert from 'node:assert/strict';

export async function checkSummaryUsability({ send, evaluate, waitFor, capture }) {
  const button = label => `[...document.querySelectorAll('.selection-bar button')].find(button=>button.textContent===${JSON.stringify(label)})`;
  const all = button('Select all in this topic');
  const clear = button('Clear selection');
  for (const width of [1280,390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', {url:`${await evaluate('location.origin')}/?summary-usability=${width}#/topic/zcg`});
    await waitFor("document.querySelector('.explore-arguments') !== null");
    assert.equal(await evaluate("document.querySelector('.question-summary').open"), false);
    assert.equal(await evaluate("document.querySelectorAll('.citation-legend li').length"), 4);
    assert.equal(await evaluate("document.querySelector('#setting-showReframing')"), null);
    assert.equal(await evaluate("document.body.textContent.includes('View AI note on reframing')"), false);
    assert.match(await evaluate("document.querySelector('.newness-explanation').textContent"), /first cited post/);
    assert.equal(await evaluate(`(()=>{
      return [...document.querySelectorAll('.control-heading')].every(heading=>{
        const label=heading.firstElementChild.getBoundingClientRect(),info=heading.querySelector('.info-button').getBoundingClientRect();
        return info.top<label.bottom && label.top<info.bottom && info.left>=label.right;
      });
    })()`), true, 'Help icons share the label row');
    await capture(`summary-usability-${width}.png`);
    await evaluate("document.querySelector('.explore-arguments').click()");
    assert.equal(await evaluate("document.querySelector('.question-summary').open && [...document.querySelectorAll('.question-card,.question-arguments')].every(node=>node.open)"), true);
    await evaluate("document.querySelector('#setting-highlightNew').click()");
    assert.equal(await evaluate("document.querySelector('.question-summary').open && [...document.querySelectorAll('.question-card,.question-arguments')].every(node=>node.open)"), true, 'Open arguments survive a settings redraw');
    await evaluate("document.querySelector('#setting-highlightNew').click(); document.querySelector('.question-summary > summary').click(); document.querySelector('.selection-bar > summary').click()");
    for (const theme of ['light','dark']) {
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}; ${clear}.click()`);
      const inactive = await evaluate(`getComputedStyle(${all}).backgroundColor`);
      await evaluate(`${all}.click()`);
      assert.equal(await evaluate(`${all}.getAttribute('aria-pressed')`), 'true');
      const active = await evaluate(`getComputedStyle(${all}).backgroundColor`);
      assert.notEqual(active, inactive, 'Full selection is colored');
      await evaluate("document.querySelector('.post-selection input').click()");
      assert.equal(await evaluate(`${all}.getAttribute('aria-pressed')`), 'mixed');
      assert.notEqual(await evaluate(`getComputedStyle(${all}).backgroundColor`), active, 'Partial selection has its own style');
      await evaluate("document.querySelector('.selection-bar').scrollIntoView({block:'start',behavior:'instant'})");
      await capture(`selection-states-${theme}-${width}.png`);
    }
    await evaluate(`${clear}.click(); ${button('Done selecting')}.click(); document.documentElement.dataset.theme='light'`);
    // Exercise both an ordinary topic route and a direct post route, with open
    // footer details and a scrolled control panel, through actual browser history.
    for (const deepLink of [false,true]) {
      if (deepLink) {
        await evaluate("location.hash=document.querySelectorAll('.post:not(.hidden-post) .post-meta a')[10].hash");
        await waitFor("document.activeElement.classList.contains('post')");
      }
      const target = await evaluate("document.querySelectorAll('.post:not(.hidden-post):not(.compact-post)')[10].id");
      const selector = JSON.stringify(`#${target}`);
      await evaluate(`(()=>{
        const post=document.querySelector(${selector});
        post.querySelectorAll('details').forEach(detail=>{detail.open=true});
        const button=post.querySelector('[aria-label="Save post · sign-in required"]');
        button.scrollIntoView({block:'center',behavior:'instant'});button.focus({preventScroll:true});
        document.querySelector('.settings-panel').scrollTop=45;
      })()`);
      const measure = `({y:scrollY,panel:document.querySelector('.settings-panel').scrollTop,details:[...document.querySelector(${selector}).querySelectorAll('details')].map(detail=>detail.open)})`;
      const before = await evaluate(measure);
      assert.ok(before.y > 1000, 'Return test starts deep in the discussion');
      await evaluate(`document.querySelector(${selector}).querySelector('[aria-label="Save post · sign-in required"]').click()`);
      await waitFor("document.querySelector('#account-panel') !== null");
      await evaluate('history.back()');
      await waitFor("document.querySelector('.settings-panel') !== null");
      assert.deepEqual(await evaluate(measure), before, 'Back restores the exact reading position and open post details');
      await evaluate('history.forward()');
      await waitFor("document.querySelector('#account-panel') !== null");
      await evaluate("document.querySelector('#account-panel a').click()");
      await waitFor("document.querySelector('.settings-panel') !== null");
      assert.deepEqual(await evaluate(measure), before, 'Back to reading restores position too');
      await capture(`login-return-${deepLink?'post':'topic'}-${width}.png`);
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await evaluate("location.hash='#/topic/zcg'");
    await waitFor("document.querySelector('.settings-panel') !== null && location.hash==='#/topic/zcg'");
  }
  await evaluate("location.hash='#/how-to-use'");
  await waitFor("document.querySelector('.info-page h1')?.textContent === 'How to use Zenzcash'");
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  const helpY = await evaluate('scrollY');
  assert.ok(helpY > 0);
  await evaluate("document.querySelector('.companion').click()");
  await waitFor("document.querySelector('#account-panel') !== null");
  await evaluate('history.back()');
  await waitFor("document.querySelector('.info-page h1')?.textContent === 'How to use Zenzcash'");
  assert.equal(await evaluate('scrollY'), helpY, 'Login return also preserves position on other pages');
  await evaluate("location.hash='#/topic/zcg'");
  await waitFor("document.querySelector('.settings-panel') !== null");
  await send('Emulation.setDeviceMetricsOverride', { width:1280,height:900,deviceScaleFactor:1,mobile:false });
}

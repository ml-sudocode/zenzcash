import assert from "node:assert/strict";
import test from "node:test";
import { renderPost } from "../site/js/post.js";
import { renderTopic, whatsNewSummary } from "../site/js/topic.js";
import { DEFAULT_SETTINGS, participantNumbers } from "../site/js/logic.js";
import { buildSiteData } from "../tools/build.mjs";
import { goodMarks } from "./marks-fixture.mjs";
import { sampleThread } from "./helpers.mjs";
import { installDom, descendants, nodes, findId, click } from "./recorded-dom.mjs";

function fixture(t) {
  installDom(t);
  const thread = sampleThread();
  const card = { title: "Funding", byline: "b", keywords: [], interests: [] };
  const data = buildSiteData({ snapshotAt: "2026-10-31T21:00:00Z", threads: [thread] }, Object.fromEntries(["alice", "bob", "carol"].map((name) => [name, { created_at: null, status: "profile hidden" }])), [
    { task: "marks", model: "test", backend: "primary-agent", output: goodMarks() },
    { task: "summary", model: "test", backend: "primary-agent", output: { topic: "zcg", card, headline: "A funding debate", overview: [], points: [], issues: [] } },
  ]);
  const state = {
    data, settings: { ...structuredClone(DEFAULT_SETTINGS), includeHiddenAge: true }, lastVisit: null, thread: 7, shown: new Map([[7, 20]]),
    open: { settings: false, summary: false, highlights: false, newPoints: false, infos: new Set(), flags: false, marks: new Set(), questions: new Set(), arguments: new Set() },
    shownFiltered: new Set(), collapsed: new Set(), versions: new Map(), revealed: new Set(), selected: new Set(), selecting: false, flash: null,
    ratings: { status: "ready", posts: {}, mine: {} }, feedback: { status: "ready", mine: {} }, reader: { problem: null },
  };
  const opened = [];
  const patches = [];
  const actions = {
    setExpanded(key, expanded) { if (expanded) state.collapsed.delete(key); else state.collapsed.add(key); },
    setVersion(key, id) { state.versions.set(key, id); },
    setOpen(kind, key, open) { if (["settings", "summary", "flags", "highlights", "newPoints"].includes(kind)) state.open[kind] = open; else if (open) state.open[kind].add(key); else state.open[kind].delete(key); },
    openPost(key) { opened.push(key); },
    setSettings(patch) { patches.push(patch); Object.assign(state.settings, patch); },
    collapseAll() { for (const post of data.topic.threads.flatMap(t=>t.posts)) if (!post.hidden) state.collapsed.add(post.key); },
    expandAll() { state.collapsed.clear(); },
  };
  const posts = data.topic.threads[0].posts;
  const view = { state, actions, allPosts: posts, posts: new Map(posts.map((p) => [p.key, p])), threadOf: new Map(posts.map((p) => [p.key, data.topic.threads[0]])), letterOf: new Map([[7, "A"]]), numbers: participantNumbers(data.topic), snapshotAt: data.snapshot_at, news: { posts: new Set(), points: [] }, transform: (text) => text };
  return { data, state, actions, posts, view, opened, patches };
}

test("forum source links survive collapsed, expanded, filtered, anonymous and privacy views", t => {
  const {data,state,posts,view}=fixture(t);
  for(let mask=0;mask<16;mask++)for(const version of ['original','neutral','diff']) {
    state.settings.anonymous=Boolean(mask&1);
    state.settings.includeHiddenAge=!(mask&2);
    data.visibility_pending=Boolean(mask&4);
    for(const post of posts) {
      if(mask&8)state.collapsed.delete(post.key);else state.collapsed.add(post.key);
      state.versions.set(post.key,version);
      const root=renderPost(post,view),sources=nodes(root,'source-post-link');
      assert.equal(sources.length,post.hidden?0:1);
      if(post.hidden)continue;
      const anchor=sources[0].querySelector('a');
      assert.equal(anchor.attributes.get('href'),`${view.threadOf.get(post.key).url}/${post.number}`);
      assert.equal(anchor.attributes.get('target'),'_blank');
      assert.equal(anchor.attributes.get('rel'),'noopener noreferrer nofollow');
      assert.equal(anchor.textContent,'On the forum ↗');
      if(mask&2 && !(mask&4))assert(root.classList.contains('compact-post'));
    }
  }
});

test("privacy refresh keeps public originals readable without derived analysis or grade controls",t=>{
  const {data,state,actions}=fixture(t);data.visibility_pending=true;data.topic.headline='Original discussion';
  const hidden=data.topic.threads[0].posts[1];hidden.hidden=true;hidden.raw=null;hidden.own_text=null;hidden.segments=null;
  for(const post of data.topic.threads[0].posts)post.analysis=null;
  const root=renderTopic(data,state,actions);
  assert.match(root.textContent,/remaining originals are available/);assert.match(root.textContent,/ZCG should end/);
  assert.equal(root.textContent.includes('You are clearly paid'),false);assert.equal(nodes(root,'post-brief').length,0);assert.equal(nodes(root,'settings-panel').length,0);
  assert.equal(nodes(root,'post-body').length,2);assert.equal(nodes(root,'hidden-post').length,2);
});

test("visible posts open with full text; collapsing shows a brief and keeps actions available", (t) => {
  const { posts, view } = fixture(t);
  for (const post of posts) {
    const root = renderPost(post, view);
    if (post.hidden) {
      assert.equal(nodes(root, "post-toggle").length, 0);
      assert.equal(nodes(root, "post-brief").length, 0);
      continue;
    }
    const toggle = nodes(root, "post-toggle")[0];
    const content = nodes(root, "post-content")[0];
    assert.equal(content.hidden, false);
    assert.equal(nodes(root, 'post-body').length, 1);
    assert.equal(nodes(root, 'post-feedback')[0].open, false);
    assert.equal(nodes(root, "post-brief")[0].textContent, post.analysis.summary);
    assert.equal(nodes(root, 'post-brief')[0].hidden, true);
    assert.equal(toggle.attributes.get("aria-expanded"), "true");
    assert.equal(toggle.attributes.get("aria-controls"), content.id);
    click(toggle);
    assert.equal(content.hidden, true);
    assert.equal(nodes(root, 'post-brief')[0].hidden, false);
    assert.equal(toggle.attributes.get("aria-expanded"), "false");
    assert.equal(nodes(root, "why-marks").length, 1);
    assert.equal(nodes(root, "editor-analysis").length, 0);
    click(toggle);
    assert.equal(content.hidden, false);
    assert.equal(toggle.attributes.get("aria-expanded"), "true");
  }
});

test("filtering makes compact rows; explicitly shown posts retain original, rewrite and changes", (t) => {
  const { posts, view, state } = fixture(t);
  state.settings.toneBands = ["good"];
  let root = renderPost(posts[1], view);
  assert.equal(root.classList.contains("compact-post"), true);
  assert.equal(nodes(root, "post-content").length, 0);
  state.shownFiltered.add("7/2"); root = renderPost(posts[1], view);
  assert.equal(nodes(root, "post-content")[0].hidden, false);
  assert.equal(nodes(root, "version-neutral").length, 1);
  // A quote is kept separate from the rewritten authored text.
  assert.equal(nodes(root, "forum-quote").length, 1);
  click(nodes(root, "version-tab-original")[0]);
  assert.equal(nodes(root, "version-original").length, 1);
  click(nodes(root, "version-tab-diff")[0]);
  assert.equal(nodes(root, "version-diff").length, 1);
  const runs = nodes(root, "diff-text")[0].children;
  assert.equal(runs.filter((n) => n.tag !== "del").map((n) => n.textContent).join(""), posts[1].analysis.neutral_rendition);
  assert.equal(runs.filter((n) => n.tag !== "ins").map((n) => n.textContent).join(""), posts[1].own_text);
  assert.equal(nodes(root, "forum-quote").length, 1);
  assert.equal(nodes(root, "why-marks")[0].textContent.includes("Claims and re-write details"), true);
});

test("summary precedes new points; sorting is directly available and bulk controls retain explicit choices", (t) => {
  const { data, state, actions, patches } = fixture(t);
  let root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "since-row").length, 1);
  assert.equal(nodes(nodes(root, "whats-new")[0], "since-row").length, 1);
  assert.equal(nodes(root, "debate-summary").length, 0);
  assert.equal(nodes(root, "settings-panel")[0].tag, 'aside');
  assert.equal(nodes(root, "post-content").every((n) => !n.hidden), true);
  assert.equal(nodes(root, 'next-post').length, 1);
  const news = nodes(root, "whats-new")[0];
  click(descendants(news).find((n) => n.tag === "button" && n.textContent === "3 days"));
  assert.deepEqual(patches, [{ since: { kind: "pull-days", days: 3 } }]);
  root = renderTopic(data, state, actions);
  click(findId(root, "collapse-all"));
  assert.deepEqual([...state.collapsed], ['7/1','7/2','7/4']);
  root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "post-content").every((n) => n.hidden), true);
  click(findId(root, "expand-all"));
  assert.deepEqual([...state.collapsed], []);
  root = renderTopic(data, state, actions);
  assert.equal(nodes(root, "post-content").every((n) => !n.hidden), true);
  const selects = descendants(root).filter((n) => n.tag === "select");
  assert.equal(selects.length, 3);
  assert.deepEqual(findId(root,'setting-preferredVersion').children.map(n => n.textContent), ["Show me the re-write first", "Show me original text first"]);
  const thread=data.topic.threads[0];
  assert.equal(findId(root,'setting-threadView').children[1].textContent,`A · ${thread.title} (${thread.posts.length} posts)`);
  const source=descendants(nodes(root,'included-threads')[0]).find(n=>n.tag==='button');
  let selectedThread=null;
  actions.setThread=id=>{selectedThread=id;};
  click(source);
  assert.equal(selectedThread,thread.id);
  const content = nodes(root, "reading-content")[0];
  assert.equal(content.children[0].className, "topic-summary card");
  assert.equal(content.children[1].className, "whats-new card");
});

test("source-derived summaries and analysis render as text with mention masking", (t) => {
  const { posts, view, state } = fixture(t);
  const payload = '<img src=x onerror="alert(1)"> @alice';
  posts[1].analysis.summary = payload;
  posts[1].analysis.dimensions.tone.rationale = payload;
  view.transform = (text) => text.replaceAll("@alice", "@Participant 1");
  const root = renderPost(posts[1], view);
  assert.equal(descendants(root).some((n) => n.tag === "img" || n.tag === "script"), false);
  assert.equal(nodes(root, "post-brief")[0].textContent, '<img src=x onerror="alert(1)"> @Participant 1');
  assert.equal(nodes(root, "why-marks")[0].textContent.includes('@Participant 1'), true);
});

test("only disputed-assumption notes remain highlighted, with underlying analysis still inspectable", (t) => {
  const { posts, view, state, opened } = fixture(t);
  const post = posts[0];
  post.analysis.flags = ["disputed_premise_presented_as_settled", "useful_reframing"].map((code) => ({ code, exact_span: "ZCG should end.", explanation: "An illustrative passage explanation.", target: "Funding", severity: "material", scope: "isolated", confidence: "medium" }));
  let root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 1);
  assert.equal(nodes(root, 'highlighted-flag')[0].querySelector('summary').textContent, 'View AI note on a disputed assumption');
  assert.equal(nodes(root, "highlighted-flag")[0].open, false);
  assert.match(nodes(root, "highlighted-flag")[0].textContent, /not additional words from its author/);
  assert.deepEqual(opened, []);
  state.settings.flagAssumptions = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 0);
  assert.equal(nodes(root, 'passage-flags')[0].children.length, 2);
  state.settings.showReframing = false;
  root = renderPost(post, view);
  assert.equal(nodes(root, "highlighted-flag").length, 0);
  assert.equal(nodes(root, "why-marks").length, 1);
});

test("monthly slider and hidden-age choice render; highlights stay visible across filter changes", (t) => {
  const {data,state,actions,patches}=fixture(t);
  let root=renderTopic(data,state,actions);
  const slider=findId(root,"setting-minAccountMonths");
  assert.deepEqual(["type","min","max","step","value"].map(key=>slider.attributes.get(key)),["range","0","120","1","0"]);
  slider.value="6"; slider.setCustomValidity=(message)=>assert.equal(message,"");
  slider.dispatchEvent(new Event("change"));
  assert.deepEqual(patches,[{minAccountMonths:6}]);
  assert.equal(findId(root,'setting-showReframing'),undefined);
  for (const key of ["toneBands","supportBands","accountAge","postVersions","preferredVersion","flagAssumptions","highlightNew","anonymous","showRatings","pullWindow","threadView","postOrder"]) {
    const button=findId(root,`info-${key}-button`);
    assert.equal(button.attributes.get("aria-controls"),`info-${key}`);
    assert.equal(button.attributes.get("aria-expanded"),"false");
    assert.ok(findId(root,`info-${key}`).textContent.length>50);
  }
  const inclusion=findId(root,"setting-includeHiddenAge");
  inclusion.checked=true;inclusion.dispatchEvent(new Event("change"));
  assert.deepEqual(patches.at(-1),{includeHiddenAge:true});
  actions.setOpen('newPoints',null,true);
  actions.setSettings({since:{kind:"pull-days",days:7},anonymous:true});
  root=renderTopic(data,state,actions);
  assert.equal(nodes(root,"highlight-settings")[0].tag,"fieldset");
  assert.equal(state.open.newPoints,true);
  assert.deepEqual(nodes(root,"since-row")[0].children.filter(n=>n.tag==="button").map(n=>n.textContent),["1 day","3 days","7 days"]);
});

test("rewrite audits group identical operations once without losing distinct quoted evidence", async (t) => {
  const {posts,view,state}=fixture(t);
  const {groupRewriteChanges}=await import('../site/js/post-analysis.js');
  const changes=[{operation:"Attribute the allegation.",source_span:"First quote"},{operation:"Keep milestones.",source_span:"Second quote"},{operation:"Attribute the allegation.",source_span:"Third quote"},{operation:"Attribute the allegation.",source_span:"First quote"}];
  assert.deepEqual(groupRewriteChanges(changes),[{operation:"Attribute the allegation.",spans:["First quote","Third quote"]},{operation:"Keep milestones.",spans:["Second quote"]}]);
  posts[1].analysis.rewrite_changes=changes;
  const root=renderPost(posts[1],view);
  assert.equal(root.textContent.split("Attribute the allegation.").length-1,1);
  for(const quote of ["First quote","Second quote","Third quote"]) assert.equal(root.textContent.split(quote).length-1,1);
  const reactions=descendants(root).filter(n=>n.tag==="button" && n.attributes.get("aria-label")?.startsWith("Heart:"));
  assert.deepEqual(reactions.map(n=>n.attributes.get("aria-label")),["Heart: This made things worse","Heart: No change","Heart: Helped"]);
  assert.deepEqual(reactions.map(n=>n.textContent),['Made things worse','No change','Helped']);
  assert.equal(nodes(root,"bookmark-icon").length,1);
});

test('newness is labeled per post and each post owns its analysis and feedback footer', t => {
  const {posts,state,view,data}=fixture(t);
  const post=posts[1];
  view.news.posts.add(post.key);
  for(const days of [1,3,7])for(const highlight of [false,true])for(const isNew of [false,true]) {
    state.settings.since.days=days;
    state.settings.highlightNew=highlight;
    if(isNew)view.news.posts.add(post.key);else view.news.posts.delete(post.key);
    const root=renderPost(post,view);
    assert.equal(nodes(root,'post-new').length,highlight&&isNew?1:0);
    if(highlight&&isNew)assert.equal(nodes(root,'post-new')[0].textContent,`New in selected ${days}-day window`);
    const footer=nodes(root,'post-actions')[0];
    assert.equal(footer.tag,'footer');
    assert.equal(footer.attributes.get('aria-label'),`Actions for post A#${post.number}`);
    assert.equal(footer.parentNode.parentNode,root);
    assert.equal(nodes(footer,'post-feedback').length,1);
    assert.equal(nodes(footer,'why-marks').length,1);
    assert.equal(nodes(footer,'post-disclosure').length,1);
    assert.equal(nodes(footer,'post-content').length,0);
  }
  assert.equal(nodes(renderPost(post,view),'post-thread').length,0);
  data.topic.threads.push({id:8,title:'Another thread',posts:[]});
  assert.equal(nodes(renderPost(post,view),'post-thread')[0].textContent,`Thread A · ${data.topic.threads[0].title}`);
  state.settings.threadView='thread';
  assert.equal(nodes(renderPost(post,view),'post-thread').length,0);
});

test('post headers retain circular identity, visible tenure and relative dates without leaking masked identities', t => {
  const {posts,state,view}=fixture(t);
  t.mock.method(Date,'now',()=>Date.parse('2026-11-23T12:00:00Z'));
  const post=posts[1];
  post.created_at='2026-10-26T12:00:00Z';
  for(const [account,label] of [
    [{created_at:'2020-01-01T00:00:00Z',status:'public'},'6 years on the forum'],
    [{created_at:'2026-01-01T00:00:00Z',status:'public'},'9 months on the forum'],
    [{created_at:null,status:'profile hidden'},'profile hidden'],
  ]) {
    post.account=account;
    for(const masked of [false,true]) {
      state.settings.anonymous=masked;
      state.revealed.clear();
      const root=renderPost(post,view),head=nodes(root,'post-head')[0];
      assert.equal(nodes(head,'avatar')[0].textContent,masked?'P2':'B');
      assert.equal(nodes(head,'avatar')[0].attributes.get('aria-hidden'),'true');
      assert.equal(nodes(head,'author')[0].textContent,masked?'Participant 2':'bob');
      assert.deepEqual(nodes(head,'age-badge').map(n=>n.textContent),masked?[]:[label]);
      assert.equal(nodes(head,'post-relative-date')[0].textContent,'28 days ago');
      assert.equal(nodes(head,'post-meta')[0].textContent.includes('2026'),true);
      if(masked) {
        assert.equal(head.textContent.includes('bob'),false);
        state.revealed.add(post.key);
        const revealed=renderPost(post,view);
        assert.equal(nodes(revealed,'avatar')[0].textContent,'B');
        assert.equal(nodes(revealed,'age-badge')[0].textContent,label);
      }
    }
  }
});

test('rewrite-first defaults remain distinct from originals with no rewrite or no analysis', t => {
  const {posts,state,view}=fixture(t);
  assert.equal(state.settings.preferredVersion,'neutral');
  const rewritten=posts.find(post=>post.analysis?.neutral_rendition != null);
  assert.ok(rewritten);
  const first=renderPost(rewritten,view);
  assert.equal(nodes(first,'version-neutral').length,1);
  assert.equal(nodes(first,'version-label')[0].textContent,'AI re-write · check against the original');
  click(nodes(first,'version-tab-original')[0]);
  assert.equal(nodes(first,'version-label')[0].textContent,'Original · as posted on the forum');
  click(nodes(first,'version-tab-neutral')[0]);
  assert.equal(nodes(first,'version-neutral').length,1);
  for(const preference of ['neutral','original']) {
    state.settings.preferredVersion=preference;
    for(const analysis of [{...rewritten.analysis,neutral_rendition:null},null]) {
      const root=renderPost({...rewritten,analysis},view);
      assert.equal(nodes(root,'version-label')[0].textContent,analysis===null
        ? 'Original · this dated post has not been analyzed' : 'Original · no AI re-write available');
      assert.equal(nodes(root,'version-tabs').length,0);
      assert.equal(nodes(root,'version-original').length,1);
      assert.equal(nodes(root,'post-content')[0].hidden,false);
    }
  }
});

test("failed expansion stays retryable and does not interrupt other posts", t => {
  const { posts, state, view } = fixture(t);
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  t.after(() => { console.error = original; });
  const post = posts[0];
  const segments = post.segments;
  state.settings.preferredVersion = 'original';
  state.collapsed.add(post.key);
  const root = renderPost(post, view);
  post.segments = null;
  click(nodes(root, 'post-toggle')[0]);
  assert.equal(state.collapsed.has(post.key), true);
  assert.equal(nodes(root, 'post-display-error')[0].textContent, 'This post could not be displayed.');
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], `Rendering post ${post.key} failed`);
  assert.equal(nodes(renderPost(posts[1], view), 'post-toggle').length, 1);
  post.segments = segments;
  click(nodes(root, 'post-toggle')[0]);
  assert.equal(state.collapsed.has(post.key), false);
  assert.equal(nodes(root, 'post-display-error').length, 0);
});

test("failed default rendering stays collapsed without hiding other posts", t => {
  const { posts, state, view } = fixture(t);
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  state.settings.preferredVersion = 'original';
  posts[0].segments = null;
  const failed = renderPost(posts[0], view);
  const succeeded = renderPost(posts[1], view);
  assert.equal(nodes(failed, 'post-display-error').length, 1);
  assert.equal(nodes(succeeded, 'post-display-error').length, 0);
  assert.deepEqual([...state.collapsed], [posts[0].key]);
});

test('new points show up to three immediately; Show all preserves their sources and order', t => {
  const {data,state,view}=fixture(t);
  view.pulledAt=data.snapshot_at;
  for (const count of [0,1,2,3,5]) {
    data.topic.points=Array.from({length:count},(_,i)=>({id:`p${i+1}`,text:`New point ${i+1}`,cites:['7/1']}));
    view.news.points=data.topic.points.map(p=>p.id);
    state.open.newPoints=false;
    const root=whatsNewSummary(data.topic,view,data);
    assert.equal(nodes(root,'cites').length,Math.min(count,3));
    const more=descendants(root).find(n=>n.tag==='button'&&n.textContent===`Show all ${count} points`);
    assert.equal(Boolean(more),count>3);
    if (more) {
      click(more);
      assert.equal(nodes(root,'cites').length,count);
      assert.equal(more.textContent,'Show fewer points');
      click(more);
      assert.equal(nodes(root,'cites').length,3);
    }
  }
});

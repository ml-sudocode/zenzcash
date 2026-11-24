import { append, h, link } from "./dom.js";
import { countLabel, greyReasons, maskMentions, orderedPosts, participantNumbers, POSTS_PER_LOAD, PULL_DAYS, shortDate, sinceCutoff, whatsNew } from "./logic.js";
import { renderPost, postElementId } from "./post.js";
import { selectionBar } from "./selection-controls.js";
import { readingControls } from "./reading-controls.js";
import { filterInfo } from "./filter-info.js";
import { cites, citationLegend } from "./citations.js";
import { orientation, questionCards, exploreArguments } from "./summary.js";
import { topicSaveButton } from './saved.js';
export const THREAD_TABS_ID = "thread-tabs";

function sinceRow(view) {
  const { since } = view.state.settings;
  return h("div", { class: "since-row", role: "group", "aria-label": "Days ending at the last forum pull" },
    PULL_DAYS.map(days => h("button", { id: `since-${days}`, class: "chip", "aria-pressed": String(since.days === days), on: { click: () => view.actions.setSettings({ since: { kind: "pull-days", days } }) } }, `${days} day${days === 1 ? "" : "s"}`)),
    filterInfo("pullWindow", "What’s new time window", "Look back 1, 3 or 7 days from the last forum pull (or the published snapshot when no pull time is recorded). A summary point’s date is the date of its first listed source post. Later replies about that point do not reset its date. Changing this window does not generate a new summary or change your selected posts.", view));
}

export function whatsNewSummary(topic, view, data) {
  const points = topic.points.filter(point => view.news.points.includes(point.id));
  const showAll = view.state.open.newPoints;
  const list = h("ul", { class: "new-points" });
  const toggle = h("button", { class: "linkish small", "aria-expanded": String(showAll), on: { click: () => {
    view.actions.setOpen("newPoints", null, !view.state.open.newPoints);
    refresh();
  } } });
  const refresh = () => {
    list.replaceChildren();
    append(list, (view.state.open.newPoints ? points : points.slice(0, 3)).map(point => h("li", {}, view.transform(point.text), " ", cites(point.cites, view))));
    toggle.textContent = view.state.open.newPoints ? "Show fewer points" : `Show all ${points.length} points`;
    toggle.setAttribute("aria-expanded", String(view.state.open.newPoints));
  };
  refresh();
  return h("section", { class: "whats-new card" },
    h("div", { class: "section-heading" }, h("h2", {}, "What's new"), sinceRow(view)),
    points.length ? list : h("p", { class: "small muted" }, "No new summary points in this window."),
    points.length > 3 ? toggle : null,
    h("p", { class: "small muted" }, `${countLabel(view.news.posts.size, "new post")} · ${view.state.settings.since.days} days through ${shortDate(view.pulledAt)}. Based on forum timestamps, not your last visit.`),
    h('p', { class: 'small muted newness-explanation' }, 'Shows existing summary points whose first cited post falls in this window. Later replies count as new posts but do not make an older point new. This is not a separate summary of every recent reply.'),
    data.grouped_sources ? h("details", { class: "small muted" }, h("summary", {}, "Source refresh times"), h("p", {}, "The window ends at the earliest included pull."), h("ul", {}, data.grouped_sources.map(({thread,pulled_at}) => h("li", {}, `${thread}: ${shortDate(pulled_at)}`)))) : null,
    data.analysis_pending ? h("p", { class: "notice small" }, `Newer forum data is awaiting analysis. This summary covers the checked snapshot from ${shortDate(data.snapshot_at)}.`) : null);
}

let loadWatcher = null;
export function disposePostStream() { if (loadWatcher) { loadWatcher.disconnect(); loadWatcher = null; } }
function postStream(topic, view) {
  const stream = view.state.settings.threadView === "all" ? "all" : view.state.thread;
  const posts = orderedPosts(topic, view.state.settings, view.state.thread);
  const readable = posts.filter(post => !post.hidden && (view.state.data.visibility_pending || view.state.shownFiltered.has(post.key) || greyReasons(post, view.state.settings, view.snapshotAt).length === 0));
  const list = h("div", { class: "forum-posts" });
  const more = h("button", { class: "load-more zf" });
  const status = h("span", { class: "post-navigation-status small muted", "aria-live": "polite" });
  const move = direction => {
    const edge = Math.max(navigation.getBoundingClientRect().bottom, parseFloat(getComputedStyle(list.firstElementChild).scrollMarginTop));
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    // The final short post cannot align below the sticky bar at the page end.
    const current = atBottom ? readable.findLastIndex(post => document.getElementById(postElementId(post.key)) !== null) : readable.findIndex(post => {
      const element = document.getElementById(postElementId(post.key));
      return element !== null && element.getBoundingClientRect().bottom > edge + 1;
    });
    const target = current === -1 ? null : readable[current + direction];
    if (target) view.actions.goToPost(target.key);
    else status.textContent = direction === -1 ? 'You’re at the first post.' : 'You’re at the last post.';
  };
  const navigation = h("nav", { class: "post-navigation", "aria-label": "Move through posts" },
    h("button", { class: "linkish small", 'aria-label': 'Back to summary', on: { click: () => document.querySelector('.topic-head').scrollIntoView({block:'start',behavior:'instant'}) } }, "Summary ↑"),
    status,
    h('div', { class: 'post-step-buttons' },
      h('button', { class: 'chip previous-post', 'aria-label': 'Previous post', disabled: readable.length < 2, on: { click: () => move(-1) } }, '↑ Previous', h('span', { class: 'post-word' }, ' post')),
      h('button', { class: 'chip next-post', 'aria-label': 'Next post', disabled: readable.length < 2, on: { click: () => move(1) } }, 'Next', h('span', { class: 'post-word' }, ' post'), ' ↓')));
  let rendered = 0;
  const fill = () => {
    const target = Math.min(view.state.shown.get(stream) ?? POSTS_PER_LOAD, posts.length);
    append(list, posts.slice(rendered, target).map(post => renderPost(post, view)));
    rendered = target; more.hidden = rendered === posts.length;
    more.textContent = `Show ${Math.min(POSTS_PER_LOAD, posts.length - rendered)} more posts (${posts.length - rendered} left)`;
  };
  disposePostStream();
  loadWatcher = new IntersectionObserver(entries => { if (more.isConnected && entries.some(entry => entry.isIntersecting) && !more.hidden) more.click(); }, { rootMargin: "0px 0px 800px 0px" });
  more.addEventListener("click", () => { view.actions.showMore(stream); fill(); loadWatcher.unobserve(more); loadWatcher.observe(more); });
  fill(); loadWatcher.observe(more);
  return h("div", { class: "forum" }, navigation, list, more);
}
function discussion(topic, view) {
  const originals = view.state.data.visibility_pending === true;
  return h("section", { class: "discussion", id: "discussion" },
    h("div", { class: "section-heading", id: THREAD_TABS_ID }, h("h2", {}, "Posts"),
      originals ? null : h("div", { class: "button-group bulk-controls", role: "group", "aria-label": "Expand or collapse posts" },
        h("button", { class: "linkish small", id: "collapse-all", on: { click: () => view.actions.collapseAll() } }, "Collapse all"),
        h("button", { class: "linkish small", id: "expand-all", on: { click: () => view.actions.expandAll() } }, "Expand all"))),
    originals ? null : selectionBar(view), postStream(topic, view));
}
export function renderTopic(data, state, actions) {
  const topic = data.topic;
  const allPosts = topic.threads.flatMap(thread => thread.posts);
  const numbers = participantNumbers(topic);
  const pulledAt = data.last_pulled_at ?? data.snapshot_at;
  const cutoff = sinceCutoff(state.settings.since, pulledAt);
  const view = { state, actions, allPosts, numbers, snapshotAt: data.snapshot_at, forumOrigin: data.forum_origin,
    posts: new Map(allPosts.map(post => [post.key, post])), threadOf: new Map(topic.threads.flatMap(thread => thread.posts.map(post => [post.key, thread]))),
    letterOf: new Map(topic.threads.map((thread, index) => [thread.id, String.fromCharCode(65 + index)])),
    transform: state.settings.anonymous ? text => maskMentions(text, numbers) : text => text, cutoff, pulledAt, news: whatsNew(topic, cutoff, pulledAt) };
  const heading = h("header", { class: "topic-head" }, h("p", { class: "back" }, h("a", { href: "#/topics" }, "← Topics")),
    h('div', { class: 'topic-title-row' }, h("h1", {}, topic.headline), topicSaveButton(topic, state, actions)));
  const sources = h("details", { class: "topic-sources small muted" }, h("summary", {}, `Source threads (${topic.threads.length})`),
    h("ul", { class: "included-threads" }, topic.threads.map(thread => h("li", {},
      h('button', { class: 'linkish', on: { click: () => actions.setThread(thread.id) } }, `${view.letterOf.get(thread.id)} · ${thread.title} (${countLabel(thread.posts.length, 'post')})`),
      " · ", link(thread.url, "On the forum ↗")))));
  if (data.visibility_pending) return h("div", { class: "topic originals-only" }, heading,
    h("p", { class: "notice", role: "status" }, "Some forum posts are no longer public. The remaining originals are available below. AI summaries, re-writes and filters will return with the checked update."), sources, discussion(topic, view));
  const questions = questionCards(topic, view);
  return h("div", { class: "topic" }, heading,
    h("div", { class: "reading-layout" }, h("div", { class: "reading-content" },
      h("section", { class: "topic-summary card" }, h("h2", {}, "Topic summary"), orientation(topic, view),
        citationLegend(),
        h("div", { class: "summary-actions" }, exploreArguments(view, questions), h("button", { class: "linkish small", on: { click: () => actions.listenOverview() } }, "Listen to summary"),
          h("button", { class: "linkish small", on: { click: () => document.getElementById('discussion').scrollIntoView({block:'start',behavior:'instant'}) } }, "Read posts ↓")),
        questions),
      whatsNewSummary(topic, view, data),
      state.ratings.status === "error" ? h("p", { class: "notice" }, `Mind-change ratings unavailable: ${state.ratings.problem}`) : null,
      state.feedback.status === "error" ? h("p", { class: "notice" }, `Re-write feedback unavailable: ${state.feedback.problem}`) : null,
      state.reader.problem ? h("p", { class: "notice" }, state.reader.problem) : null,
      discussion(topic, view), sources), readingControls(view)),
    h("footer", { class: "provenance muted small" }, `AI summaries, re-writes and provisional ratings by ${data.models.join(", ")}. Check the original sources. Posts belong to their authors; this site is read-only.`));
}

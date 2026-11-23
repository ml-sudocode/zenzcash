// One post on the topic page, drawn like a Discourse post (D-48), with zforum's additions:
// the account-age badge (D-46), marks, the restatement and original as tabs (D-49),
// mind-change ratings (SPEC §6) and restatement feedback (SPEC §7). Each interactive part
// updates itself in place, so a click never redraws the page and keyboard focus stays put
// (D-51).

import { h, link, replaceContent, renderBlocks } from "./dom.js";
import { accountAgeLabel, formatAverage, greyReasons, noAnswers, pseudonym, ratingSummary, shortDate } from "./logic.js";
import { parseBlocks } from "./markdown.js";
import { FEEDBACK, REACTIONS, MOODS, RATINGS } from "./vocab.js";
import { postAssessment, highlightedNotes } from "./post-analysis.js";
import { wordDiff } from "./diff.js";
import { postRoute } from "./selection.js";
import { postBrief } from './analysis-state.js';
import { originalContent, quoteBlock } from './post-content.js';

export const postElementId = (key) => `post-${key.replace("/", "-")}`;

const isMasked = (post, view) => view.state.settings.anonymous && !view.state.revealed.has(post.key);
const forumPostLink = (post, view) => h("span", { class: "source-post-link" }, link(`${view.threadOf.get(post.key).url}/${post.number}`, "On the forum ↗"));

function authorHead(post, view, reveal) {
  const masked = isMasked(post, view);
  const thread = view.threadOf.get(post.key);
  const replyKey = post.reply_to === null ? null : `${view.threadOf.get(post.key).id}/${post.reply_to}`;
  let reply = null;
  if (replyKey !== null) {
    reply = view.posts.has(replyKey)
      ? [" · replying to ", h("button", { class: "linkish", on: { click: () => view.actions.openPost(replyKey) } }, `#${post.reply_to}`)]
      : ` · replying to #${post.reply_to} (deleted)`;
  }
  return h(
    "header",
    { class: "post-head" },
    view.state.settings.threadView === 'all' && view.state.data.topic.threads.length > 1
      ? h('p', { class: 'post-thread' }, `Thread ${view.letterOf.get(thread.id)} · ${thread.title}`) : null,
    h("span", { class: "author", title: masked ? null : accountAgeLabel(post.account, view.snapshotAt) }, masked ? pseudonym(view.numbers.get(post.author)) : post.author),
    masked
      ? h("button", { class: "linkish small reveal zf", on: { click: reveal } }, "Reveal author")
      : null,
    !masked && view.state.settings.anonymous ? h("button", { class: "linkish small reveal", on: { click: reveal } }, "Hide author") : null,
    h("span", { class: "post-meta" }, h("a", { href: postRoute(view.state.data.topic.id, post.key), title: thread.title }, `Post ${view.letterOf.get(thread.id)}#${post.number}`), reply, ` · ${shortDate(post.created_at)}`),
    view.state.settings.highlightNew && view.news.posts.has(post.key)
      ? h('span', { class: 'post-new' }, `New in selected ${view.state.settings.since.days}-day window`) : null,
    post.hidden ? null : forumPostLink(post, view),
  );
}

function displayFailure(post, view, error) {
  console.error(`Rendering post ${post.key} failed`, error);
  view.actions.setExpanded(post.key, false);
  return h("p", { class: "notice post-display-error", role: "alert" }, "This post could not be displayed.");
}

const VERSIONS = [
  { id: "neutral", tab: "Neutral re-write", label: "AI re-write · check against the original" },
  { id: "original", tab: "Original", label: "Original · as posted on the forum" },
  { id: "diff", tab: "Changes", label: "Changes from the original to the neutral re-write" },
];

function diffContent(post, view) {
  return [
    h("p", { class: "diff-legend zf small" }, h("del", {}, "Removed wording"), " · ", h("ins", {}, "Added wording"), ". Quoted replies are unchanged and shown separately below."),
    h("div", { class: "diff-text" }, wordDiff(post.own_text, post.analysis.neutral_rendition).map((run) => {
      const text = view.transform(run.text);
      if (run.kind === "equal") return text;
      return h(run.kind === "delete" ? "del" : "ins", { title: run.kind === "delete" ? "Removed" : "Added" }, text);
    })),
    post.segments.filter((segment) => segment.kind === "quote").map((segment) => quoteBlock(segment, view)),
  ];
}

// Only the version on show is rendered; switching renders the other one.
function versions(post, view) {
  if (post.analysis===null || post.analysis.neutral_rendition === null) {
    return h("div", { class: "version version-original solo" },
      h("p", { class: "version-label zf" }, post.analysis === null
        ? "Original · this dated post has not been analyzed"
        : "Original · no AI re-write available"),
      h("div", { class: "post-body" }, originalContent(post, view)));
  }
  const panel = h("div", { role: "tabpanel" });
  const tabs = VERSIONS.map((version) => h("button", { class: `version-tab version-tab-${version.id} zf`, role: "tab", on: { click: () => show(version.id) } }, version.tab));
  const show = (id) => {
    view.actions.setVersion(post.key, id);
    try { sync(); }
    catch (error) { replaceContent(panel, displayFailure(post, view, error)); }
  };
  const sync = () => {
    // A citation explicitly selects the original; otherwise the reader’s default applies.
    const chosen = view.state.versions.get(post.key) ?? view.state.settings.preferredVersion;
    const current = VERSIONS.find((version) => version.id === chosen);
    VERSIONS.forEach((version, index) => tabs[index].setAttribute("aria-selected", String(version === current)));
    panel.className = `version version-${current.id}`;
    replaceContent(panel, [
      h("p", { class: "version-label zf" }, current.label),
      h("div", { class: "post-body" }, current.id === "neutral" ? [renderBlocks(parseBlocks(post.analysis.neutral_rendition), view.transform), post.segments.filter((segment) => segment.kind === "quote").map((segment) => quoteBlock(segment, view))] : current.id === "diff" ? diffContent(post, view) : originalContent(post, view)),
    ]);
  };
  sync();
  return [h("div", { class: "version-tabs", role: "tablist", "aria-label": "Which text to show" }, tabs), panel];
}

function ratingsRow(post, view) {
  if (!view.state.settings.showRatings || view.state.ratings.status !== "ready") return null;
  if (view.state.account && !view.state.account.authenticated) return h("p", { class: "small" }, "Sign in to rate how this post moved you.");
  const mine = () => view.state.ratings.mine[post.key] ?? null;
  const summary = h("span", { class: "ratings-summary muted small" });
  const buttons = RATINGS.map((rating) => h(
    "button",
    { class: `rating rating-${rating.id}`, title: rating.meaning, on: { click: async () => {
      await view.actions.rate(post.key, mine() === rating.id ? null : rating.id);
      sync();
    } } },
    rating.label,
  ));
  const sync = () => {
    RATINGS.forEach((rating, index) => buttons[index].setAttribute("aria-pressed", String(mine() === rating.id)));
    const result = ratingSummary(view.state.ratings.posts[post.key] ?? {});
    replaceContent(summary, result.total === 0
      ? "No ratings yet."
      : [result.levels.filter((level) => level.count > 0).map((level) => `${level.count} ${level.label.toLowerCase()}`).join(" · "), ` · average ${formatAverage(result.average)} (from −1 to +2)`]);
  };
  sync();
  return h("div", { class: "ratings" }, h("span", { class: "ratings-q" }, "How did this post move you?"), h("span", { class: "rating-buttons", role: "group", "aria-label": "Your rating" }, buttons), summary);
}

function reactionGroup(label, options, read, save) {
  const buttons = options.map(({ score, label: text, meaning }) => h("button", { class: "chip reaction", title: meaning, "aria-label": `${label}: ${meaning}`, on: { click: async () => {
    buttons.forEach((button) => { button.disabled = true; });
    try { await save(read() === score ? null : score); }
    finally { sync(); buttons.forEach((button) => { button.disabled = false; }); }
  } } }, h("span", {}, text)));
  const sync = () => options.forEach(({ score }, index) => buttons[index].setAttribute("aria-pressed", String(read() === score)));
  sync();
  return h("span", { class: "reaction-group", role: "group", "aria-label": label }, buttons);
}
function moodRow(post, view) {
  return h("div", { class: "mood-row" }, h("span", { class: "small" }, "How did this post make you feel?"),
    reactionGroup("Mood", MOODS, () => view.state.account?.personal?.moods[post.key] ?? null, (score) => view.state.account?.personal ? view.actions.setMood(post.key, score) : view.actions.openAccount("save your mood reaction")));
}
function feedbackBox(post, view) {
  if (post.analysis===null || post.analysis.neutral_rendition === null || view.state.feedback.status !== "ready") return null;
  return h("div", { class: "feedback" }, h("p", { class: "feedback-title" }, "About the AI re-write"),
    FEEDBACK.map((item) => h("div", { class: "feedback-item" }, h("p", {}, h("strong", {}, `${item.label}: `), item.question),
      reactionGroup(item.label, REACTIONS, () => (view.state.feedback.mine[post.key] ?? noAnswers())[item.id], (score) => view.actions.giveFeedback(post.key, { [item.id]: score })))));
}

export function renderPost(post, view) {
  try { return postArticle(post, view); }
  catch (error) { return h("article", { class: "post", id: postElementId(post.key) }, displayFailure(post, view, error)); }
}

function postArticle(post, view) {
  let head = null;
  const reveal = () => {
    view.actions.reveal(post.key);
    const revealed = authorHead(post, view, reveal);
    head.replaceWith(revealed);
    head = revealed;
  };
  head = authorHead(post, view, reveal);
  const id = postElementId(post.key);
  if (post.hidden) return h("article", { class: "post hidden-post", id, tabindex: -1 }, h("div", { class: "post-main" }, head, h("p", { class: "muted" }, "Hidden by the forum community.")));
  if(view.state.data.visibility_pending)return h("article",{class:"post original-pending",id,tabindex:-1},h("div",{class:"post-main"},head,h("div",{class:"post-body"},originalContent(post,view))));
  const reasons = greyReasons(post, view.state.settings, view.snapshotAt);
  const filtered = reasons.length > 0 && !view.state.shownFiltered.has(post.key);
  if (filtered) return h("article", { class: "post compact-post", id, tabindex: -1 },
    h("span", { class: "compact-summary" }, `${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number} · ${view.transform(postBrief(post))}`),
    h("span", { class: "small muted" }, reasons.join(" · ")),
    forumPostLink(post, view),
    h("button", { class: "chip", on: { click: () => view.actions.showFiltered(post.key) } }, "Show"));
  const content = h("div", { class: filtered ? "post-content greyed" : "post-content" });
  const brief = h("p", { class: `post-brief${post.analysis === null ? ' dated-analysis' : ''}` }, view.transform(postBrief(post)));
  const expansion = h("button", { class: "post-toggle chip zf", "aria-controls": `${id}-content`, on: { click: () => {
    syncContent(view.state.collapsed.has(post.key));
  } } });
  content.id = `${id}-content`;
  let rendered = false;
  const syncContent = (expanded = !view.state.collapsed.has(post.key)) => {
    if (expanded && !rendered) {
      try {
        replaceContent(content, versions(post, view));
        rendered = true;
      } catch (error) {
        replaceContent(content, displayFailure(post, view, error));
        content.hidden = false;
        expansion.textContent = "Retry expanding post";
        expansion.setAttribute("aria-expanded", "false");
        return;
      }
    }
    view.actions.setExpanded(post.key, expanded);
    content.hidden = !expanded;
    brief.hidden = expanded;
    expansion.textContent = expanded ? "Collapse" : "Read full post";
    expansion.title = expansion.textContent;
    expansion.setAttribute("aria-expanded", String(expanded));
  };
  syncContent();
  const selection = view.state.selecting ? h("label", { class: "post-selection zf" },
    h("input", { type: "checkbox", checked: view.state.selected.has(post.key), on: { change: (event) => {
      view.actions.selectPost(post.key, event.target.checked);
      view.syncSelection();
    } } }), `Select ${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number}`) : null;
  const classes = ["post", view.state.flash === post.key ? "flash" : null];
  const personal = view.state.account?.personal;
  const saved = personal?.reading[post.key] ?? { bookmarked: false, read: false };
  if (saved.read) classes.push("read-post");
  const tool = (label, text, action, active = null) => h("button", { class: "chip post-tool", title: label, "aria-label": label, "aria-pressed": active === null ? null : String(active), on: { click: action } }, text, h("span", { class: "hover-tip" }, label));
  const personalControls = [
    tool(personal ? (saved.read ? "Mark unread" : "Mark read") : "Mark read · sign-in required", saved.read ? "Mark unread" : "Mark read", () => personal ? view.actions.setReading(post.key, { read: !saved.read }) : view.actions.openAccount("save your read/unread choices"), saved.read),
    tool(personal ? (saved.bookmarked ? "Remove bookmark" : "Save post") : "Save post · sign-in required", h("span", { class: `bookmark-icon${saved.bookmarked ? " filled" : ""}`, "aria-hidden": "true" }), () => personal ? view.actions.setReading(post.key, { bookmarked: !saved.bookmarked }) : view.actions.openAccount("save posts"), saved.bookmarked),
    tool("Listen to this post", "Listen", () => view.actions.listenPost(post.key))];
  return h(
    "article",
    { class: classes.filter((name) => name !== null).join(" "), id, tabindex: -1 },
    h("div", { class: "post-main" },
      head,
      selection,
      brief,
      content,
      h("footer", { class: "post-actions zf", 'aria-label': `Actions for post ${view.letterOf.get(view.threadOf.get(post.key).id)}#${post.number}` },
        h("div", { class: "post-disclosure" }, personalControls, expansion),
        h("details", { class: "post-feedback" }, h("summary", {}, "Give feedback"),
          h("p", { class: "small muted" }, "Optional reactions to the post and feedback on its AI re-write."),
          ratingsRow(post, view), moodRow(post, view), feedbackBox(post, view)),
        highlightedNotes(post, view),
        postAssessment(post, view))),
  );
}

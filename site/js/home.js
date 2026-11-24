import { h } from "./dom.js";
import { shortDate, topicCountLabel } from "./logic.js";
import { INTERESTS } from "./vocab.js";
import { directoryInterests, topicDirectory } from "./topic-directory.js";
import { latestContentRefresh } from "./catalog.js";

function topicRow(data, curation) {
  const {stats} = data;
  return h("a", { class: "topic-card", id: `topic-card-${data.topic.id}`, href: `#/topic/${data.topic.id}` },
    h("h3", {}, data.topic.card.title),
    h("p", { class: "byline" }, data.topic.card.byline),
    h('footer', { class: 'topic-metadata' },
      h('p', { class: 'card-stats' }, topicCountLabel(stats)),
      h('p', { class: 'card-stats' }, `Latest post: ${shortDate(stats.lastPostAt)}`),
      h('p', { class: 'card-stats topic-account-stats' },
        stats.medianYears === null ? 'Account ages unknown' : `Median ${stats.medianYears.toFixed(1)} years on the forum`,
        ` · ${stats.joinedRecently} joined in the last 90 days`,
        stats.unknownAge > 0 ? ` · ${stats.unknownAge} hide their profile` : null),
      h('p', { class: 'tags' }, directoryInterests(data, curation).map(id=>INTERESTS.find(interest=>interest.id===id).label).join(' · ')),
      h('p', { class: 'keywords' }, data.topic.card.keywords.join(' · '))));
}

export function renderTopics(catalog, settings, actions, curation, directory) {
  const wanted = settings.interests;
  const results = topicDirectory(catalog, curation, wanted, directory);
  const refreshedAt = latestContentRefresh(catalog);
  const cards = (topics) => h("div", { class: "board" }, topics.map(data=>topicRow(data, curation)));
  const toggle = (id) => actions.setSettings({ interests: wanted.includes(id) ? wanted.filter((other) => other !== id) : [...wanted, id] });
  return h("div", { class: "home topic-directory" },
    h("header", { class: "hero" }, h("h1", {}, "Topics")),
    h("div", { class: "directory-layout" },
      h("div", { class: "directory-content" },
        catalog.unavailable.length ? h("p", { class: "notice" }, `${catalog.unavailable.length} topic(s) temporarily unavailable while forum visibility changes are reviewed.`) : null,
        results.featured.length ? h("section", { class: "featured-topics" }, h("h2", {}, "Featured"), cards(results.featured)) : null,
        results.others.length ? h("section", {}, h("h2", {}, results.featured.length ? "More discussions" : "Discussions"), cards(results.others)) : null,
        results.count === 0 ? h("p", {}, "No topics match. Try another search or clear your filters.") : null),
      h("aside", { class: "directory-tools controls-region", "aria-label": "Find and sort topics" },
        h("h2", {}, "Find a topic"),
        h("div", { class: "directory-controls" },
          h("label", {}, "Search titles", h("input", { id: "topic-search", type: "search", value: directory.query, "aria-label": "Search topic titles", on: { input: (event) => actions.setDirectory({ query: event.target.value }) } })),
          h("label", {}, "Sort", h("select", { id: "topic-sort", on: { change: (event) => actions.setDirectory({ sort: event.target.value }) } },
            [["recent", "Most recent post"], ["posts", "Most posts"]].map(([id, label]) => h("option", { value: id, selected: directory.sort === id }, label))))),
        h("div", { class: "filters", role: "group", "aria-label": "Show topics about" },
          h("span", { class: "filters-label" }, "Interests"),
          h("button", { class: "chip", "aria-pressed": String(wanted.length === 0), on: { click: () => actions.setSettings({ interests: [] }) } }, "Everything"),
          INTERESTS.map((interest) => h("button", { class: "chip", "aria-pressed": String(wanted.includes(interest.id)), on: { click: () => toggle(interest.id) } }, interest.label))),
        h("p", { class: "directory-count small muted", "aria-live": "polite" }, `${results.count} topics match`),
        wanted.length || directory.query ? h("button", { class: "linkish small", on: { click: () => { actions.setDirectory({ query: "" }); actions.setSettings({ interests: [] }); } } }, "Clear search and filters") : null,
        refreshedAt === null ? null : h("p", { class: "content-refresh small muted" }, `Latest forum content refresh: ${shortDate(refreshedAt)}`))));
}

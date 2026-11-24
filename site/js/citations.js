import { h } from "./dom.js";
import { toneBand } from "./rubric.js";
import { postBrief } from './analysis-state.js';
import { postRoute } from './selection.js';
import { showCitationPreview } from './citation-preview.js';
import { postTone } from './logic.js';
import { TONE_BANDS, toneCategory } from './reader-options.js';

const toneName = score => score === null ? 'Unassessed' : TONE_BANDS.find(band => band.id === toneCategory(score)).label;

export function citationLegend() {
  return h('aside', { class: 'citation-legend small', 'aria-label': 'Citation color legend' },
    h('p', {}, 'Source tags show AI-rated tone of the original post:'),
    h('ul', {}, [[3, 'Green', 'restrained (3)'], [2, 'Yellow', 'pointed (2)'], [0, 'Red', 'adversarial or attacking (0–1)'], [null, 'Gray', null]].map(([score, color, description]) =>
      h('li', { class: `cite band-${toneBand(score)}` }, `${color} · ${toneName(score)}${description === null ? '' : ` — ${description}`}`))),
    h('p', { class: 'muted' }, 'Tone is not truth, argument quality or agreement. Click a source tag to read the original.'));
}

export function cites(keys, view) {
  return h("span", { class: "cites" }, keys.map((key) => {
    const post = view.posts.get(key);
    const thread = view.threadOf.get(key);
    const score = postTone(post);
    return h("a", {
      href: postRoute(view.state.data.topic.id, key),
      class: `cite band-${toneBand(score)}`,
      title: `Thread ${view.letterOf.get(thread.id)}: ${thread.title} · #${post.number} · tone ${toneName(score)}${score === null ? '' : ` (${score}/3)`} (not argument quality)\n${view.transform(postBrief(post))}`,
      on: { click: (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        showCitationPreview(key, view, event.currentTarget);
      } },
    }, `${view.letterOf.get(thread.id)}#${post.number}`);
  }));
}

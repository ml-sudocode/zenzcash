import { h } from "./dom.js";
import { toneBand } from "./rubric.js";
import { postBrief } from './analysis-state.js';
import { postRoute } from './selection.js';
import { showCitationPreview } from './citation-preview.js';

export function cites(keys, view) {
  return h("span", { class: "cites" }, keys.map((key) => {
    const post = view.posts.get(key);
    const thread = view.threadOf.get(key);
    const score = post.analysis===null?null:post.analysis.dimensions.tone.score;
    return h("a", {
      href: postRoute(view.state.data.topic.id, key),
      class: `cite band-${toneBand(score)}`,
      title: `Thread ${view.letterOf.get(thread.id)}: ${thread.title} · #${post.number} · tone ${score === null ? "unassessed" : `${score}/3`} (not argument quality)\n${view.transform(postBrief(post))}`,
      on: { click: (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        showCitationPreview(key, view, event.currentTarget);
      } },
    }, `${view.letterOf.get(thread.id)}#${post.number}`);
  }));
}

import { h } from "./dom.js";
import { greyReasons, countLabel } from "./logic.js";
import { TONE_BANDS, SUPPORT_BANDS, POST_VERSIONS, READING_VERSIONS, ids, toggleChoice } from "./reader-options.js";
import { filterInfo } from "./filter-info.js";

export function readingControls(view) {
  const { settings } = view.state;
  const set = (patch) => view.actions.setSettings(patch);
  const info = (key, label, text) => filterInfo(key, label, text, view);
  const heading = (label, key, explanation) => h('div', { class: 'control-heading' }, h('label', { for: `setting-${key}` }, label), info(key, label, explanation));
  const visible = view.allPosts.filter((post) => !post.hidden);
  const matching = visible.filter((post) => greyReasons(post, settings, view.snapshotAt).length === 0).length;
  const choices = (label, key, options, explanation) => {
    // Stored empty lists mean unrestricted, so the UI shows every category included.
    const included = settings[key].length ? settings[key] : ids(options);
    return h("fieldset", { class: 'filter-choices' }, h("legend", {}, h('span', { class: 'control-heading' }, h('span', {}, label), info(key, label, explanation))),
    h('div', { class: 'filter-options' },
    options.map(({ id, label: text }) => h("label", { class: "toggle" }, h("input", { id: `setting-${key}-${id}`, type: "checkbox", checked: included.includes(id), on: { change: () => set({ [key]: toggleChoice(included, id) }) } }), text))));
  };
  const toggle = (label, key, explanation) => h("div", { class: "filter-toggle" }, h("label", { class: "toggle" }, h("input", { id: `setting-${key}`, type: "checkbox", checked: settings[key], on: { change: (event) => set({ [key]: event.target.checked }) } }), label), info(key, label, explanation));
  const ageChanged = (event) => {
    const months = Number(event.target.value);
    const valid = event.target.value !== "" && Number.isInteger(months) && months >= 0 && months <= 1200;
    event.target.setCustomValidity(valid ? "" : "Use whole months from 0 to 1200.");
    if (valid) set({ minAccountMonths: months }); else event.target.reportValidity();
  };
  return h("aside", { class: "settings-panel controls-region", "aria-label": "Reading controls" },
    h("h2", {}, "Reading controls"),
    h("div", { class: "reading-choice" }, heading("Post order", "postOrder", "Order posts by their original forum timestamps. Newest first is the default; Oldest first follows the conversation forward."),
      h("select", { id: "setting-postOrder", on: { change: event => set({ postOrder: event.target.value }) } },
        [["newest", "Newest first"], ["oldest", "Oldest first"]].map(([value, label]) => h("option", { value, selected: settings.postOrder === value }, label)))),
    h("div", { class: "reading-choice" }, heading("Threads", "threadView", "Read all included threads together, or choose one thread. Your selected posts remain available when changing this view."),
      h("select", { id: "setting-threadView", on: { change: event => event.target.value === "all" ? set({ threadView: "all" }) : view.actions.setThread(Number(event.target.value)) } },
        h("option", { value: "all", selected: settings.threadView === "all" }, "All threads together"),
        view.state.data.topic.threads.map(thread => h("option", { value: thread.id, selected: settings.threadView === "thread" && view.state.thread === thread.id }, `${view.letterOf.get(thread.id)} · ${thread.title} (${countLabel(thread.posts.length, 'post')})`)))),
    h("p", { class: "match-count small muted", "aria-live": "polite" }, matching === visible.length ? `All ${countLabel(visible.length, 'post')} included.` : `${matching} of ${visible.length} posts included. Other posts appear as compact rows.`),
    h('p', { class: 'filter-hint small muted' }, 'All checked = no filter. Uncheck to exclude.'),
    choices("Tone", "toneBands", TONE_BANDS, "Checked tone levels are included. All are checked by default. Clearing the last choice resets this group to all. Bad is adversarial or attacking; Moderate is pointed; Good is restrained. These names match the source-tag legend. A material harsh passage can lower the rating. This describes the original wording, not whether its ideas are right. Unassessed posts remain included."),
    choices("Argument support", "supportBands", SUPPORT_BANDS, "Checked support levels are included. Low, Medium and High describe how much reasoning or evidence the author supplies. This is not a fact-check. Posts without an applicable rating remain included. Clearing the last choice resets this group to all."),
    h("fieldset", { class: "account-age-filter" }, h("legend", {}, h('span', { class: 'control-heading' }, h('span', {}, "Author’s account age"), info("accountAge", "account age", "Set a minimum age in whole calendar months, measured at the displayed content snapshot. Zero includes any known age. Profiles with hidden or unavailable ages are included by default; uncheck Include profiles with hidden age to exclude them. Excluded posts become compact rows with a Show button."))),
      toggle("Include profiles with hidden age", "includeHiddenAge", "Include accounts whose profile age is hidden or unavailable. When unchecked, these accounts are excluded even at Any account age. Other selected filters still apply."),
      h("label", { for: "setting-minAccountMonths" }, settings.minAccountMonths === 0 ? "Any account age" : `At least ${settings.minAccountMonths} months`),
      h("input", { id: "setting-minAccountMonths", type: "range", min: 0, max: Math.max(120, settings.minAccountMonths), step: 1, value: settings.minAccountMonths, on: { input: (event) => { event.target.previousElementSibling.textContent = Number(event.target.value) === 0 ? "Any account age" : `At least ${event.target.value} months`; }, change: ageChanged } }),
      h("label", { class: "small" }, "Exact months ", h("input", { id: "setting-age-months", type: "number", min: 0, max: 1200, step: 1, value: settings.minAccountMonths, "aria-label": "Minimum account age in months", on: { change: ageChanged } }))),
    choices("Posts", "postVersions", POST_VERSIONS, "Checked post types are included. Both types are checked by default. Clearing the last choice resets this group to both. A re-write is offered when the analysis identifies wording worth neutralizing. It is not a measure of the post’s value."),
    h("div", { class: "reading-choice" }, heading("Default post text", "preferredVersion", "Choose which text to read by default. You can still switch between Original, Re-write and Changes on each post. Posts without a re-write show the original."), h("select", { id: "setting-preferredVersion", on: { change: (event) => set({ preferredVersion: event.target.value }) } }, READING_VERSIONS.map(({ id, label }) => h("option", { value: id, selected: settings.preferredVersion === id }, label)))),
    toggle("Hide author names", "anonymous", "Replaces names and mentions with participant numbers to help you focus on ideas. Reveal or hide each post’s author individually. Source links and exports retain attribution."));
}

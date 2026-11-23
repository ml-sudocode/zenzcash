import { h, link } from './dom.js';
import { originalContent } from './post-content.js';
import { pseudonym, shortDate } from './logic.js';
import { postRoute } from './selection.js';

let active = null;
export function closeCitationPreview() {
  if (active !== null) { const preview = active; preview.dialog.close(); preview.finish(); }
}

export function showCitationPreview(key, view, trigger) {
  closeCitationPreview();
  const post = view.posts.get(key);
  const thread = view.threadOf.get(key);
  const label = `${view.letterOf.get(thread.id)}#${post.number}`;
  const author = view.state.settings.anonymous ? pseudonym(view.numbers.get(post.author)) : post.author;
  const dialog = h('dialog', { class: 'citation-preview', 'aria-labelledby': 'citation-title' },
    h('header', { class: 'citation-header' },
      h('h2', { id: 'citation-title' }, `Original post ${label}`),
      h('button', { class: 'chip', 'aria-label': 'Close citation preview', on: { click: closeCitationPreview } }, 'Close ✕')),
    h('p', { class: 'small muted' }, `${author} · ${shortDate(post.created_at)}`),
    h('div', { class: 'citation-body post-body' }, post.hidden ? 'This post is no longer public.' : originalContent(post, view)),
    h('footer', { class: 'citation-actions' },
      h('button', { class: 'chip', on: { click: () => { closeCitationPreview(); view.actions.openPost(key); } } }, 'Read in discussion'),
      h('a', { href: postRoute(view.state.data.topic.id, key), target: '_blank', rel: 'noopener' }, 'Open in new tab'),
      post.hidden ? null : link(`${thread.url}/${post.number}`, 'Original forum post ↗')));
  const previousOverflow = document.body.style.overflow;
  const finish = () => {
    if (active?.dialog !== dialog) return;
    document.body.style.overflow = previousOverflow;
    active = null;
    dialog.remove();
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  dialog.addEventListener('close', finish, { once: true });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeCitationPreview();
  });
  document.body.append(dialog);
  active = { dialog, finish };
  document.body.style.overflow = 'hidden';
  dialog.showModal();
}

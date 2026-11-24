import { h } from './dom.js';
import { postRoute } from './selection.js';

export function topicSaveButton(topic, state, actions) {
  const saved = state.account.personal?.saved_topics.includes(topic.id) ?? false;
  return h('button', { class: 'chip save-topic', 'aria-pressed': String(saved),
    'aria-label': state.account.authenticated ? (saved ? 'Remove saved topic' : 'Save topic') : 'Save topic · sign-in required',
    on: { click: () => state.account.authenticated ? actions.saveTopic(topic.id, !saved) : actions.openAccount('save topics') },
  }, saved ? '✓ Topic saved' : 'Save topic');
}

export function savedItems(state, actions) {
  if (!state.account.personal) return null;
  const selected = Object.entries(state.account.personal.reading).filter(([,entry]) => entry.bookmarked);
  const topics = state.account.personal.saved_topics;
  return h('div', { class: 'saved-page' }, h('h1', {}, 'Saved'),
    h('section', { class: 'saved-topics card', 'aria-labelledby': 'saved-topics-heading' },
      h('h2', { id: 'saved-topics-heading' }, `Saved topics (${topics.length})`),
      topics.length ? h('ul', {}, topics.map(id => {
        const data = state.catalog.topics.find(data => data.topic.id === id);
        return h('li', {}, data ? h('a', { href: `#/topic/${id}` }, data.topic.card.title) : `${id} · unavailable`,
          h('button', { class: 'chip', on: { click: () => actions.saveTopic(id, false) } }, 'Remove saved topic'));
      })) : h('p', {}, 'Use Save topic at the top of a discussion to keep it here.')),
    h('section', { class: 'saved-posts card', 'aria-labelledby': 'saved-posts-heading' },
      h('h2', { id: 'saved-posts-heading' }, `Saved posts (${selected.length})`),
      selected.length ? h('ul', {}, selected.map(([key]) => {
        const data = state.catalog.topics.find(data => data.topic.threads.some(thread => String(thread.id) === key.split('/')[0]));
        return h('li', {}, data ? h('a', { href: postRoute(data.topic.id, key) }, `${key} · ${data.topic.card.title}`) : `${key} · unavailable`,
          h('button', { class: 'chip', on: { click: () => actions.setReading(key, { bookmarked: false }) } }, 'Remove bookmark'));
      })) : h('p', {}, 'Use Save post on any available post.'),
      state.readingHistory.bookmarksNext !== null ? h('button', { class: 'chip', on: { click: actions.loadSavedPosts } }, 'Load more saved posts') : null));
}

import { h, renderBlocks } from './dom.js';
import { parseBlocks } from './markdown.js';
import { pseudonym } from './logic.js';

export function quoteBlock(segment, view) {
  const source = segment.source;
  let who = 'Someone';
  if (source !== null) {
    const number = view.numbers.get(source.username);
    who = !view.state.settings.anonymous ? source.username : number === undefined ? 'another forum member' : pseudonym(number);
  }
  const where = source !== null && source.post !== null ? ` (#${source.post}${view.threadOf.has(`${source.topic}/${source.post}`) ? '' : `, t/${source.topic}`})` : '';
  return h('blockquote', { class: 'forum-quote' }, h('p', { class: 'quote-by' }, `${who} wrote${where}:`), renderBlocks(parseBlocks(segment.text), view.transform));
}

export const originalContent = (post, view) => post.segments.map(segment => segment.kind === 'text'
  ? renderBlocks(parseBlocks(segment.text), view.transform) : quoteBlock(segment, view));

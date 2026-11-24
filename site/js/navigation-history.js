import { migrateSettings } from './logic.js';

const KEY = 'zforum.navigation.v1';
const sets = ['revealed','shownFiltered','collapsed','selected'];
const openSets = ['infos','marks','questions','arguments'];
const openFlags = ['summary','expert','newPoints','flags'];
const keysEqual = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const details = value => Array.isArray(value) && value.every(item => keysEqual(item,['label','open']) && typeof item.label === 'string' && typeof item.open === 'boolean');

export function captureReader(state) {
  return {
    thread: state.thread, shown: [...state.shown], versions: [...state.versions], selecting: state.selecting,
    savedPages: state.readingHistory?.bookmarkPages ?? 0,
    ...Object.fromEntries(sets.map(key => [key,[...state[key]]])),
    open: { ...Object.fromEntries(openFlags.map(key => [key,state.open[key]])), ...Object.fromEntries(openSets.map(key => [key,[...state.open[key]]])) },
  };
}
export function restoreReader(state, reader) {
  state.thread = reader.thread;
  state.shown = new Map(reader.shown);
  state.versions = new Map(reader.versions);
  state.selecting = reader.selecting;
  for (const key of sets) state[key] = new Set(reader[key]);
  state.open = { ...Object.fromEntries(openFlags.map(key => [key,reader.open[key]])), ...Object.fromEntries(openSets.map(key => [key,new Set(reader.open[key])])) };
  state.flash = null;
}

export function parseNavigationView(view) {
  const fail = () => { throw new Error('Invalid saved navigation state'); };
  if (!keysEqual(view,['hash','release','visibilityPending','position','settings','directory','reader']) || typeof view.hash !== 'string' || !(view.hash === '' || view.hash.startsWith('#/')) || !(view.release === null || typeof view.release === 'string') || typeof view.visibilityPending !== 'boolean') fail();
  view.settings = migrateSettings(view.settings);
  if (!keysEqual(view.directory,['query','sort']) || typeof view.directory.query !== 'string' || !['recent','posts'].includes(view.directory.sort)) fail();
  const p = view.position;
  if (!keysEqual(p,['x','y','panelScroll','focusedPost','focusedId','details','posts']) || ![p.x,p.y].every(Number.isFinite) || !(p.panelScroll === null || Number.isFinite(p.panelScroll)) || ![p.focusedPost,p.focusedId].every(id => id === null || typeof id === 'string') || !details(p.details) || !Array.isArray(p.posts) || !p.posts.every(post => keysEqual(post,['id','details']) && typeof post.id === 'string' && details(post.details))) fail();
  const r = view.reader;
  const pairList = (value, valid) => Array.isArray(value) && value.every(pair => Array.isArray(pair) && pair.length === 2 && valid(...pair));
  if (!keysEqual(r,['thread','shown','versions','selecting','savedPages','open',...sets]) || !Number.isSafeInteger(r.savedPages) || r.savedPages < 0 || !(r.thread === null || Number.isSafeInteger(r.thread) && r.thread > 0) || typeof r.selecting !== 'boolean' || !sets.every(key => strings(r[key])) || !pairList(r.shown,(key,count) => (key === 'all' || Number.isSafeInteger(key) && key > 0) && Number.isSafeInteger(count) && count >= 0) || !pairList(r.versions,(key,version) => typeof key === 'string' && ['neutral','original','diff'].includes(version))) fail();
  if (!keysEqual(r.open,[...openFlags,...openSets]) || !openFlags.every(key => typeof r.open[key] === 'boolean') || !openSets.every(key => strings(r.open[key]))) fail();
  return view;
}

// History entries, rather than URLs, own positions: visiting one topic twice
// must not overwrite the position of its earlier occurrence in the Back stack.
export class NavigationHistory {
  constructor(history, storage, report, id = () => crypto.randomUUID()) {
    this.history = history;
    this.storage = storage;
    this.report = report;
    this.id = id;
    this.entries = new Map();
    this.current = null;
    this.currentHash = null;
    try {
      const text = storage.getItem(KEY);
      if (text !== null) {
        const entries = JSON.parse(text);
        if (!Array.isArray(entries) || !entries.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') || new Set(entries.map(entry => entry[0])).size !== entries.length) throw new Error('Invalid navigation history');
        this.entries = new Map(entries.map(([id,view]) => [id,parseNavigationView(view)]));
      }
    } catch (error) { report(`Reading history could not be restored: ${error.message}`); }
  }
  remember(view) {
    if (this.current === null || this.currentHash !== view.hash) throw new Error(`Cannot save navigation state for ${view.hash} while at ${this.currentHash}`);
    this.entries.delete(this.current);
    this.entries.set(this.current,structuredClone(view));
    try { this.storage.setItem(KEY,JSON.stringify([...this.entries])); }
    catch (error) { this.report(`Reading positions will last for this page session only: ${error.message}`); }
  }
  enter(hash) {
    const entry = this.history.state?.zenzcash;
    this.current = entry?.version === 1 && entry.hash === hash && typeof entry.id === 'string' ? entry.id : this.id();
    this.currentHash = hash;
    this.history.replaceState({zenzcash:{version:1,id:this.current,hash}},'');
    const view = this.entries.get(this.current);
    return view?.hash === hash ? structuredClone(view) : null;
  }
  last(hash) {
    const view = [...this.entries.values()].findLast(view => view.hash === hash);
    return view ? structuredClone(view) : null;
  }
}

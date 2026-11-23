// Structural/event checks only; this DOM does not measure browser layout or accessibility.
export class RecordedNode extends EventTarget {
  constructor(tag = null, text = "") {
    super();
    this.tag = tag;
    this.text = text;
    this.children = [];
    this.attributes = new Map();
    this.open = false;
    this.hidden = false;
    this.isConnected = true;
    this.style = { overflow: '' };
    this.parentNode = null;
    this.classList = {
      contains: (name) => (this.attributes.get("class") ?? "").split(" ").includes(name),
      toggle: (name, enabled) => {
        const names = new Set((this.attributes.get("class") ?? "").split(" ").filter(Boolean));
        if (enabled) names.add(name); else names.delete(name);
        this.attributes.set("class", [...names].join(" "));
      },
    };
  }
  append(node) { this.children.push(node); node.parentNode = this; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.isConnected = false; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  replaceChildren() { this.text = ""; this.children = []; }
  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "open") this.open = true;
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  set textContent(value) { this.text = value; this.children = []; }
  get className() { return this.attributes.get("class"); }
  set className(value) { this.attributes.set("class", value); }
  get id() { return this.attributes.get("id"); }
  set id(value) { this.attributes.set("id", value); }
  querySelector(tag) { return descendants(this).find((node) => node.tag === tag) ?? null; }
  focus(options) { document.activeElement = this; this.focusOptions = options; }
  scrollIntoView(options) { this.scrollOptions = options; }
}
export const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
export const nodes = (root, name) => descendants(root).filter((node) => node.classList.contains(name));
export const findId = (root, id) => descendants(root).find((node) => node.id === id);
export const click = (node, modifiers = {}) => {
  const event = new Event('click', {cancelable:true});
  Object.assign(event, {button:0, ctrlKey:false, metaKey:false, shiftKey:false, altKey:false, ...modifiers});
  node.dispatchEvent(event);
  return event;
};
export function installDom(t) {
  const before = new Map(["Node", "document", "IntersectionObserver"].map((key) => [key, globalThis[key]]));
  globalThis.Node = RecordedNode;
  globalThis.document = {
    activeElement: null,
    body: new RecordedNode('body'),
    createElement: (tag) => new RecordedNode(tag),
    createTextNode: (text) => new RecordedNode(null, text),
  };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  t.after(() => {
    for (const [key, value] of before) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  });
}

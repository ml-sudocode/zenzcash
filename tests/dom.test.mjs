import assert from "node:assert/strict";
import test from "node:test";
import { downloadText, h, link, updateAttribute } from "../site/js/dom.js";
import { RecordedNode, click, installDom } from "./recorded-dom.mjs";

test("h() sets allowlisted attributes, internal hrefs and listeners, and turns strings into text", (t) => {
  installDom(t);
  let clicks = 0;
  const node = h("a", { class: "chip", href: "#/topic/zcg", "aria-pressed": "true", disabled: true, start: 3, title: null, open: false, on: { click: () => { clicks += 1; } } },
    "<b>not markup</b>", ["<img src=x onerror=alert(1)>", null, false, ["nested"]]);
  assert.deepEqual([...node.attributes], [["class", "chip"], ["href", "#/topic/zcg"], ["aria-pressed", "true"], ["disabled", ""], ["start", "3"]]);
  assert.deepEqual(node.children.map((child) => [child.tag, child.text]), [[null, "<b>not markup</b>"], [null, "<img src=x onerror=alert(1)>"], [null, "nested"]]);
  click(node);
  assert.equal(clicks, 1);
});

test("h() rejects every attribute outside the allowlist, including case variants", (t) => {
  installDom(t);
  for (const name of ["onclick", "ONCLICK", "onerror", "style", "src", "srcdoc", "action", "formaction", "xlink:href", "HREF", "data-x"]) {
    assert.throws(() => h("div", { [name]: "x" }), { message: `h(): attribute ${JSON.stringify(name)} is not allowed` });
  }
});

test("h() and updateAttribute() accept only internal #/ hrefs", (t) => {
  installDom(t);
  for (const value of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "https://example.com/", "//example.com", "/t/1", "#top", "", " #/topics", 5]) {
    assert.throws(() => h("a", { href: value }), { message: `h(): internal href must start with "#/", got ${JSON.stringify(value)}` });
    assert.throws(() => updateAttribute(new RecordedNode("a"), "href", value), { message: `updateAttribute(): internal href must start with "#/", got ${JSON.stringify(value)}` });
  }
  const anchor = new RecordedNode("a");
  updateAttribute(anchor, "href", "#/topics");
  assert.deepEqual([...anchor.attributes], [["href", "#/topics"]]);
});

test("updateAttribute() changes allowlisted attributes and rejects other names and non-string values", () => {
  const node = new RecordedNode("button");
  updateAttribute(node, "aria-expanded", "true");
  updateAttribute(node, "data-theme", "dark");
  updateAttribute(node, "aria-expanded", "false");
  assert.deepEqual([...node.attributes], [["aria-expanded", "false"], ["data-theme", "dark"]]);
  for (const name of ["onclick", "style", "src", "HREF"]) {
    assert.throws(() => updateAttribute(node, name, "x"), { message: `updateAttribute(): attribute ${JSON.stringify(name)} is not allowed` });
  }
  for (const value of [true, 1, null, undefined]) {
    assert.throws(() => updateAttribute(node, "aria-pressed", value), { message: `updateAttribute(): "aria-pressed" value must be a string, got ${JSON.stringify(value)}` });
  }
  assert.deepEqual([...node.attributes], [["aria-expanded", "false"], ["data-theme", "dark"]]);
});

test("link() opens safe targets in a new tab without a referrer and renders unsafe targets as text", (t) => {
  installDom(t);
  const safe = link("/t/topic/58515", "On the forum");
  assert.equal(safe.tag, "a");
  assert.deepEqual([...safe.attributes], [["href", "https://forum.zcashcommunity.com/t/topic/58515"], ["rel", "noopener noreferrer nofollow"], ["target", "_blank"]]);
  assert.equal(safe.textContent, "On the forum");
  for (const target of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "//evil.example/x"]) {
    const unsafe = link(target, "shown text");
    assert.equal(unsafe.tag, "span");
    assert.deepEqual([...unsafe.attributes], []);
    assert.equal(unsafe.textContent, "shown text");
  }
});

function recordDownloads(t) {
  installDom(t);
  document.body = new RecordedNode("body");
  const create = document.createElement;
  const anchors = [];
  document.createElement = (tag) => {
    const node = create(tag);
    if (tag === "a") {
      anchors.push(node);
      node.click = () => { node.clickedWhileAttached = document.body.children.includes(node); };
      node.remove = () => { document.body.children = document.body.children.filter((child) => child !== node); };
    }
    return node;
  };
  const blobs = [], revoked = [], timers = [];
  t.mock.method(URL, "createObjectURL", (blob) => { blobs.push(blob); return `blob:test-${blobs.length}`; });
  t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
  t.mock.method(globalThis, "setTimeout", (callback, delay) => { timers.push({ callback, delay }); });
  return { anchors, blobs, revoked, timers };
}

test("downloadText() saves exact UTF-8 text through a temporary link and releases its URL on a later task", async (t) => {
  const record = recordDownloads(t);
  const text = "é — <script>alert(1)</script>\n";
  for (const [index, [mediaType, filename]] of [["text/plain", "zenzcash-recovery-codes.txt"], ["text/markdown", "zenzcash-selected-posts.md"]].entries()) {
    downloadText(text, filename, mediaType);
    const anchor = record.anchors[index], blob = record.blobs[index], url = `blob:test-${index + 1}`;
    assert.equal(blob.type, `${mediaType};charset=utf-8`);
    assert.equal(await blob.text(), text);
    assert.equal(anchor.href, url);
    assert.equal(anchor.download, filename);
    assert.equal(anchor.clickedWhileAttached, true);
    assert.deepEqual(document.body.children, []);
    assert.deepEqual(record.revoked, index === 0 ? [] : ["blob:test-1"]);
    assert.equal(record.timers.length, 1);
    assert.equal(record.timers[0].delay, 0);
    record.timers.shift().callback();
    assert.deepEqual(record.revoked, index === 0 ? ["blob:test-1"] : ["blob:test-1", "blob:test-2"]);
  }
});

test("downloadText() refuses media types a browser could run as a page", (t) => {
  const record = recordDownloads(t);
  for (const mediaType of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/plain;charset=utf-8", "TEXT/PLAIN"]) {
    assert.throws(() => downloadText("<script>alert(1)</script>", "page.html", mediaType), { message: `downloadText(): media type ${JSON.stringify(mediaType)} is not allowed` });
  }
  assert.deepEqual(record.blobs, []);
  assert.deepEqual(record.anchors, []);
});

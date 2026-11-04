// Gate check that page code never reaches an HTML-parsing, code-evaluating or navigation
// sink, and that only site/js/dom.js creates elements or sets attributes. It matches source
// shapes line by line, which catches accidental bypasses; deliberately obfuscated access
// (el["inner" + "HTML"]) is outside its scope. The Trusted Types CSP enforces the HTML and
// javascript: navigation sinks again at runtime in supporting browsers.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { RecordedNode, installDom } from "./recorded-dom.mjs";

const SITE_JS = new URL("../site/js/", import.meta.url);
const DOM_MODULE = "dom.js";

const EVERYWHERE = [
  ["innerHTML/outerHTML/srcdoc access", /\.\s*(?:innerHTML|outerHTML|srcdoc)\b|\[\s*["'`](?:innerHTML|outerHTML|srcdoc)["'`]\s*\]/],
  ["HTML-parsing API", /\b(?:insertAdjacentHTML|createContextualFragment|DOMParser|parseFromString|setHTMLUnsafe|setHTML|parseHTMLUnsafe)\b/],
  ["document.write", /\bdocument\s*\.\s*write(?:ln)?\b/],
  ["eval or Function constructor", /\beval\s*\(|\bFunction\s*\(/],
  ["string timer", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
  ["dynamic import", /\bimport\s*\(/],
  ["location assignment", /\blocation\s*(?:\.\s*href\s*)?=(?!=)|\blocation\s*\.\s*(?:assign|replace)\s*\(/],
  ["window.open", /\bwindow\s*\.\s*open\s*\(/],
];
const OUTSIDE_DOM_MODULE = [
  ["element creation outside dom.js", /\bcreateElement(?:NS)?\s*\(/],
  ["setAttribute outside dom.js", /\.\s*setAttribute(?:NS)?\s*\(/],
  ["URL property assignment outside dom.js", /\.\s*(?:href|src|action|formAction)\s*=(?!=)/],
];

function forbiddenUses(source, isDomModule) {
  const rules = isDomModule ? EVERYWHERE : [...EVERYWHERE, ...OUTSIDE_DOM_MODULE];
  return source.split("\n").flatMap((text, index) =>
    rules.filter(([, pattern]) => pattern.test(text)).map(([rule]) => ({ line: index + 1, rule })));
}

test("the scanner flags each forbidden shape and leaves equivalent safe code alone", () => {
  const flagged = [
    ["el.innerHTML = post.raw;", ["innerHTML/outerHTML/srcdoc access"]],
    ["const html = el . outerHTML;", ["innerHTML/outerHTML/srcdoc access"]],
    ["frame.srcdoc = text;", ["innerHTML/outerHTML/srcdoc access"]],
    ["el['innerHTML'] = text;", ["innerHTML/outerHTML/srcdoc access"]],
    ["el.insertAdjacentHTML('beforeend', text);", ["HTML-parsing API"]],
    ["new DOMParser().parseFromString(text, 'text/html');", ["HTML-parsing API"]],
    ["range.createContextualFragment(text);", ["HTML-parsing API"]],
    ["el.setHTMLUnsafe(text);", ["HTML-parsing API"]],
    ["document.write(text);", ["document.write"]],
    ["document.writeln(text);", ["document.write"]],
    ["eval(code);", ["eval or Function constructor"]],
    ["const run = new Function('x', body);", ["eval or Function constructor"]],
    ["setTimeout('alert(1)', 0);", ["string timer"]],
    ["setInterval(`tick()`, 10);", ["string timer"]],
    ["const module = await import(name);", ["dynamic import"]],
    ["location = target;", ["location assignment"]],
    ["window.location.assign(target);", ["location assignment"]],
    ["location.replace(target);", ["location assignment"]],
    ["window.open(target);", ["window.open"]],
  ];
  for (const [line, rules] of flagged) {
    for (const isDomModule of [false, true]) assert.deepEqual(forbiddenUses(line, isDomModule).map((use) => use.rule), rules, line);
  }
  const outsideOnly = [
    ["const anchor = document.createElement('a');", ["element creation outside dom.js"]],
    ["document.createElementNS(svg, 'svg');", ["element creation outside dom.js"]],
    ["button.setAttribute('aria-pressed', 'true');", ["setAttribute outside dom.js"]],
    ["anchor.href = url;", ["URL property assignment outside dom.js"]],
    ["image.src = url;", ["URL property assignment outside dom.js"]],
    ["form.action = url;", ["URL property assignment outside dom.js"]],
  ];
  for (const [line, rules] of outsideOnly) {
    assert.deepEqual(forbiddenUses(line, false).map((use) => use.rule), rules, line);
    assert.deepEqual(forbiddenUses(line, true), [], line);
  }
  assert.deepEqual(forbiddenUses("location.href = target;", true).map((use) => use.rule), ["location assignment"]);
  assert.deepEqual(forbiddenUses("location.href = target;", false).map((use) => use.rule), ["location assignment", "URL property assignment outside dom.js"]);
  const safe = [
    "node.textContent = post.raw;",
    "h('a', { href: '#/topics' }, 'Back');",
    "location.hash = '#/profile';",
    "if (location.hash !== '#/profile') state.account.sign_in_return = location.hash;",
    "if (anchor.href === expected) return;",
    "state.data = parsed;",
    "// there is no innerHTML anywhere in the site",
    "const evaluation = retrieval(item);",
    "if (typeof handler === 'function') handler();",
    "setTimeout(() => URL.revokeObjectURL(url), 0);",
    "import { h } from './dom.js';",
    "updateAttribute(button, 'aria-pressed', 'true');",
  ];
  for (const line of safe) {
    for (const isDomModule of [false, true]) assert.deepEqual(forbiddenUses(line, isDomModule), [], line);
  }
  assert.deepEqual(forbiddenUses("ok();\nel.innerHTML = x;\nok();", false), [{ line: 2, rule: "innerHTML/outerHTML/srcdoc access" }]);
});

test("site/js reaches no forbidden sink and only dom.js builds elements or sets attributes", () => {
  const files = readdirSync(SITE_JS).filter((name) => name.endsWith(".js")).sort();
  for (const expected of [DOM_MODULE, "app.js", "post.js", "markdown.js"]) assert.ok(files.includes(expected), `${expected} missing from scanned files ${files.join(", ")}`);
  const violations = files.flatMap((name) => forbiddenUses(readFileSync(new URL(name, SITE_JS), "utf8"), name === DOM_MODULE)
    .map(({ line, rule }) => `site/js/${name}:${line}: ${rule}`));
  assert.deepEqual(violations, []);
});

test("the recorded test DOM rejects HTML sinks instead of storing them", (t) => {
  installDom(t);
  const node = new RecordedNode("div");
  const message = (name) => ({ message: `${name} is forbidden: build nodes with site/js/dom.js` });
  assert.throws(() => { node.innerHTML = "<b>x</b>"; }, message("innerHTML"));
  assert.throws(() => node.innerHTML, message("innerHTML"));
  assert.throws(() => { node.outerHTML = "<b>x</b>"; }, message("outerHTML"));
  assert.throws(() => node.outerHTML, message("outerHTML"));
  assert.throws(() => node.insertAdjacentHTML("beforeend", "<b>x</b>"), message("insertAdjacentHTML"));
  assert.throws(() => document.write("<b>x</b>"), message("document.write"));
  assert.throws(() => document.writeln("<b>x</b>"), message("document.writeln"));
});

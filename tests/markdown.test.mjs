import assert from "node:assert/strict";
import test from "node:test";

import { parseBlocks, parseInlines, plainText, safeHref } from "../site/js/markdown.js";

test("blocks: paragraphs, headings, lists, quotes, code, rules", () => {
  const blocks = parseBlocks("# Title\n\nFirst line\nsecond line\n\n- a\n- b\n\n1. one\n\n> quoted\n\n```\ncode *not em*\n```\n\n---");
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "blockquote", "code", "rule"]);
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[3].ordered, true);
  assert.equal(blocks[5].text, "code *not em*");
  assert.deepEqual(blocks[1].inlines, [{ type: "text", text: "First line" }, { type: "break" }, { type: "text", text: "second line" }]);
});

test("inlines: emphasis, code, links, images, bare URLs, escapes", () => {
  assert.deepEqual(parseInlines("**bold** and *em* and `x*y`"), [
    { type: "strong", children: [{ type: "text", text: "bold" }] },
    { type: "text", text: " and " },
    { type: "em", children: [{ type: "text", text: "em" }] },
    { type: "text", text: " and " },
    { type: "code", text: "x*y" },
  ]);
  assert.deepEqual(parseInlines("[docs](https://z.cash/a) see https://example.org/x."), [
    { type: "link", href: "https://z.cash/a", children: [{ type: "text", text: "docs" }] },
    { type: "text", text: " see " },
    { type: "link", href: "https://example.org/x", children: [{ type: "text", text: "https://example.org/x" }] },
    { type: "text", text: "." },
  ]);
  assert.deepEqual(parseInlines("![chart](upload://abc.png)"), [{ type: "image", alt: "chart", href: "upload://abc.png" }]);
  assert.deepEqual(parseInlines("\\*not em\\* snake_case_name"), [{ type: "text", text: "*not em* snake_case_name" }]);
});

test("safeHref allows only http(s) and forum paths", () => {
  assert.equal(safeHref("https://z.cash/x"), "https://z.cash/x");
  assert.equal(safeHref("/t/foo/58515"), "https://forum.zcashcommunity.com/t/foo/58515");
  for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "upload://abc.png", "relative/path", "//evil.example/x", "vbscript:x"]) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test("safeHref rejects or safely normalizes known URL-parser bypass inputs", () => {
  const cases = [
    ["/\\evil.example/x", null],
    ["\\\\evil.example/x", null],
    ["//forum.zcashcommunity.com/t/1", null],
    ["java\tscript:alert(1)", null],
    ["java\nscript:alert(1)", null],
    [" javascript:alert(1)", null],
    ["\u0000javascript:alert(1)", null],
    ["javascript&colon;alert(1)", null],
    ["data:text/html;base64,PHNjcmlwdD4=", null],
    ["blob:https://zenzcash.com/x", null],
    ["https:evil.example", null],
    ["http:/evil.example", null],
    ["/\t/evil.example", null],
    ["/%2F%2Fevil.example", "https://forum.zcashcommunity.com/%2F%2Fevil.example"],
    ["/t/x\"onmouseover=alert(1)", "https://forum.zcashcommunity.com/t/x%22onmouseover=alert(1)"],
    ["HTTPS://forum.zcashcommunity.com/t/1", "https://forum.zcashcommunity.com/t/1"],
    // Absolute http(s) links may go to any host; this one's host is evil.example.
    ["https://forum.zcashcommunity.com@evil.example/", "https://forum.zcashcommunity.com@evil.example/"],
  ];
  for (const [input, expected] of cases) assert.equal(safeHref(input), expected, JSON.stringify(input));
});

const FORUM_ORIGIN = "https://forum.zcashcommunity.com";

// mulberry32: a fixed seed gives the same generated inputs on every run.
function seededRandom(seed) {
  let state = seed;
  return () => {
    let t = state += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const HREF_PIECES = [
  "https://", "http://", "HTTPS://", "HtTp://", "https:", "http:/", "javascript:", "JaVaScRiPt:",
  "data:text/html,", "vbscript:", "blob:", "file:///", "upload://", "mailto:", "//", "/", "/", "/t/",
  "\\", "/\\", "\\\\", "?", "#", "@", ":", ".", "..", "evil.example", "forum.zcashcommunity.com",
  "forum.zcashcommunity.com.evil.example", "topic/58515", "alert(1)", "%2F", "%0a", "%09", "&colon;",
  "&#58;", "\t", "\n", "\r", "\u0000", "\u000b", " ", " ", "​", "\"", "'", "<", ">", "x",
];

function generatedHrefs(count) {
  const random = seededRandom(20261104);
  const pick = () => HREF_PIECES[Math.floor(random() * HREF_PIECES.length)];
  return Array.from({ length: count }, () => Array.from({ length: 1 + Math.floor(random() * 6) }, pick).join(""));
}

const isAbsoluteHttp = (input) => /^https?:\/\//i.test(input);

function hrefViolation(input, output) {
  if (output === null) return null;
  if (typeof output !== "string" || !URL.canParse(output)) return `returned ${JSON.stringify(output)}, which is not a URL`;
  const url = new URL(output);
  if (url.protocol !== "https:" && url.protocol !== "http:") return `returned scheme ${url.protocol}`;
  if (url.href !== output) return "returned a non-canonical URL";
  if (!isAbsoluteHttp(input) && url.origin !== FORUM_ORIGIN) return `relative input left the forum for ${url.origin}`;
  return null;
}

test("safeHref property: every result is null or a canonical http(s) URL, and relative input stays on the forum", () => {
  const inputs = generatedHrefs(20000);
  const violations = (sanitize) => inputs.flatMap((input) => {
    const problem = hrefViolation(input, sanitize(input));
    return problem === null ? [] : [`${JSON.stringify(input)}: ${problem}`];
  });
  assert.deepEqual(violations(safeHref), []);
  // Every outcome is well represented, so a sanitizer that always rejects cannot pass vacuously.
  const outcomes = { rejected: 0, "forum path": 0, absolute: 0 };
  for (const input of inputs) {
    const output = safeHref(input);
    outcomes[output === null ? "rejected" : isAbsoluteHttp(input) ? "absolute" : "forum path"] += 1;
  }
  for (const [outcome, total] of Object.entries(outcomes)) assert.ok(total >= 500, `${outcome}: ${total} of ${inputs.length}`);
  // Plausible broken sanitizers fail the same property, so it detects real mistakes.
  const parsedOnForum = (href) => URL.canParse(href, FORUM_ORIGIN) ? new URL(href, FORUM_ORIGIN) : null;
  const broken = {
    "no scheme check": (href) => parsedOnForum(href)?.href ?? null,
    "no forum-origin check": (href) => {
      const url = parsedOnForum(href);
      return url !== null && (url.protocol === "https:" || url.protocol === "http:") ? url.href : null;
    },
    "prefix check without parsing": (href) => /^(?:https?:\/\/|\/)/i.test(href) ? href : null,
  };
  for (const [name, sanitize] of Object.entries(broken)) assert.notDeepEqual(violations(sanitize), [], `${name} passed the property`);
});

test("plainText strips markup for excerpts", () => {
  assert.equal(plainText("**TL;DR** End *ZCG*.\n\n![image|690x469](upload://x.png) [the ZIP](https://x.org)"), "TL;DR End ZCG. [image] the ZIP");
});

test("unknown markup degrades to text, never to markup", () => {
  const nodes = parseInlines("<script>alert(1)</script> [details=x]");
  assert.deepEqual(nodes, [{ type: "text", text: "<script>alert(1)</script> [details=x]" }]);
});

test("loose lists: blank lines between items continue the list and keep its start number", () => {
  const text = (item) => item.map((node) => node.text).join("");
  const loose = parseBlocks("1. one\n\n2. two\n\n\n3. three\n\nafter");
  assert.deepEqual(loose.map((block) => block.type), ["list", "paragraph"]);
  assert.equal(loose[0].start, 1);
  assert.deepEqual(loose[0].items.map(text), ["one", "two", "three"]);
  const fromThree = parseBlocks("3. three\n4. four");
  assert.equal(fromThree[0].start, 3);
  assert.deepEqual(fromThree[0].items.map(text), ["three", "four"]);
  const bullets = parseBlocks("- a\n\n- b\n\n1. one");
  assert.deepEqual(bullets.map((block) => [block.type, block.ordered, block.start, block.items.length]), [["list", false, null, 2], ["list", true, 1, 1]]);
  assert.deepEqual(parseBlocks("1. one\n\n> quote").map((block) => block.type), ["list", "blockquote"]);
});

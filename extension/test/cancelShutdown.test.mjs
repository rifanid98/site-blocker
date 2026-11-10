import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { blockedByForbiddenRule, canCancelShutdown } from "../src/matcher.js";
import { renderShutdownNotice } from "../src/blockPage.js";

const rules = [
  { domain: "bad.com", mode: "blockAll", forbidden: true },
  { domain: "meh.com", mode: "blockAll" },
];

test("a page on a forbidden domain is blocked by a forbidden rule; ordinary rules and other pages are not", () => {
  assert.equal(blockedByForbiddenRule("https://bad.com/x", rules), true);
  assert.equal(blockedByForbiddenRule("https://www.bad.com/av", rules), true);
  assert.equal(blockedByForbiddenRule("https://meh.com/x", rules), false);
  assert.equal(blockedByForbiddenRule("https://example.com/av", rules), false);
  assert.equal(blockedByForbiddenRule("not a url", rules), false);
});

test("a forbidden path exception is not a forbidden hit: the rule does not block that page", () => {
  const withPath = [{ domain: "bad.com", mode: "allowPaths", allowPaths: ["/ok*"], forbidden: true }];
  assert.equal(blockedByForbiddenRule("https://bad.com/ok/page", withPath), false);
  assert.equal(blockedByForbiddenRule("https://bad.com/other", withPath), true);
});

test("a shutdown can be cancelled only when it has time and came from a keyword, not a forbidden domain", () => {
  assert.equal(canCancelShutdown("https://example.com/av", rules, 5), true);
  assert.equal(canCancelShutdown("https://bad.com/av", rules, 5), false);
  assert.equal(canCancelShutdown("https://example.com/av", rules, 0), false);
});

function noticeOn(seconds = 5, sent = []) {
  const dom = new JSDOM("<!doctype html><html><body><p>blocked</p></body></html>", { pretendToBeVisual: true });
  const { document } = dom.window;
  globalThis.chrome = { runtime: { sendMessage: async (m) => (sent.push(m), { ok: true }) } };
  renderShutdownNotice(seconds, document, "open");
  return { document, root: document.getElementById("siteblocker-shutdown").shadowRoot, sent };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the notice counts down in the extension and offers a Cancel button", () => {
  const { root, sent } = noticeOn(5);
  assert.match(root.textContent, /shutting down in 5 s/i);
  assert.match(root.querySelector("button").textContent, /cancel/i);
  assert.equal(sent.length, 0, "nothing is sent to Windows while it counts down");
});

test("the notice is drawn once, and its shadow root is closed unless a test asks otherwise", () => {
  const { document } = noticeOn(5);
  renderShutdownNotice(5, document, "open");
  assert.equal(document.querySelectorAll("#siteblocker-shutdown").length, 1);

  const closed = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  renderShutdownNotice(5, closed);
  assert.equal(closed.getElementById("siteblocker-shutdown").shadowRoot, null);
});

test("Cancel stops the countdown, tells nothing to Windows, and points to the popup toggle", async () => {
  const { root, sent } = noticeOn(5);
  root.querySelector("button").click();
  await settle();

  assert.deepEqual(sent, []);
  assert.match(root.textContent, /cancelled/i);
  assert.match(root.textContent, /skip keyword blocking/i);
  assert.equal(root.querySelector("button"), null);
});

test("when the countdown reaches zero the extension asks for the shutdown, once", async () => {
  const { root, sent } = noticeOn(0);
  await settle();

  assert.deepEqual(sent, [{ type: "shutdownNow" }]);
  assert.match(root.textContent, /shutting down/i);
  assert.equal(root.querySelector("button"), null, "too late to cancel");
});

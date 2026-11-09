import { test } from "node:test";
import assert from "node:assert/strict";
import { matchKeyword, findBlockReason } from "../src/matcher.js";
import { BlockStore } from "../src/store.js";

const exempt = ["github.com"];

test("an exempt domain skips keyword detection", () => {
  assert.equal(matchKeyword("https://github.com/me/repo/tree/wave-4", ["av"], exempt), null);
});

test("subdomains of an exempt domain are exempt too", () => {
  assert.equal(matchKeyword("https://gist.github.com/me/wave-4", ["av"], exempt), null);
});

test("other domains are still checked", () => {
  assert.equal(matchKeyword("https://example.com/wave-4", ["av"], exempt), "av");
});

test("lookalike hosts are not exempt", () => {
  assert.equal(matchKeyword("https://notgithub.com/wave-4", ["av"], exempt), "av");
  assert.equal(matchKeyword("https://github.com.evil.org/wave-4", ["av"], exempt), "av");
});

test("the exempt domain only counts when it is the host, not when it appears in the path or query", () => {
  assert.equal(matchKeyword("https://evil.com/github.com/wave-4", ["av"], exempt), "av");
  assert.equal(matchKeyword("https://evil.com/?next=github.com&q=wave", ["av"], exempt), "av");
});

test("no exempt list behaves as before", () => {
  assert.equal(matchKeyword("https://github.com/wave-4", ["av"]), "av");
  assert.equal(matchKeyword("https://github.com/wave-4", ["av"], []), "av");
});

test("site rules still block an exempt domain", () => {
  const rules = [{ domain: "github.com", mode: "blockAll", allowPaths: [] }];
  assert.deepEqual(findBlockReason("https://github.com/x", rules, ["av"], exempt), { type: "rule", domain: "github.com" });
});

test("findBlockReason does not report a keyword for an exempt domain", () => {
  assert.equal(findBlockReason("https://github.com/me/wave-4", [], ["av"], exempt), null);
});

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

test("adding a keyword exception needs the password and normalizes the domain", async () => {
  const store = await createStore("pw123");

  assert.equal(await store.addKeywordExemption("https://www.GitHub.com/me", "wrong"), false);
  assert.deepEqual((await store.getState()).keywordExempt, []);

  assert.equal(await store.addKeywordExemption("https://www.GitHub.com/me", "pw123"), true);
  assert.deepEqual((await store.getState()).keywordExempt, ["github.com"]);
});

test("an invalid domain or a duplicate is rejected", async () => {
  const store = await createStore("pw123");
  await assert.rejects(() => store.addKeywordExemption("not a domain", "pw123"));
  await store.addKeywordExemption("github.com", "pw123");
  await assert.rejects(() => store.addKeywordExemption("www.github.com", "pw123"));
});

test("removing a keyword exception is free", async () => {
  const store = await createStore("pw123");
  await store.addKeywordExemption("github.com", "pw123");

  assert.equal(await store.removeKeywordExemption("github.com"), true);
  assert.deepEqual((await store.getState()).keywordExempt, []);
  assert.equal(await store.removeKeywordExemption("github.com"), false);
});

test("effective settings include the exemptions", async () => {
  const store = await createStore("pw123");
  await store.addKeywordExemption("github.com", "pw123");
  await store.addKeyword("av");

  const effective = await store.getEffective();
  assert.deepEqual(effective.keywordExempt, ["github.com"]);
  assert.deepEqual(effective.keywords, ["av"]);
});

test("a redirect target on an exempt domain is accepted even if it contains a keyword", async () => {
  const store = await createStore("pw123");
  await store.addKeyword("av");
  await store.addKeywordExemption("github.com", "pw123");
  await store.enableRedirect("https://github.com/me/wave-4");
  assert.equal((await store.getRedirect()).enabled, true);
});

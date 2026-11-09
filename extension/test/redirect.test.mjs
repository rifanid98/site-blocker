import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRedirectUrl } from "../src/matcher.js";
import { BlockStore } from "../src/store.js";

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

test("normalizeRedirectUrl adds https and returns the canonical url", () => {
  assert.equal(normalizeRedirectUrl("wikipedia.org"), "https://wikipedia.org/");
  assert.equal(normalizeRedirectUrl("  https://example.com/study?x=1 "), "https://example.com/study?x=1");
  assert.equal(normalizeRedirectUrl("http://localhost:3000/"), "http://localhost:3000/");
});

test("normalizeRedirectUrl rejects anything that is not a plain web address", () => {
  for (const bad of ["", "   ", "not a url", "javascript:alert(1)", "chrome://settings", "ftp://example.com", "https://", "nodots"]) {
    assert.throws(() => normalizeRedirectUrl(bad), undefined, JSON.stringify(bad));
  }
});

test("redirect mode is off by default", async () => {
  const store = await createStore();
  assert.deepEqual(await store.getRedirect(), { enabled: false, url: "" });
});

test("turning redirect mode on is free and stores the normalized url", async () => {
  const store = await createStore();
  await store.enableRedirect("wikipedia.org");
  assert.deepEqual(await store.getRedirect(), { enabled: true, url: "https://wikipedia.org/" });
});

test("an invalid url is rejected and the mode stays off", async () => {
  const store = await createStore();
  await assert.rejects(() => store.enableRedirect("javascript:alert(1)"));
  assert.equal((await store.getRedirect()).enabled, false);
});

test("a redirect target that is itself blocked is rejected, so it can never loop", async () => {
  const store = await createStore();
  await store.addRule("wikipedia.org", "blockAll", []);
  await assert.rejects(() => store.enableRedirect("https://en.wikipedia.org/wiki/Study"));

  await store.addKeyword("casino");
  await assert.rejects(() => store.enableRedirect("https://example.com/casino-math"));
  assert.equal((await store.getRedirect()).enabled, false);
});

test("a target allowed by a path exception is accepted", async () => {
  const store = await createStore();
  await store.addRule("facebook.com", "blockExcept", ["/marketplace*"]);
  await store.enableRedirect("https://facebook.com/marketplace");
  assert.equal((await store.getRedirect()).enabled, true);
});

test("enabling twice is rejected so the target cannot change without the password", async () => {
  const store = await createStore();
  await store.enableRedirect("wikipedia.org");
  await assert.rejects(() => store.enableRedirect("example.com"));
  assert.equal((await store.getRedirect()).url, "https://wikipedia.org/");
});

test("turning redirect mode off needs the password", async () => {
  const store = await createStore("pw123");
  await store.enableRedirect("wikipedia.org");

  assert.equal(await store.disableRedirect("wrong"), false);
  assert.equal((await store.getRedirect()).enabled, true);

  assert.equal(await store.disableRedirect("pw123"), true);
  assert.equal((await store.getRedirect()).enabled, false);
});

test("turning off when already off returns false", async () => {
  const store = await createStore("pw123");
  assert.equal(await store.disableRedirect("pw123"), false);
});

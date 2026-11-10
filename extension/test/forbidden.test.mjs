import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlockReason, shouldShutDown } from "../src/matcher.js";
import { BlockStore } from "../src/store.js";
import { buildExport, parseSettings } from "../src/settingsFile.js";

const forbiddenFacebook = { domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"], forbidden: true };

test("a blocked forbidden site reports the flag in its block reason", () => {
  assert.deepEqual(findBlockReason("https://facebook.com/", [forbiddenFacebook], []), {
    type: "rule",
    domain: "facebook.com",
    forbidden: true,
  });
});

test("an ordinary blocked site reports no flag", () => {
  const rules = [{ domain: "a.com", mode: "blockAll", allowPaths: [] }];
  assert.deepEqual(findBlockReason("https://a.com/", rules, []), { type: "rule", domain: "a.com" });
});

test("an allowed path on a forbidden site is not blocked at all, so it can never shut down", () => {
  assert.equal(findBlockReason("https://facebook.com/marketplace/item/1", [forbiddenFacebook], []), null);
});

test("shouldShutDown is true only for a rule reason with the forbidden flag", () => {
  assert.equal(shouldShutDown({ type: "rule", domain: "a.com", forbidden: true }), true);
  assert.equal(shouldShutDown({ type: "rule", domain: "a.com" }), false);
  assert.equal(shouldShutDown({ type: "rule", domain: "a.com", forbidden: false }), false);
  assert.equal(shouldShutDown({ type: "keyword", keyword: "av" }), false);
  assert.equal(shouldShutDown(null), false);
  assert.equal(shouldShutDown(undefined), false);
});

test("a keyword hit on a forbidden site's page is reported as a keyword, not a forbidden rule", () => {
  const reason = findBlockReason("https://other.com/casino", [forbiddenFacebook], ["casino"]);
  assert.equal(shouldShutDown(reason), false);
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

test("a site can be added as forbidden for free", async () => {
  const store = await createStore();
  await store.addRule("facebook.com", "blockExcept", ["/marketplace*"], true);
  assert.deepEqual((await store.getState()).localRules, [forbiddenFacebook]);
});

test("a site added without the flag has no forbidden field", async () => {
  const store = await createStore();
  await store.addRule("a.com", "blockAll", []);
  assert.deepEqual((await store.getState()).localRules, [{ domain: "a.com", mode: "blockAll", allowPaths: [] }]);
});

test("changing the flag needs the password", async () => {
  const store = await createStore("pw123");
  await store.addRule("a.com", "blockAll", [], true);

  assert.equal(await store.updateRule("a.com", "blockAll", [], "wrong", false), false);
  assert.equal((await store.getState()).localRules[0].forbidden, true);

  assert.equal(await store.updateRule("a.com", "blockAll", [], "pw123", false), true);
  assert.equal("forbidden" in (await store.getState()).localRules[0], false);

  assert.equal(await store.updateRule("a.com", "blockAll", [], "pw123", true), true);
  assert.equal((await store.getState()).localRules[0].forbidden, true);
});

test("updating without naming the flag keeps the existing flag", async () => {
  const store = await createStore("pw123");
  await store.addRule("a.com", "blockAll", [], true);
  await store.updateRule("a.com", "blockExcept", ["/ok*"], "pw123");
  assert.equal((await store.getState()).localRules[0].forbidden, true);
});

test("the flag survives export and parse, and false stays out of the file", () => {
  const settings = {
    localRules: [forbiddenFacebook, { domain: "a.com", mode: "blockAll", allowPaths: [] }],
    keywords: [],
    forbiddenKeywords: [],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("a non-boolean forbidden flag in a file is rejected", () => {
  const file = (forbidden) => ({
    app: "SiteBlocker",
    version: 1,
    localRules: [{ domain: "a.com", mode: "blockAll", forbidden }],
  });
  for (const bad of ["yes", 1, null, {}]) {
    assert.throws(() => parseSettings(file(bad)), /forbidden/, JSON.stringify(bad));
  }
  assert.equal("forbidden" in parseSettings(file(false)).localRules[0], false);
});

test("merge keeps an existing rule's flag, replace takes the file's", async () => {
  const data = {
    app: "SiteBlocker",
    version: 1,
    localRules: [{ domain: "a.com", mode: "blockAll", allowPaths: [] }],
  };

  const merged = await createStore("pw123");
  await merged.addRule("a.com", "blockAll", [], true);
  await merged.importSettings(data, "merge", "pw123");
  assert.equal((await merged.getState()).localRules[0].forbidden, true);

  const replaced = await createStore("pw123");
  await replaced.addRule("a.com", "blockAll", [], true);
  await replaced.importSettings(data, "replace", "pw123");
  assert.equal("forbidden" in (await replaced.getState()).localRules[0], false);
});

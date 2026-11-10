import { test } from "node:test";
import assert from "node:assert/strict";
import { findBlockReason, matchKeywords, shouldShutDown } from "../src/matcher.js";
import { BlockStore } from "../src/store.js";
import { buildExport, parseSettings } from "../src/settingsFile.js";

test("matchKeywords returns every keyword in the url", () => {
  assert.deepEqual(matchKeywords("https://x.com/casino-poker", ["poker", "zzz", "casino"]), ["poker", "casino"]);
  assert.deepEqual(matchKeywords("https://x.com/news", ["casino"]), []);
});

test("a forbidden keyword marks the block reason forbidden", () => {
  const reason = findBlockReason("https://x.com/casino", [], ["casino"], [], ["casino"]);
  assert.deepEqual(reason, { type: "keyword", keyword: "casino", forbidden: true });
  assert.equal(shouldShutDown(reason), true);
});

test("an ordinary keyword is not forbidden", () => {
  const reason = findBlockReason("https://x.com/casino", [], ["casino"], [], ["poker"]);
  assert.deepEqual(reason, { type: "keyword", keyword: "casino" });
  assert.equal(shouldShutDown(reason), false);
});

test("any forbidden keyword among several matches makes the page forbidden", () => {
  const reason = findBlockReason("https://x.com/casino-poker", [], ["casino", "poker"], [], ["poker"]);
  assert.equal(reason.type, "keyword");
  assert.equal(reason.keyword, "casino"); // the first hit is still the one reported
  assert.equal(shouldShutDown(reason), true);
});

test("a forbidden site rule makes the page forbidden even when an ordinary keyword is the main reason", () => {
  const rules = [{ domain: "bad.com", mode: "blockAll", allowPaths: [], forbidden: true }];
  const reason = findBlockReason("https://bad.com/casino", rules, ["casino"], [], []);
  assert.equal(reason.type, "keyword");
  assert.equal(shouldShutDown(reason), true);
});

test("a forbidden keyword on a keyword-exempt domain does not trigger anything", () => {
  assert.equal(findBlockReason("https://github.com/me/wave-4", [], ["av"], ["github.com"], ["av"]), null);
});

test("a forbidden keyword does not apply to a forbidden-looking page that is not blocked", () => {
  assert.equal(findBlockReason("https://x.com/news", [], ["casino"], [], ["casino"]), null);
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

test("a keyword can be added as forbidden for free", async () => {
  const store = await createStore();
  await store.addKeyword("casino", true);
  await store.addKeyword("poker");

  const state = await store.getState();
  assert.deepEqual(state.keywords, ["casino", "poker"]);
  assert.deepEqual(state.forbiddenKeywords, ["casino"]);
});

test("marking a keyword forbidden is free, unmarking needs the password", async () => {
  const store = await createStore("pw123");
  await store.addKeyword("casino");

  assert.equal(await store.setKeywordForbidden("casino", true), true);
  assert.deepEqual((await store.getState()).forbiddenKeywords, ["casino"]);

  assert.equal(await store.setKeywordForbidden("casino", false, "wrong"), false);
  assert.deepEqual((await store.getState()).forbiddenKeywords, ["casino"]);

  assert.equal(await store.setKeywordForbidden("casino", false, "pw123"), true);
  assert.deepEqual((await store.getState()).forbiddenKeywords, []);
});

test("flagging a keyword that is not in the list throws", async () => {
  const store = await createStore();
  await assert.rejects(() => store.setKeywordForbidden("missing", true));
});

test("removing a keyword also removes its forbidden flag", async () => {
  const store = await createStore("pw123");
  await store.addKeyword("casino", true);
  await store.removeKeyword("casino", "pw123");
  assert.deepEqual((await store.getState()).forbiddenKeywords, []);

  await store.addKeyword("casino"); // coming back later must not inherit the old flag
  assert.deepEqual((await store.getState()).forbiddenKeywords, []);
});

test("effective settings include the forbidden keywords", async () => {
  const store = await createStore();
  await store.addKeyword("casino", true);
  assert.deepEqual((await store.getEffective()).forbiddenKeywords, ["casino"]);
});

test("forbidden keywords survive export and parse", () => {
  const settings = {
    localRules: [],
    keywords: ["casino", "poker"],
    forbiddenKeywords: ["casino"],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("a forbidden keyword missing from keywords is added to keywords by the parser", () => {
  const parsed = parseSettings({ app: "SiteBlocker", version: 1, keywords: ["poker"], forbiddenKeywords: ["Casino"] });
  assert.deepEqual(parsed.keywords, ["poker", "casino"]);
  assert.deepEqual(parsed.forbiddenKeywords, ["casino"]);
});

test("bad forbiddenKeywords are rejected", () => {
  for (const bad of ["casino", [5], ["a"]]) {
    assert.throws(() => parseSettings({ app: "SiteBlocker", version: 1, forbiddenKeywords: bad }), undefined, JSON.stringify(bad));
  }
});

test("export includes forbiddenKeywords, and an empty list is still present", async () => {
  const store = await createStore();
  await store.addKeyword("casino", true);
  assert.deepEqual((await store.exportSettings()).forbiddenKeywords, ["casino"]);
});

test("import: merge only adds forbidden flags, replace takes the file's", async () => {
  const data = { app: "SiteBlocker", version: 1, keywords: ["casino", "poker"], forbiddenKeywords: ["poker"] };

  const merged = await createStore("pw123");
  await merged.addKeyword("casino", true);
  await merged.importSettings(data, "merge", "pw123");
  assert.deepEqual((await merged.getState()).forbiddenKeywords.sort(), ["casino", "poker"]);

  const replaced = await createStore("pw123");
  await replaced.addKeyword("casino", true);
  await replaced.importSettings(data, "replace", "pw123");
  assert.deepEqual((await replaced.getState()).forbiddenKeywords, ["poker"]);
});

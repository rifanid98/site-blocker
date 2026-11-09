import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../src/store.js";

function memoryStorage() {
  const data = {};
  return {
    data,
    get: async (key) => data[key],
    set: async (key, value) => {
      data[key] = value;
    },
  };
}

async function createStore(password = "pw123") {
  const storage = memoryStorage();
  const store = new BlockStore(storage);
  if (password) await store.setInitialPassword(password);
  return { store, storage };
}

test("initial password is stored hashed and cannot be set twice", async () => {
  const { store, storage } = await createStore("pw123");
  assert.equal(storage.data.passwordHash.includes("pw123"), false);
  await assert.rejects(() => store.setInitialPassword("other"));
});

test("adding a new site is free and normalizes the domain", async () => {
  const { store } = await createStore();
  await store.addRule("https://www.Facebook.com/", "blockExcept", ["marketplace*", " /ok "]);
  const { localRules } = await store.getState();
  assert.deepEqual(localRules, [
    { domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*", "/ok"] },
  ]);
});

test("blockAll ignores allowed paths", async () => {
  const { store } = await createStore();
  await store.addRule("a.com", "blockAll", ["/x"]);
  assert.deepEqual((await store.getState()).localRules[0].allowPaths, []);
});

test("adding an invalid or duplicate domain throws", async () => {
  const { store } = await createStore();
  await assert.rejects(() => store.addRule("not a domain", "blockAll", []));
  await store.addRule("a.com", "blockAll", []);
  await assert.rejects(() => store.addRule("a.com", "blockAll", []));
});

test("removing a site needs the right password", async () => {
  const { store } = await createStore("pw123");
  await store.addRule("a.com", "blockAll", []);

  assert.equal(await store.removeRule("a.com", "wrong"), false);
  assert.equal((await store.getState()).localRules.length, 1);

  assert.equal(await store.removeRule("a.com", "pw123"), true);
  assert.equal((await store.getState()).localRules.length, 0);
});

test("removing an unknown site returns false", async () => {
  const { store } = await createStore("pw123");
  assert.equal(await store.removeRule("missing.com", "pw123"), false);
});

test("updating a site needs the password", async () => {
  const { store } = await createStore("pw123");
  await store.addRule("a.com", "blockAll", []);

  assert.equal(await store.updateRule("a.com", "blockExcept", ["/ok*"], "bad"), false);
  assert.equal((await store.getState()).localRules[0].mode, "blockAll");

  assert.equal(await store.updateRule("a.com", "blockExcept", ["/ok*"], "pw123"), true);
  assert.equal((await store.getState()).localRules[0].mode, "blockExcept");
});

test("keywords: adding is free, normalized and de-duplicated", async () => {
  const { store } = await createStore();
  await store.addKeyword("  Casino ");
  await assert.rejects(() => store.addKeyword("casino"));
  await assert.rejects(() => store.addKeyword("a"));
  assert.deepEqual((await store.getState()).keywords, ["casino"]);
});

test("keywords: removing needs the password", async () => {
  const { store } = await createStore("pw123");
  await store.addKeyword("casino");
  assert.equal(await store.removeKeyword("casino", "wrong"), false);
  assert.deepEqual((await store.getState()).keywords, ["casino"]);
  assert.equal(await store.removeKeyword("casino", "pw123"), true);
  assert.deepEqual((await store.getState()).keywords, []);
});

test("without a password set, nothing can be removed", async () => {
  const { store } = await createStore(null);
  await store.addRule("a.com", "blockAll", []);
  assert.equal(await store.removeRule("a.com", ""), false);
  assert.equal(await store.removeRule("a.com", "anything"), false);
});

test("effective rules combine app rules and local rules", async () => {
  const { store } = await createStore();
  await store.setAppRules([{ domain: "app.com", mode: "blockAll", allowPaths: [] }]);
  await store.addRule("local.com", "blockAll", []);
  await store.addKeyword("casino");

  const effective = await store.getEffective();
  assert.deepEqual(effective.rules.map((r) => r.domain), ["app.com", "local.com"]);
  assert.deepEqual(effective.keywords, ["casino"]);
});

test("state defaults to empty lists on a fresh install", async () => {
  const { store } = await createStore(null);
  assert.deepEqual(await store.getState(), {
    appRules: [],
    localRules: [],
    keywords: [],
    forbiddenKeywords: [],
    keywordExempt: [],
    hasPassword: false,
  });
});

test("changing the password needs the old one", async () => {
  const { store } = await createStore("pw123");
  assert.equal(await store.changePassword("wrong", "new"), false);
  assert.equal(await store.changePassword("pw123", "new"), true);
  assert.equal(await store.verify("new"), true);
  assert.equal(await store.verify("pw123"), false);
});

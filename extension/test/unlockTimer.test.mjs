import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../src/store.js";
import { buildExport, parseSettings } from "../src/settingsFile.js";

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

const file = (patch = {}) => ({ app: "SiteBlocker", version: 1, ...patch });

test("unlock countdown is off by default with a 10 second length", async () => {
  const store = await createStore();
  assert.deepEqual(await store.getUnlockTimer(), { enabled: false, seconds: 10 });
});

test("turning it on is free and stores the length", async () => {
  const store = await createStore();
  await store.enableUnlockTimer(20);
  assert.deepEqual(await store.getUnlockTimer(), { enabled: true, seconds: 20 });
});

test("the length must be a whole number from 1 to 300 seconds", async () => {
  const store = await createStore();
  for (const bad of [0, 301, -1, 2.5, NaN, "abc", undefined, null]) {
    await assert.rejects(() => store.enableUnlockTimer(bad), String(bad));
  }
  assert.equal((await store.getUnlockTimer()).enabled, false);
});

test("the bounds are accepted", async () => {
  for (const seconds of [1, 300]) {
    const store = await createStore();
    await store.enableUnlockTimer(seconds);
    assert.equal((await store.getUnlockTimer()).seconds, seconds);
  }
});

test("enabling twice is rejected so the length cannot change without the password", async () => {
  const store = await createStore();
  await store.enableUnlockTimer(20);
  await assert.rejects(() => store.enableUnlockTimer(1));
  assert.equal((await store.getUnlockTimer()).seconds, 20);
});

test("turning it off needs the password", async () => {
  const store = await createStore("pw123");
  await store.enableUnlockTimer(20);

  assert.equal(await store.disableUnlockTimer("wrong"), false);
  assert.equal((await store.getUnlockTimer()).enabled, true);

  assert.equal(await store.disableUnlockTimer("pw123"), true);
  assert.equal((await store.getUnlockTimer()).enabled, false);
});

test("turning it off when already off returns false", async () => {
  const store = await createStore("pw123");
  assert.equal(await store.disableUnlockTimer("pw123"), false);
});

test("the unlock countdown survives export and parse", () => {
  const settings = {
    localRules: [],
    keywords: [],
    forbiddenKeywords: [],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: true, seconds: 30 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("a file without the unlock countdown means off", () => {
  assert.deepEqual(parseSettings(file()).unlockTimer, { enabled: false, seconds: 10 });
});

test("bad unlock countdown values in a file are rejected", () => {
  const cases = [
    { enabled: "yes", seconds: 10 },
    { enabled: true, seconds: 0 },
    { enabled: true, seconds: 301 },
    { enabled: true, seconds: 2.5 },
    null,
    "on",
  ];
  for (const unlockTimer of cases) {
    assert.throws(() => parseSettings(file({ unlockTimer })), /unlockTimer/, JSON.stringify(unlockTimer));
  }
});

test("export includes the unlock countdown", async () => {
  const store = await createStore();
  await store.enableUnlockTimer(45);
  assert.deepEqual((await store.exportSettings()).unlockTimer, { enabled: true, seconds: 45 });
});

test("import merge keeps a countdown that is already on and adopts the file's when it was off", async () => {
  const on = await createStore("pw123");
  await on.enableUnlockTimer(20);
  await on.importSettings(file({ unlockTimer: { enabled: true, seconds: 60 } }), "merge", "pw123");
  assert.deepEqual(await on.getUnlockTimer(), { enabled: true, seconds: 20 });

  const off = await createStore("pw123");
  await off.importSettings(file({ unlockTimer: { enabled: true, seconds: 60 } }), "merge", "pw123");
  assert.deepEqual(await off.getUnlockTimer(), { enabled: true, seconds: 60 });
});

test("import merge never switches a countdown off", async () => {
  const store = await createStore("pw123");
  await store.enableUnlockTimer(20);
  await store.importSettings(file({ unlockTimer: { enabled: false, seconds: 10 } }), "merge", "pw123");
  assert.equal((await store.getUnlockTimer()).enabled, true);
});

test("import replace takes the file's countdown, including off", async () => {
  const store = await createStore("pw123");
  await store.enableUnlockTimer(20);
  await store.importSettings(file({ unlockTimer: { enabled: false, seconds: 10 } }), "replace", "pw123");
  assert.equal((await store.getUnlockTimer()).enabled, false);
});

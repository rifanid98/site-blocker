import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../src/store.js";
import { buildExport, parseSettings } from "../src/settingsFile.js";
import { CUSTOM_PAGE_MAX_CHARS } from "../src/constants.js";

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
const page = { enabled: true, html: "<h1>Nope</h1>", css: "body{background:#000}" };

test("the custom page is off and empty by default", async () => {
  const store = await createStore();
  assert.deepEqual(await store.getCustomPage(), { enabled: false, html: "", css: "" });
});

test("saving a custom page is free and stored as given", async () => {
  const store = await createStore();
  await store.setCustomPage(page);
  assert.deepEqual(await store.getCustomPage(), page);
});

test("it can be switched off again without the password, keeping the content", async () => {
  const store = await createStore("pw123");
  await store.setCustomPage(page);
  await store.setCustomPage({ ...page, enabled: false });
  assert.deepEqual(await store.getCustomPage(), { ...page, enabled: false });
});

test("a page that is on needs some HTML", async () => {
  const store = await createStore();
  await assert.rejects(() => store.setCustomPage({ enabled: true, html: "   ", css: "" }), /html/i);
  assert.equal((await store.getCustomPage()).enabled, false);
});

test("an empty page may be saved while it is off", async () => {
  const store = await createStore();
  await store.setCustomPage({ enabled: false, html: "", css: "" });
  assert.equal((await store.getCustomPage()).enabled, false);
});

test("bad values are rejected", async () => {
  const store = await createStore();
  const tooLong = "x".repeat(CUSTOM_PAGE_MAX_CHARS + 1);
  for (const bad of [
    null,
    "page",
    { enabled: "yes", html: "<p>a</p>", css: "" },
    { enabled: true, html: 5, css: "" },
    { enabled: true, html: "<p>a</p>", css: 5 },
    { enabled: true, html: tooLong, css: "" },
    { enabled: true, html: "<p>a</p>", css: tooLong },
  ]) {
    await assert.rejects(() => store.setCustomPage(bad), JSON.stringify(bad)?.slice(0, 40));
  }
  assert.deepEqual(await store.getCustomPage(), { enabled: false, html: "", css: "" });
});

test("the limit itself is accepted", async () => {
  const store = await createStore();
  await store.setCustomPage({ enabled: true, html: "x".repeat(CUSTOM_PAGE_MAX_CHARS), css: "" });
  assert.equal((await store.getCustomPage()).html.length, CUSTOM_PAGE_MAX_CHARS);
});

test("the custom page survives export and parse", () => {
  const settings = {
    localRules: [],
    keywords: [],
    forbiddenKeywords: [],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: page,
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("a file without a custom page means off and empty", () => {
  assert.deepEqual(parseSettings(file()).customPage, { enabled: false, html: "", css: "" });
});

test("bad custom pages in a file are rejected", () => {
  for (const customPage of [
    null,
    "x",
    { enabled: "yes", html: "<p>a</p>" },
    { enabled: true, html: "" },
    { enabled: true, html: 5 },
    { enabled: false, html: "<p>a</p>", css: 5 },
    { enabled: true, html: "x".repeat(CUSTOM_PAGE_MAX_CHARS + 1) },
  ]) {
    assert.throws(() => parseSettings(file({ customPage })), /customPage/, JSON.stringify(customPage)?.slice(0, 40));
  }
});

test("export includes the custom page", async () => {
  const store = await createStore();
  await store.setCustomPage(page);
  assert.deepEqual((await store.exportSettings()).customPage, page);
});

test("import merge keeps an existing custom page and adopts the file's when there is none", async () => {
  const have = await createStore("pw123");
  await have.setCustomPage({ enabled: true, html: "<p>mine</p>", css: "" });
  await have.importSettings(file({ customPage: page }), "merge", "pw123");
  assert.equal((await have.getCustomPage()).html, "<p>mine</p>");

  const none = await createStore("pw123");
  await none.importSettings(file({ customPage: page }), "merge", "pw123");
  assert.deepEqual(await none.getCustomPage(), page);
});

test("import replace takes the file's custom page", async () => {
  const store = await createStore("pw123");
  await store.setCustomPage({ enabled: true, html: "<p>mine</p>", css: "" });
  await store.importSettings(file({ customPage: { enabled: false, html: "", css: "" } }), "replace", "pw123");
  assert.deepEqual(await store.getCustomPage(), { enabled: false, html: "", css: "" });
});

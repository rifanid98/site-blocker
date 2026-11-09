import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../src/store.js";

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const storage = memoryStorage();
  const store = new BlockStore(storage);
  if (password) await store.setInitialPassword(password);
  return { store, storage };
}

const file = (patch = {}) => ({ app: "SiteBlocker", version: 1, ...patch });

test("export contains the user's settings but never the password hash or the app rules", async () => {
  const { store } = await createStore();
  await store.setAppRules([{ domain: "app.com", mode: "blockAll", allowPaths: [] }]);
  await store.addRule("a.com", "blockAll", []);
  await store.addKeyword("casino");
  await store.addKeywordExemption("github.com", "pw123");
  await store.enableShutdown(30);
  await store.enableRedirect("wikipedia.org");

  const out = await store.exportSettings();

  assert.equal(out.app, "SiteBlocker");
  assert.deepEqual(out.localRules, [{ domain: "a.com", mode: "blockAll", allowPaths: [] }]);
  assert.deepEqual(out.keywords, ["casino"]);
  assert.deepEqual(out.keywordExempt, ["github.com"]);
  assert.deepEqual(out.shutdown, { enabled: true, delaySeconds: 30 });
  assert.deepEqual(out.redirect, { enabled: true, url: "https://wikipedia.org/" });
  assert.equal(JSON.stringify(out).includes("passwordHash"), false);
  assert.equal(JSON.stringify(out).includes("app.com"), false);
});

test("export then import into a fresh install restores everything", async () => {
  const source = (await createStore()).store;
  await source.addRule("facebook.com", "blockExcept", ["/marketplace*"]);
  await source.addKeyword("av");
  await source.addKeywordExemption("github.com", "pw123");
  await source.enableShutdown(0);
  const exported = JSON.parse(JSON.stringify(await source.exportSettings()));

  const target = (await createStore("another-pw")).store;
  assert.ok(await target.importSettings(exported, "replace", "another-pw"));

  const state = await target.getState();
  assert.deepEqual(state.localRules, [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"] }]);
  assert.deepEqual(state.keywords, ["av"]);
  assert.deepEqual(state.keywordExempt, ["github.com"]);
  assert.deepEqual(await target.getShutdown(), { enabled: true, delaySeconds: 0 });
  assert.equal(await target.verify("another-pw"), true); // the password is untouched
});

test("import needs the password and changes nothing without it", async () => {
  const { store } = await createStore("pw123");
  const result = await store.importSettings(file({ keywords: ["casino"] }), "merge", "wrong");

  assert.equal(result, false);
  assert.deepEqual((await store.getState()).keywords, []);
});

test("an invalid file throws and changes nothing, even when part of it is fine", async () => {
  const { store } = await createStore("pw123");
  await store.addKeyword("keep");

  await assert.rejects(() =>
    store.importSettings(file({ keywords: ["casino"], localRules: [{ domain: "not a domain", mode: "blockAll" }] }), "replace", "pw123"),
  );

  const state = await store.getState();
  assert.deepEqual(state.keywords, ["keep"]);
  assert.deepEqual(state.localRules, []);
});

test("merge adds the file's items and never removes or overwrites existing ones", async () => {
  const { store } = await createStore("pw123");
  await store.addRule("a.com", "blockAll", []);
  await store.addKeyword("one1");

  await store.importSettings(
    file({
      localRules: [
        { domain: "a.com", mode: "blockExcept", allowPaths: ["/loosened"] }, // already present: existing wins
        { domain: "b.com", mode: "blockAll" },
      ],
      keywords: ["one1", "two2"],
    }),
    "merge",
    "pw123",
  );

  const state = await store.getState();
  assert.deepEqual(state.localRules.map((r) => [r.domain, r.mode]), [["a.com", "blockAll"], ["b.com", "blockAll"]]);
  assert.deepEqual(state.keywords, ["one1", "two2"]);
});

test("merge keeps shutdown and redirect settings that are already on", async () => {
  const { store } = await createStore("pw123");
  await store.enableShutdown(30);
  await store.enableRedirect("wikipedia.org");

  await store.importSettings(
    file({ shutdown: { enabled: false, delaySeconds: 600 }, redirect: { enabled: true, url: "example.com" } }),
    "merge",
    "pw123",
  );

  assert.deepEqual(await store.getShutdown(), { enabled: true, delaySeconds: 30 });
  assert.equal((await store.getRedirect()).url, "https://wikipedia.org/");
});

test("merge turns shutdown and redirect on when they were off and the file has them on", async () => {
  const { store } = await createStore("pw123");

  await store.importSettings(
    file({ shutdown: { enabled: true, delaySeconds: 20 }, redirect: { enabled: true, url: "example.com" } }),
    "merge",
    "pw123",
  );

  assert.deepEqual(await store.getShutdown(), { enabled: true, delaySeconds: 20 });
  assert.deepEqual(await store.getRedirect(), { enabled: true, url: "https://example.com/" });
});

test("replace makes the settings match the file, including removing items", async () => {
  const { store } = await createStore("pw123");
  await store.addRule("old.com", "blockAll", []);
  await store.addKeyword("old1");
  await store.enableShutdown(30);

  await store.importSettings(file({ keywords: ["new1"], shutdown: { enabled: false, delaySeconds: 15 } }), "replace", "pw123");

  const state = await store.getState();
  assert.deepEqual(state.localRules, []);
  assert.deepEqual(state.keywords, ["new1"]);
  assert.equal((await store.getShutdown()).enabled, false);
});

test("an import whose redirect target would be blocked is rejected as a whole", async () => {
  const { store } = await createStore("pw123");

  await assert.rejects(() =>
    store.importSettings(
      file({
        localRules: [{ domain: "wikipedia.org", mode: "blockAll" }],
        redirect: { enabled: true, url: "https://en.wikipedia.org/" },
      }),
      "replace",
      "pw123",
    ),
  );

  const state = await store.getState();
  assert.deepEqual(state.localRules, []);
  assert.equal((await store.getRedirect()).enabled, false);
});

test("an unknown import mode is rejected", async () => {
  const { store } = await createStore("pw123");
  await assert.rejects(() => store.importSettings(file(), "wipe", "pw123"), /mode/i);
});

test("import without any password set is refused", async () => {
  const { store } = await createStore(null);
  assert.equal(await store.importSettings(file({ keywords: ["casino"] }), "merge", "anything"), false);
});

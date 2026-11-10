import { test } from "node:test";
import assert from "node:assert/strict";
import { FOCUS_SCOPES, focusStatusText, needsPasswordToChange, rulesApplyNow, strictest } from "../src/focus.js";
import { BlockStore } from "../src/store.js";
import { parseSettings } from "../src/settingsFile.js";

const MON_10 = new Date(2026, 10, 9, 10, 0); // Monday 10:00
const NOW = MON_10.getTime();
const workdays = { id: "s", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
const file = (patch = {}) => ({ app: "SiteBlocker", version: 1, ...patch });

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

test("there are three scopes: always, focus and off", () => {
  assert.deepEqual([...FOCUS_SCOPES].sort(), ["always", "focus", "off"]);
});

test("with the off scope no rule ever applies, whatever focus mode is doing", () => {
  const focus = { scope: "off", manualOn: true, schedules: [workdays], ranges: [] };
  assert.equal(rulesApplyNow(focus, MON_10), false);
  assert.equal(rulesApplyNow({ ...focus, manualOn: false, schedules: [] }, MON_10), false);
});

test("the status text says blocking is off", () => {
  const text = focusStatusText({ scope: "off", manualOn: true, schedules: [], ranges: [] }, MON_10);
  assert.match(text, /blocking is off/i);
  assert.match(text, /not applied/i);
});

test("a stricter scope is ordered above a looser one: always, then focus, then off", () => {
  assert.equal(strictest("always", "focus"), "always");
  assert.equal(strictest("focus", "off"), "focus");
  assert.equal(strictest("off", "always"), "always");
  assert.equal(strictest("off", "off"), "off");
});

test("moving to a looser scope needs the password, moving to a stricter or the same one does not", () => {
  const needs = [
    ["always", "focus"],
    ["always", "off"],
    ["focus", "off"],
  ];
  const free = [
    ["focus", "always"],
    ["off", "focus"],
    ["off", "always"],
    ["always", "always"],
    ["focus", "focus"],
    ["off", "off"],
  ];
  for (const [from, to] of needs) assert.equal(needsPasswordToChange(from, to), true, `${from} -> ${to}`);
  for (const [from, to] of free) assert.equal(needsPasswordToChange(from, to), false, `${from} -> ${to}`);
});

test("needsPasswordToChange rejects an unknown scope", () => {
  assert.throws(() => needsPasswordToChange("always", "sometimes"));
  assert.throws(() => needsPasswordToChange("never", "off"));
});

test("turning blocking off needs the password, from always and from focus", async () => {
  const fromAlways = await createStore("pw123");
  assert.equal(await fromAlways.setFocusScope("off", "wrong"), false);
  assert.equal((await fromAlways.getFocus(NOW)).scope, "always");
  assert.equal(await fromAlways.setFocusScope("off", "pw123"), true);
  assert.equal((await fromAlways.getFocus(NOW)).scope, "off");

  const fromFocus = await createStore("pw123");
  await fromFocus.setFocusScope("focus", "pw123");
  assert.equal(await fromFocus.setFocusScope("off"), false); // no password given
  assert.equal(await fromFocus.setFocusScope("off", "pw123"), true);
});

test("turning blocking back on is free, to focus or to always", async () => {
  const store = await createStore("pw123");
  await store.setFocusScope("off", "pw123");

  assert.equal(await store.setFocusScope("focus"), true);
  assert.equal((await store.getFocus(NOW)).scope, "focus");

  await store.setFocusScope("off", "pw123");
  assert.equal(await store.setFocusScope("always"), true);
  assert.equal((await store.getFocus(NOW)).scope, "always");
});

test("the off scope is kept when the focus state is read back", async () => {
  const store = await createStore("pw123");
  await store.setFocusScope("off", "pw123");
  await store.startFocus();
  assert.equal((await store.getFocus(NOW)).scope, "off");
  assert.equal(await store.rulesApplyNow(MON_10), false);
});

test("a stored value that is not a known scope reads as always", async () => {
  const storage = memoryStorage();
  storage.data.focus = { scope: "bogus", manualOn: false, schedules: [], ranges: [] };
  assert.equal((await new BlockStore(storage).getFocus(NOW)).scope, "always");
});

test("a settings file may use any of the three scopes and rejects others", () => {
  for (const scope of ["always", "focus", "off"]) assert.equal(parseSettings(file({ focus: { scope } })).focus.scope, scope);
  assert.throws(() => parseSettings(file({ focus: { scope: "never" } })), /scope/i);
});

test("import merge keeps the stricter of the current and the imported scope", async () => {
  const expected = {
    "always/always": "always",
    "always/focus": "always",
    "always/off": "always",
    "focus/always": "always",
    "focus/focus": "focus",
    "focus/off": "focus",
    "off/always": "always",
    "off/focus": "focus",
    "off/off": "off",
  };

  for (const [pair, wanted] of Object.entries(expected)) {
    const [current, incoming] = pair.split("/");
    const store = await createStore("pw123");
    if (current !== "always") {
      await store.setFocusScope(current === "off" ? "off" : "focus", "pw123");
    }
    await store.importSettings(file({ focus: { scope: incoming } }), "merge", "pw123", NOW);
    assert.equal((await store.getFocus(NOW)).scope, wanted, pair);
  }
});

test("import replace takes the file's scope, even a looser one", async () => {
  const store = await createStore("pw123");
  await store.importSettings(file({ focus: { scope: "off" } }), "replace", "pw123", NOW);
  assert.equal((await store.getFocus(NOW)).scope, "off");
});

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

const NOW = new Date(2026, 10, 9, 10, 0).getTime(); // Monday 2026-11-09 10:00
const HOUR = 3_600_000;
const schedule = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
const file = (patch = {}) => ({ app: "SiteBlocker", version: 1, ...patch });

test("focus mode is off by default and rules always apply", async () => {
  const store = await createStore();
  assert.deepEqual(await store.getFocus(NOW), { scope: "always", manualOn: false, schedules: [], ranges: [] });
  assert.equal(await store.rulesApplyNow(new Date(NOW)), true);
});

test("one click starts focus mode, and ending it needs the password", async () => {
  const store = await createStore("pw123");
  await store.startFocus();
  assert.equal((await store.getFocus(NOW)).manualOn, true);

  assert.equal(await store.stopFocus("wrong"), false);
  assert.equal((await store.getFocus(NOW)).manualOn, true);

  assert.equal(await store.stopFocus("pw123"), true);
  assert.equal((await store.getFocus(NOW)).manualOn, false);
});

test("ending focus mode when it is not on returns false", async () => {
  const store = await createStore("pw123");
  assert.equal(await store.stopFocus("pw123"), false);
});

test("switching rules to 'only during focus mode' needs the password, switching back is free", async () => {
  const store = await createStore("pw123");

  assert.equal(await store.setFocusScope("focus", "wrong"), false);
  assert.equal((await store.getFocus(NOW)).scope, "always");

  assert.equal(await store.setFocusScope("focus", "pw123"), true);
  assert.equal((await store.getFocus(NOW)).scope, "focus");

  assert.equal(await store.setFocusScope("always"), true); // stricter: no password
  assert.equal((await store.getFocus(NOW)).scope, "always");
});

test("setting the scope it already has is a no-op that needs no password", async () => {
  const store = await createStore("pw123");
  assert.equal(await store.setFocusScope("always"), true);
});

test("an unknown scope is rejected", async () => {
  const store = await createStore();
  await assert.rejects(() => store.setFocusScope("sometimes", "pw123"));
});

test("with the focus scope, rules apply only while focus mode is active", async () => {
  const store = await createStore("pw123");
  await store.setFocusScope("focus", "pw123");
  assert.equal(await store.rulesApplyNow(new Date(NOW)), false);

  await store.startFocus();
  assert.equal(await store.rulesApplyNow(new Date(NOW)), true);
});

test("a weekly schedule can be added for free and is stored with an id", async () => {
  const store = await createStore();
  const added = await store.addFocusSchedule({ days: [5, 1, 3], start: "09:00", end: "17:00" });

  assert.equal(typeof added.id, "string");
  const { schedules } = await store.getFocus(NOW);
  assert.deepEqual(schedules, [{ id: added.id, days: [1, 3, 5], start: "09:00", end: "17:00" }]);
});

test("a schedule that is not valid, or that is already in the list, is rejected", async () => {
  const store = await createStore();
  await assert.rejects(() => store.addFocusSchedule({ days: [], start: "09:00", end: "17:00" }));
  await store.addFocusSchedule(schedule);
  await assert.rejects(() => store.addFocusSchedule({ ...schedule, days: [5, 4, 3, 2, 1] }), /already/);
});

test("removing a schedule needs the password", async () => {
  const store = await createStore("pw123");
  const { id } = await store.addFocusSchedule(schedule);

  assert.equal(await store.removeFocusSchedule(id, "wrong"), false);
  assert.equal((await store.getFocus(NOW)).schedules.length, 1);

  assert.equal(await store.removeFocusSchedule(id, "pw123"), true);
  assert.equal((await store.getFocus(NOW)).schedules.length, 0);
  assert.equal(await store.removeFocusSchedule(id, "pw123"), false);
});

test("a one-time range can be added for free", async () => {
  const store = await createStore();
  const added = await store.addFocusRange({ start: NOW, end: NOW + 2 * HOUR }, NOW);
  assert.deepEqual((await store.getFocus(NOW)).ranges, [{ id: added.id, start: NOW, end: NOW + 2 * HOUR }]);
});

test("a range that has already ended, or ends before it starts, is rejected", async () => {
  const store = await createStore();
  await assert.rejects(() => store.addFocusRange({ start: NOW - 2 * HOUR, end: NOW - HOUR }, NOW), /over/i);
  await assert.rejects(() => store.addFocusRange({ start: NOW + HOUR, end: NOW }, NOW));
});

test("a range that has started but not ended is accepted", async () => {
  const store = await createStore();
  await store.addFocusRange({ start: NOW - HOUR, end: NOW + HOUR }, NOW);
  assert.equal((await store.getFocus(NOW)).ranges.length, 1);
});

test("removing a range needs the password", async () => {
  const store = await createStore("pw123");
  const { id } = await store.addFocusRange({ start: NOW, end: NOW + HOUR }, NOW);

  assert.equal(await store.removeFocusRange(id, "wrong", NOW), false);
  assert.equal(await store.removeFocusRange(id, "pw123", NOW), true);
  assert.equal((await store.getFocus(NOW)).ranges.length, 0);
});

test("ranges that have ended disappear on their own", async () => {
  const store = await createStore();
  await store.addFocusRange({ start: NOW, end: NOW + HOUR }, NOW);
  assert.equal((await store.getFocus(NOW + 30 * 60_000)).ranges.length, 1);
  assert.equal((await store.getFocus(NOW + HOUR)).ranges.length, 0);
});

test("with the focus scope a range turns rules on and off by itself", async () => {
  const store = await createStore("pw123");
  await store.setFocusScope("focus", "pw123");
  await store.addFocusRange({ start: NOW, end: NOW + 2 * HOUR }, NOW);

  assert.equal(await store.rulesApplyNow(new Date(NOW + HOUR)), true);
  assert.equal(await store.rulesApplyNow(new Date(NOW + 3 * HOUR)), false);
});

// --- backup -----------------------------------------------------------------------------------------------

test("a settings file without a focus section means the defaults", () => {
  assert.deepEqual(parseSettings(file()).focus, { scope: "always", schedules: [], ranges: [] });
});

test("focus settings survive export and parse, without ids and without the manual switch", async () => {
  const store = await createStore("pw123");
  await store.setFocusScope("focus", "pw123");
  await store.startFocus();
  await store.addFocusSchedule(schedule);
  await store.addFocusRange({ start: NOW, end: NOW + HOUR }, NOW);

  const exported = await store.exportSettings(NOW);
  assert.deepEqual(exported.focus, {
    scope: "focus",
    schedules: [schedule],
    ranges: [{ start: NOW, end: NOW + HOUR }],
  });
  assert.equal(JSON.stringify(exported.focus).includes("manualOn"), false);
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(exported))).focus, exported.focus);
});

test("bad focus sections in a file are rejected", () => {
  const cases = [
    null,
    "on",
    { scope: "sometimes" },
    { scope: "focus", schedules: "x" },
    { scope: "focus", schedules: [{ days: [], start: "09:00", end: "17:00" }] },
    { scope: "focus", ranges: [{ start: 5, end: 1 }] },
    { scope: "focus", ranges: "x" },
  ];
  for (const focus of cases) {
    assert.throws(() => parseSettings(file({ focus })), /focus/i, JSON.stringify(focus));
  }
});

test("import merge adds schedules and ranges, never removes, and keeps the stricter scope", async () => {
  const store = await createStore("pw123");
  await store.addFocusSchedule({ days: [6], start: "10:00", end: "12:00" });

  await store.importSettings(
    file({
      focus: {
        scope: "focus",
        schedules: [schedule, { days: [6], start: "10:00", end: "12:00" }],
        ranges: [{ start: NOW, end: NOW + HOUR }],
      },
    }),
    "merge",
    "pw123",
    NOW,
  );

  const focus = await store.getFocus(NOW);
  assert.equal(focus.scope, "always"); // the user's current, stricter scope wins
  assert.equal(focus.schedules.length, 2); // the duplicate was not added twice
  assert.equal(focus.ranges.length, 1);
});

test("import replace takes the file's scope, schedules and ranges, and leaves the manual switch alone", async () => {
  const store = await createStore("pw123");
  await store.startFocus();
  await store.addFocusSchedule({ days: [6], start: "10:00", end: "12:00" });

  await store.importSettings(file({ focus: { scope: "focus", schedules: [schedule], ranges: [] } }), "replace", "pw123", NOW);

  const focus = await store.getFocus(NOW);
  assert.equal(focus.scope, "focus");
  assert.deepEqual(focus.schedules.map(({ id, ...rest }) => rest), [schedule]);
  assert.equal(focus.manualOn, true);
});

test("ranges that have already ended are not imported", async () => {
  const store = await createStore("pw123");
  await store.importSettings(
    file({ focus: { scope: "focus", ranges: [{ start: NOW - 2 * HOUR, end: NOW - HOUR }, { start: NOW, end: NOW + HOUR }] } }),
    "replace",
    "pw123",
    NOW,
  );
  assert.equal((await store.getFocus(NOW)).ranges.length, 1);
});

test("buildExport includes the focus section", () => {
  const out = buildExport({
    localRules: [],
    keywords: [],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    focus: { scope: "focus", schedules: [], ranges: [] },
  });
  assert.equal(out.focus.scope, "focus");
});

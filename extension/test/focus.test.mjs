import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeSources,
  focusStatusText,
  isFocusActive,
  parseTime,
  rulesApplyNow,
  validateRange,
  validateSchedule,
} from "../src/focus.js";

// 2026-11-09 is a Monday. JS days: 0 = Sunday ... 6 = Saturday.
const at = (day, hour, minute = 0) => new Date(2026, 10, 8 + day, hour, minute); // day 1 = Mon 9 Nov ... 7 = Sun 15 Nov (and 0 = Sun 8 Nov)
const MON = 1, TUE = 2, THU = 4, FRI = 5, SAT = 6;

const emptyFocus = (patch = {}) => ({ scope: "focus", manualOn: false, schedules: [], ranges: [], ...patch });
const workdays = { id: "s1", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
const overnight = { id: "s2", days: [5], start: "22:00", end: "06:00" }; // Fridays 22:00 until Saturday 06:00

test("parseTime reads HH:MM into minutes", () => {
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime("09:30"), 570);
  assert.equal(parseTime("23:59"), 1439);
});

test("parseTime rejects anything else", () => {
  for (const bad of ["", "9:00", "24:00", "09:60", "ab:cd", "0900", "09:00:00", null, undefined, 900]) {
    assert.equal(parseTime(bad), null, String(bad));
  }
});

test("validateSchedule normalizes days and keeps the times", () => {
  assert.deepEqual(validateSchedule({ days: [5, 1, 1, 3], start: "09:00", end: "17:00" }), {
    days: [1, 3, 5],
    start: "09:00",
    end: "17:00",
  });
});

test("validateSchedule accepts an overnight schedule", () => {
  assert.deepEqual(validateSchedule({ days: [5], start: "22:00", end: "06:00" }).end, "06:00");
});

test("validateSchedule rejects bad input", () => {
  const good = { days: [1], start: "09:00", end: "17:00" };
  for (const bad of [
    null,
    "x",
    { ...good, days: [] },
    { ...good, days: [7] },
    { ...good, days: [-1] },
    { ...good, days: [1.5] },
    { ...good, days: "1" },
    { ...good, start: "9:00" },
    { ...good, end: "25:00" },
    { ...good, start: "09:00", end: "09:00" },
  ]) {
    assert.throws(() => validateSchedule(bad), JSON.stringify(bad));
  }
});

test("validateRange keeps start and end when the end is later", () => {
  assert.deepEqual(validateRange({ start: 1000, end: 2000 }), { start: 1000, end: 2000 });
});

test("validateRange rejects bad input", () => {
  for (const bad of [null, "x", { start: 2000, end: 1000 }, { start: 1000, end: 1000 }, { start: "a", end: 5 }, { start: NaN, end: 5 }, { start: 1 }]) {
    assert.throws(() => validateRange(bad), JSON.stringify(bad));
  }
});

test("manual focus is active at any time", () => {
  assert.equal(isFocusActive(emptyFocus({ manualOn: true }), at(MON, 3)), true);
  assert.equal(isFocusActive(emptyFocus(), at(MON, 3)), false);
});

test("a weekly schedule is active inside its window, including the start and excluding the end", () => {
  const focus = emptyFocus({ schedules: [workdays] });
  assert.equal(isFocusActive(focus, at(MON, 10)), true);
  assert.equal(isFocusActive(focus, at(MON, 9, 0)), true);
  assert.equal(isFocusActive(focus, at(MON, 8, 59)), false);
  assert.equal(isFocusActive(focus, at(MON, 16, 59)), true);
  assert.equal(isFocusActive(focus, at(MON, 17, 0)), false);
});

test("a weekly schedule is off on days it does not list", () => {
  const focus = emptyFocus({ schedules: [workdays] });
  assert.equal(isFocusActive(focus, at(SAT, 10)), false);
  assert.equal(isFocusActive(focus, at(7, 10)), false); // Sunday
});

test("an overnight schedule runs past midnight into the next day", () => {
  const focus = emptyFocus({ schedules: [overnight] });
  assert.equal(isFocusActive(focus, at(FRI, 21, 59)), false);
  assert.equal(isFocusActive(focus, at(FRI, 22, 0)), true);
  assert.equal(isFocusActive(focus, at(FRI, 23, 30)), true);
  assert.equal(isFocusActive(focus, at(SAT, 3)), true); // Friday's schedule, after midnight
  assert.equal(isFocusActive(focus, at(SAT, 6, 0)), false);
  assert.equal(isFocusActive(focus, at(SAT, 7)), false);
});

test("an overnight schedule does not run in the morning of a day whose previous day is not listed", () => {
  const focus = emptyFocus({ schedules: [overnight] });
  assert.equal(isFocusActive(focus, at(FRI, 5)), false); // belongs to Thursday, which is not listed
  assert.equal(isFocusActive(emptyFocus({ schedules: [{ ...overnight, days: [THU] }] }), at(FRI, 5)), true);
});

test("a one-time range is active from its start up to, not including, its end", () => {
  const start = at(MON, 14).getTime();
  const end = at(MON, 16).getTime();
  const focus = emptyFocus({ ranges: [{ id: "r1", start, end }] });

  assert.equal(isFocusActive(focus, new Date(start - 1)), false);
  assert.equal(isFocusActive(focus, new Date(start)), true);
  assert.equal(isFocusActive(focus, at(MON, 15)), true);
  assert.equal(isFocusActive(focus, new Date(end)), false);
});

test("any one of manual, schedule and range makes focus active", () => {
  const focus = emptyFocus({ schedules: [workdays], ranges: [{ id: "r", start: at(SAT, 10).getTime(), end: at(SAT, 12).getTime() }] });
  assert.equal(isFocusActive(focus, at(MON, 10)), true); // schedule
  assert.equal(isFocusActive(focus, at(SAT, 11)), true); // range
  assert.equal(isFocusActive(focus, at(SAT, 13)), false);
});

test("rules always apply when the scope is always, whatever focus mode is doing", () => {
  assert.equal(rulesApplyNow(emptyFocus({ scope: "always" }), at(MON, 3)), true);
  assert.equal(rulesApplyNow(emptyFocus({ scope: "always", manualOn: true }), at(MON, 3)), true);
});

test("with the focus scope, rules apply only while focus mode is active", () => {
  const focus = emptyFocus({ schedules: [workdays] });
  assert.equal(rulesApplyNow(focus, at(MON, 10)), true);
  assert.equal(rulesApplyNow(focus, at(MON, 20)), false);
  assert.equal(rulesApplyNow(emptyFocus({ manualOn: true }), at(MON, 20)), true);
});

test("activeSources lists what is keeping focus mode on", () => {
  const range = { id: "r1", start: at(MON, 9).getTime(), end: at(MON, 12).getTime() };
  const focus = emptyFocus({ manualOn: true, schedules: [workdays], ranges: [range] });

  assert.deepEqual(activeSources(focus, at(MON, 10)).map((s) => s.type), ["manual", "schedule", "range"]);
  assert.deepEqual(activeSources(focus, at(MON, 13)).map((s) => s.type), ["manual", "schedule"]);
  assert.deepEqual(activeSources(emptyFocus(), at(MON, 10)), []);
});

test("the status text says what is going on in plain words", () => {
  assert.match(focusStatusText(emptyFocus({ scope: "always" }), at(MON, 10)), /always apply/i);
  assert.match(focusStatusText(emptyFocus(), at(MON, 10)), /focus mode is off/i);
  assert.match(focusStatusText(emptyFocus({ manualOn: true }), at(MON, 10)), /focus mode is on.*started by you/i);
  assert.match(focusStatusText(emptyFocus({ schedules: [workdays] }), at(MON, 10)), /focus mode is on.*09:00.*17:00/i);
  assert.match(focusStatusText(emptyFocus({ ranges: [{ id: "r", start: at(MON, 9).getTime(), end: at(MON, 12).getTime() }] }), at(MON, 10)), /focus mode is on.*until/i);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { combineDateTime, defaultRange, toDateInput, toTimeInput } from "../src/focus.js";

const HOUR = 3_600_000;

test("toDateInput and toTimeInput give the values a date and a time picker expect, with padding", () => {
  const date = new Date(2026, 0, 5, 7, 3).getTime();
  assert.equal(toDateInput(date), "2026-01-05");
  assert.equal(toTimeInput(date), "07:03");
});

test("combineDateTime turns a date and a time into local epoch milliseconds", () => {
  assert.equal(combineDateTime("2026-11-09", "14:30"), new Date(2026, 10, 9, 14, 30).getTime());
  assert.equal(combineDateTime("2026-01-01", "00:00"), new Date(2026, 0, 1, 0, 0).getTime());
  assert.equal(combineDateTime("2026-12-31", "23:59"), new Date(2026, 11, 31, 23, 59).getTime());
});

test("combineDateTime gives NaN for anything that is not a real date and time", () => {
  for (const [date, time] of [
    ["", "10:00"],
    ["2026-11-09", ""],
    ["2026-13-01", "10:00"], // no month 13
    ["2026-02-30", "10:00"], // no 30 February
    ["09/11/2026", "10:00"],
    ["2026-11-09", "25:00"],
    ["2026-11-09", "9:00"],
    [null, "10:00"],
    ["2026-11-09", undefined],
  ]) {
    assert.ok(Number.isNaN(combineDateTime(date, time)), `${date} ${time}`);
  }
});

test("a date and time read back from a timestamp round trip", () => {
  const start = new Date(2026, 5, 15, 9, 45).getTime();
  assert.equal(combineDateTime(toDateInput(start), toTimeInput(start)), start);
});

test("defaultRange starts at the next five minutes and lasts an hour", () => {
  const range = defaultRange(new Date(2026, 10, 9, 14, 3, 40));
  assert.deepEqual(range, { startDate: "2026-11-09", startTime: "14:05", endDate: "2026-11-09", endTime: "15:05" });
});

test("defaultRange keeps a time that is already on a five minute mark", () => {
  const range = defaultRange(new Date(2026, 10, 9, 14, 0, 0));
  assert.equal(range.startTime, "14:00");
  assert.equal(range.endTime, "15:00");
});

test("defaultRange rolls over midnight into the next day", () => {
  const range = defaultRange(new Date(2026, 10, 9, 23, 58));
  assert.deepEqual(range, { startDate: "2026-11-10", startTime: "00:00", endDate: "2026-11-10", endTime: "01:00" });
});

test("the default range is a valid range an hour long", () => {
  const range = defaultRange(new Date(2026, 10, 9, 14, 3));
  const start = combineDateTime(range.startDate, range.startTime);
  const end = combineDateTime(range.endDate, range.endTime);
  assert.equal(end - start, HOUR);
});

// --- the options page markup ---------------------------------------------------------------------------------

const page = () => new JSDOM(readFileSync(new URL("../src/options.html", import.meta.url), "utf8")).window.document;

test("the day buttons are in a fixed row, Monday first and Sunday last", () => {
  const document = page();
  const days = [...document.querySelectorAll(".days .focusDay")];

  assert.deepEqual(days.map((box) => box.value), ["1", "2", "3", "4", "5", "6", "0"]);
  assert.deepEqual(days.map((box) => box.nextElementSibling.textContent), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.ok(days.every((box) => box.type === "checkbox"));
});

test("there are shortcuts for weekdays, the weekend and every day", () => {
  const document = page();
  const presets = Object.fromEntries([...document.querySelectorAll("[data-days]")].map((button) => [button.textContent.trim(), button.dataset.days]));
  assert.deepEqual(presets, { Weekdays: "1,2,3,4,5", Weekend: "6,0", "Every day": "1,2,3,4,5,6,0" });
});

test("a one-time range uses a date picker and a time picker for both ends, without seconds", () => {
  const document = page();
  for (const id of ["rangeStartDate", "rangeEndDate"]) assert.equal(document.getElementById(id).type, "date", id);
  for (const id of ["rangeStartTime", "rangeEndTime"]) {
    const input = document.getElementById(id);
    assert.equal(input.type, "time", id);
    assert.equal(input.getAttribute("step"), "60", id);
  }
});

test("schedule times have no seconds either", () => {
  const document = page();
  for (const id of ["schedStart", "schedEnd"]) assert.equal(document.getElementById(id).getAttribute("step"), "60", id);
});

test("every date and time input has an accessible name", () => {
  const document = page();
  for (const id of ["rangeStartDate", "rangeStartTime", "rangeEndDate", "rangeEndTime"]) {
    assert.ok(document.getElementById(id).getAttribute("aria-label"), id);
  }
});

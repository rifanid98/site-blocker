import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const page = () => new JSDOM(readFileSync(new URL("../src/options.html", import.meta.url), "utf8")).window.document;
const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

const comesBefore = (first, second) => Boolean(first.compareDocumentPosition(second) & FOLLOWING);

test("a Clear button sits right after the Every day button, in the same row as the shortcuts", () => {
  const document = page();
  const shortcuts = [...document.querySelectorAll("[data-days]")];
  const everyDay = shortcuts.find((button) => button.textContent.trim() === "Every day");
  const clear = document.getElementById("clearDays");

  assert.ok(clear, "the Clear button exists");
  assert.equal(everyDay.nextElementSibling, clear);
  assert.equal(clear.parentElement, everyDay.parentElement);
  assert.match(clear.textContent, /^\s*clear\s*$/i);
});

test("Clear is not a day shortcut, so it can never tick a day by mistake", () => {
  const clear = page().getElementById("clearDays");
  assert.equal(clear.hasAttribute("data-days"), false);
  assert.equal(clear.type, "button");
});

test("Clear is a quiet shortcut like the others, not the main action", () => {
  const clear = page().getElementById("clearDays");
  assert.ok(clear.classList.contains("secondary"));
  assert.ok(clear.classList.contains("small"));
});

test("the other shortcuts are unchanged: weekdays, weekend and every day", () => {
  const document = page();
  const presets = Object.fromEntries([...document.querySelectorAll("[data-days]")].map((button) => [button.textContent.trim(), button.dataset.days]));
  assert.deepEqual(presets, { Weekdays: "1,2,3,4,5", Weekend: "6,0", "Every day": "1,2,3,4,5,6,0" });
});

test("the form keeps its order: days, then the shortcuts, then the times with Add schedule", () => {
  const document = page();
  const firstDay = document.querySelector(".days .focusDay");
  const everyDay = [...document.querySelectorAll("[data-days]")].find((button) => button.textContent.trim() === "Every day");
  const start = document.getElementById("schedStart");
  const end = document.getElementById("schedEnd");
  const add = document.getElementById("addSchedule");

  assert.ok(comesBefore(firstDay, everyDay));
  assert.ok(comesBefore(everyDay, start));
  assert.ok(comesBefore(start, end));
  assert.ok(comesBefore(end, add));
});

test("Add schedule stays with the time boxes, not in the shortcut row", () => {
  const document = page();
  const add = document.getElementById("addSchedule");
  assert.ok(add.parentElement.contains(document.getElementById("schedStart")));
  assert.equal(add.parentElement.classList.contains("presets"), false);
  assert.equal(add.classList.contains("cta"), false);
});

test("the schedule form has one of each control", () => {
  const document = page();
  for (const id of ["addSchedule", "schedStart", "schedEnd", "clearDays"]) {
    assert.equal(document.querySelectorAll(`#${id}`).length, 1, id);
  }
  assert.equal(document.querySelectorAll(".days").length, 1);
  assert.equal(document.querySelectorAll(".presets").length, 1);
});

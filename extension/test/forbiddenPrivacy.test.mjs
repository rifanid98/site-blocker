import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { revealLabel, shouldBlur } from "../src/privacy.js";

test("only forbidden entries are blurred, and only until they are revealed", () => {
  assert.equal(shouldBlur(true, false), true);
  assert.equal(shouldBlur(true, true), false);
  assert.equal(shouldBlur(false, false), false);
  assert.equal(shouldBlur(undefined, false), false);
});

test("the reveal button says what it will do", () => {
  assert.equal(revealLabel(false), "Reveal forbidden entries");
  assert.equal(revealLabel(true), "Hide forbidden entries");
});

test("the options page has a reveal button for the site list and the keyword list, and a blur style", () => {
  const html = readFileSync(new URL("../src/options.html", import.meta.url), "utf8");
  const document = new JSDOM(html).window.document;
  for (const id of ["revealRules", "revealKeywords"]) {
    const button = document.getElementById(id);
    assert.ok(button, id);
    assert.equal(button.type, "button");
    assert.equal(button.hidden, true, "hidden until there is something forbidden");
  }
  assert.match(html, /\.blurred\s*\{[^}]*blur\(/);
  assert.match(html, /\.blurred\s*\{[^}]*user-select:\s*none/);
});

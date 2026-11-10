import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// The popup once showed a password box all the time: a class set `display: flex`, which beats the `hidden` attribute.
// Every element that carries `hidden` must really be hidden by the page's own stylesheet.
for (const page of ["src/popup.html", "src/options.html"]) {
  test(`every element marked hidden in ${page} is really hidden`, () => {
    const dom = new JSDOM(readFileSync(new URL(`../${page}`, import.meta.url), "utf8"));
    const { document } = dom.window;

    const hidden = [...document.querySelectorAll("[hidden]")];
    assert.ok(hidden.length > 0, "the page has hidden elements to check");

    const visible = hidden
      .filter((element) => dom.window.getComputedStyle(element).display !== "none")
      .map((element) => element.id || element.className || element.tagName);
    assert.deepEqual(visible, [], `shown despite hidden: ${visible.join(", ")}`);
  });
}

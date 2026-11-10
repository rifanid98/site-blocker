import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { BlockStore } from "../src/store.js";
import { findBlockReason } from "../src/matcher.js";
import { siteExemptModel } from "../src/popupModel.js";

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore() {
  const store = new BlockStore(memoryStorage());
  await store.setInitialPassword("pw123");
  await store.addKeyword("av");
  return store;
}

const url = "https://www.example.com/wave-4/branch";

// ---- store: exempt the site shown in the popup ----

test("exempting a page adds its host as a keyword exception, with the password", async () => {
  const store = await createStore();
  assert.deepEqual(await store.exemptSite(url, "example.com", "pw123"), { ok: true, host: "example.com" });

  const { rules, keywords, keywordExempt } = await store.getEffective();
  assert.deepEqual(keywordExempt, ["example.com"]);
  assert.equal(findBlockReason(url, rules, keywords, keywordExempt), null);
});

test("a wrong password adds nothing", async () => {
  const store = await createStore();
  assert.deepEqual(await store.exemptSite(url, "example.com", "nope"), { ok: false, error: "Wrong password. Nothing changed." });
  assert.deepEqual((await store.getEffective()).keywordExempt, []);
});

test("the exception must cover the page, so it cannot exempt some other site", async () => {
  const store = await createStore();
  const result = await store.exemptSite(url, "other.com", "pw123");
  assert.equal(result.ok, false);
  assert.match(result.error, /does not cover/i);
  assert.deepEqual((await store.getEffective()).keywordExempt, []);
});

test("a parent domain, an IP address, localhost and IPv6 are accepted", async () => {
  const store = await createStore();
  assert.equal((await store.exemptSite("https://a.b.example.com/av", "example.com", "pw123")).ok, true);
  assert.equal((await store.exemptSite("http://192.168.1.10:3000/av", "192.168.1.10", "pw123")).ok, true);
  assert.equal((await store.exemptSite("http://localhost:5173/av", "localhost", "pw123")).ok, true);
  assert.equal((await store.exemptSite("http://[::1]:3000/av", "[::1]", "pw123")).ok, true);
});

test("a bad host, a duplicate or a non-web address comes back as an error, not a crash", async () => {
  const store = await createStore();
  assert.equal((await store.exemptSite(url, "not a domain", "pw123")).ok, false);
  await store.exemptSite(url, "example.com", "pw123");
  const again = await store.exemptSite(url, "example.com", "pw123");
  assert.equal(again.ok, false);
  assert.match(again.error, /already/i);
  assert.equal((await store.exemptSite("chrome://settings", "settings", "pw123")).ok, false);
});

// ---- what the popup shows for the current tab ----

test("the popup offers the page's host without www, or the IP address as it is", () => {
  assert.deepEqual(siteExemptModel("https://www.GitHub.com/me/av", []), { host: "github.com", entry: null });
  assert.equal(siteExemptModel("http://192.168.1.10:3000/app", []).host, "192.168.1.10");
  assert.equal(siteExemptModel("http://localhost:3000/", []).host, "localhost");
  assert.equal(siteExemptModel("http://[::1]:3000/", []).host, "[::1]");
});

test("nothing is offered for pages that are not web addresses", () => {
  for (const bad of [undefined, "", "chrome://settings", "about:blank", "file:///c:/a.txt", "not a url"]) {
    assert.equal(siteExemptModel(bad, []), null, String(bad));
  }
});

test("a site already excepted shows the entry that covers it, so turning it off removes that entry", () => {
  assert.equal(siteExemptModel("https://github.com/x", ["github.com"]).entry, "github.com");
  assert.equal(siteExemptModel("https://gist.github.com/x", ["github.com"]).entry, "github.com");
  assert.equal(siteExemptModel("http://192.168.1.10:3000/", ["192.168.1.10"]).entry, "192.168.1.10");
  assert.equal(siteExemptModel("https://notgithub.com/", ["github.com"]).entry, null);
  assert.equal(siteExemptModel("http://192.168.1.10/", ["192.168.1.1"]).entry, null);
});

// ---- the toggle in the popup page ----

test("the popup page has a toggle for the current site, hidden until a site is known", () => {
  const document = new JSDOM(readFileSync(new URL("../src/popup.html", import.meta.url), "utf8")).window.document;
  const toggle = document.getElementById("siteToggle");
  assert.ok(toggle);
  assert.equal(toggle.type, "checkbox");
  assert.equal(document.getElementById("siteExempt").hidden, true);
  assert.ok(document.getElementById("siteHost"));
});

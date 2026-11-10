import { test } from "node:test";
import assert from "node:assert/strict";
import { matchKeywords, normalizeExemptHost, findBlockReason } from "../src/matcher.js";
import { BlockStore } from "../src/store.js";
import { buildExport, parseSettings } from "../src/settingsFile.js";

test("normalizeExemptHost accepts IPv4 addresses and drops the scheme, port and path", () => {
  assert.equal(normalizeExemptHost("192.168.1.10"), "192.168.1.10");
  assert.equal(normalizeExemptHost("http://192.168.1.10:3000/app?x=1"), "192.168.1.10");
  assert.equal(normalizeExemptHost("  10.0.0.1:8080 "), "10.0.0.1");
  assert.equal(normalizeExemptHost("127.0.0.1"), "127.0.0.1");
});

test("normalizeExemptHost accepts localhost in any case, with or without a port", () => {
  assert.equal(normalizeExemptHost("localhost"), "localhost");
  assert.equal(normalizeExemptHost("LOCALHOST:5173"), "localhost");
  assert.equal(normalizeExemptHost("http://localhost:3000/"), "localhost");
});

test("normalizeExemptHost accepts IPv6 addresses, bracketed or not, and keeps the brackets a URL host has", () => {
  assert.equal(normalizeExemptHost("[::1]"), "[::1]");
  assert.equal(normalizeExemptHost("::1"), "[::1]");
  assert.equal(normalizeExemptHost("[::1]:3000"), "[::1]");
  assert.equal(normalizeExemptHost("http://[::1]:3000/x"), "[::1]");
});

test("normalizeExemptHost still handles ordinary domains like before", () => {
  assert.equal(normalizeExemptHost("https://www.GitHub.com/me"), "github.com");
  assert.equal(normalizeExemptHost("example.com:8080/x"), "example.com");
});

test("normalizeExemptHost rejects things that are neither a domain, an IP address nor localhost", () => {
  for (const bad of ["", "   ", "not a domain", "999.1.1.1", "256.0.0.1", "1.2.3", "1.2.3.4.5", "[zzz]", "nodots", "1234567890"]) {
    assert.throws(() => normalizeExemptHost(bad), undefined, JSON.stringify(bad));
  }
  assert.throws(() => normalizeExemptHost(undefined));
  assert.throws(() => normalizeExemptHost(null));
});

test("an exempt IP address skips keyword detection, whatever the port", () => {
  assert.deepEqual(matchKeywords("http://192.168.1.10:3000/avatar", ["av", "19"], ["192.168.1.10"]), []);
  assert.deepEqual(matchKeywords("https://192.168.1.10/", ["19"], ["192.168.1.10"]), []);
});

test("an exempt IP address matches exactly, never as a suffix", () => {
  // 110.0.0.1 ends with "10.0.0.1" but is a different machine
  assert.deepEqual(matchKeywords("http://110.0.0.1/", ["10"], ["10.0.0.1"]), ["10"]);
  assert.deepEqual(matchKeywords("http://192.168.1.11/", ["19"], ["192.168.1.10"]), ["19"]);
});

test("an exempt localhost covers the host with any port", () => {
  assert.deepEqual(matchKeywords("http://localhost:3000/av", ["av"], ["localhost"]), []);
  assert.deepEqual(matchKeywords("http://notlocalhost.com/av", ["av"], ["localhost"]), ["av"]);
});

test("an exempt IPv6 address skips keyword detection", () => {
  assert.deepEqual(matchKeywords("http://[::1]:3000/casino", ["casino"], ["[::1]"]), []);
});

test("keywords in an IP address block it until the IP is exempt, and a site rule still applies after", () => {
  assert.deepEqual(findBlockReason("http://192.168.1.10:3000/", [], ["19"], []), { type: "keyword", keyword: "19" });
  assert.equal(findBlockReason("http://192.168.1.10:3000/", [], ["19"], ["192.168.1.10"]), null);
});

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

test("an IP address can be added as a keyword exception, with the password", async () => {
  const store = await createStore("pw123");

  assert.equal(await store.addKeywordExemption("192.168.1.10:3000", "wrong"), false);
  assert.deepEqual((await store.getState()).keywordExempt, []);

  assert.equal(await store.addKeywordExemption("192.168.1.10:3000", "pw123"), true);
  assert.deepEqual((await store.getState()).keywordExempt, ["192.168.1.10"]);
});

test("localhost and IPv6 can be added too", async () => {
  const store = await createStore("pw123");
  await store.addKeywordExemption("localhost:5173", "pw123");
  await store.addKeywordExemption("::1", "pw123");
  assert.deepEqual((await store.getState()).keywordExempt, ["localhost", "[::1]"]);
});

test("a duplicate IP is rejected, even when typed differently", async () => {
  const store = await createStore("pw123");
  await store.addKeywordExemption("192.168.1.10", "pw123");
  await assert.rejects(() => store.addKeywordExemption("http://192.168.1.10:8080/x", "pw123"));
});

test("an invalid host is still rejected", async () => {
  const store = await createStore("pw123");
  await assert.rejects(() => store.addKeywordExemption("999.1.1.1", "pw123"));
  await assert.rejects(() => store.addKeywordExemption("not a domain", "pw123"));
});

test("removing an IP exception is free and accepts the same kind of input", async () => {
  const store = await createStore("pw123");
  await store.addKeywordExemption("192.168.1.10", "pw123");

  assert.equal(await store.removeKeywordExemption("192.168.1.10:3000"), true);
  assert.deepEqual((await store.getState()).keywordExempt, []);
  assert.equal(await store.removeKeywordExemption("192.168.1.10"), false);
});

test("IP and localhost exceptions survive export and import", () => {
  const settings = {
    localRules: [],
    keywords: ["19"],
    forbiddenKeywords: [],
    keywordExempt: ["192.168.1.10", "localhost", "[::1]", "github.com"],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("a settings file with an invalid exception host is rejected", () => {
  assert.throws(() => parseSettings({ app: "SiteBlocker", version: 1, keywordExempt: ["999.1.1.1"] }), /999/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, parseSettings, MAX_ITEMS } from "../src/settingsFile.js";

const valid = () => ({
  app: "SiteBlocker",
  version: 1,
  localRules: [{ domain: "Facebook.com", mode: "blockExcept", allowPaths: ["marketplace*", " /ok "] }],
  keywords: ["Casino", "casino", "av"],
  keywordExempt: ["https://www.github.com/me"],
  shutdown: { enabled: true, delaySeconds: 0 },
  redirect: { enabled: true, url: "wikipedia.org" },
});

test("buildExport wraps the settings with app, version and date, and leaves out secrets", () => {
  const out = buildExport(
    {
      localRules: [{ domain: "a.com", mode: "blockAll", allowPaths: [] }],
      keywords: ["x1"],
      keywordExempt: ["github.com"],
      shutdown: { enabled: false, delaySeconds: 15 },
      redirect: { enabled: false, url: "" },
      passwordHash: "should-not-appear",
      appRules: [{ domain: "app.com", mode: "blockAll", allowPaths: [] }],
    },
    new Date("2026-11-09T10:00:00Z"),
  );

  assert.equal(out.app, "SiteBlocker");
  assert.equal(out.version, 1);
  assert.equal(out.exportedAt, "2026-11-09T10:00:00.000Z");
  assert.deepEqual(out.keywords, ["x1"]);
  assert.equal("passwordHash" in out, false);
  assert.equal("appRules" in out, false);
});

test("an export parses back to the same settings", () => {
  const settings = {
    localRules: [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"] }],
    keywords: ["av"],
    forbiddenKeywords: [],
    keywordExempt: ["github.com"],
    shutdown: { enabled: true, delaySeconds: 30 },
    redirect: { enabled: true, url: "https://wikipedia.org/" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  };
  assert.deepEqual(parseSettings(buildExport(settings)), settings);
});

test("parseSettings normalizes domains, keywords, paths and urls, and removes duplicates", () => {
  const parsed = parseSettings(valid());
  assert.deepEqual(parsed.localRules, [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*", "/ok"] }]);
  assert.deepEqual(parsed.keywords, ["casino", "av"]);
  assert.deepEqual(parsed.keywordExempt, ["github.com"]);
  assert.deepEqual(parsed.shutdown, { enabled: true, delaySeconds: 0 });
  assert.deepEqual(parsed.redirect, { enabled: true, url: "https://wikipedia.org/" });
});

test("blockAll rules drop any allowed paths", () => {
  const parsed = parseSettings({ ...valid(), localRules: [{ domain: "a.com", mode: "blockAll", allowPaths: ["/x"] }] });
  assert.deepEqual(parsed.localRules[0].allowPaths, []);
});

test("missing sections default to empty or off", () => {
  const parsed = parseSettings({ app: "SiteBlocker", version: 1 });
  assert.deepEqual(parsed, {
    localRules: [],
    keywords: [],
    forbiddenKeywords: [],
    keywordExempt: [],
    shutdown: { enabled: false, delaySeconds: 15 },
    redirect: { enabled: false, url: "" },
    unlockTimer: { enabled: false, seconds: 10 },
    customPage: { enabled: false, html: "", css: "" },
    focus: { scope: "always", schedules: [], ranges: [] },
  });
});

test("unknown fields are ignored", () => {
  const parsed = parseSettings({ ...valid(), passwordHash: "evil", appRules: [{ domain: "x.com" }], extra: 1 });
  assert.equal("passwordHash" in parsed, false);
  assert.equal("appRules" in parsed, false);
});

test("a file from another app or version is rejected", () => {
  for (const bad of [null, undefined, "text", 5, [], {}, { app: "Other", version: 1 }, { app: "SiteBlocker", version: 2 }, { app: "SiteBlocker" }]) {
    assert.throws(() => parseSettings(bad), undefined, JSON.stringify(bad));
  }
});

test("bad entries are rejected with a message that names the problem", () => {
  const cases = [
    [{ localRules: "nope" }, /localRules/],
    [{ localRules: [{ domain: "not a domain", mode: "blockAll" }] }, /not a domain/],
    [{ localRules: [{ domain: "a.com", mode: "weird" }] }, /mode/],
    [{ localRules: [null] }, /localRules/],
    [{ localRules: [{ domain: "a.com", mode: "blockExcept", allowPaths: "x" }] }, /allowPaths/],
    [{ keywords: ["a"] }, /keyword/i],
    [{ keywords: [5] }, /keyword/i],
    [{ keywordExempt: ["bad domain"] }, /bad domain/],
    [{ shutdown: { enabled: "yes", delaySeconds: 10 } }, /shutdown/],
    [{ shutdown: { enabled: true, delaySeconds: 601 } }, /shutdown/],
    [{ shutdown: { enabled: true, delaySeconds: 2.5 } }, /shutdown/],
    [{ redirect: { enabled: true, url: "javascript:alert(1)" } }, /redirect/i],
    [{ redirect: { enabled: true, url: "" } }, /redirect/i],
  ];
  for (const [patch, pattern] of cases) {
    assert.throws(() => parseSettings({ ...valid(), ...patch }), pattern, JSON.stringify(patch));
  }
});

test("a disabled redirect may keep an empty url", () => {
  const parsed = parseSettings({ ...valid(), redirect: { enabled: false, url: "" } });
  assert.deepEqual(parsed.redirect, { enabled: false, url: "" });
});

test("files with too many entries are rejected", () => {
  const tooMany = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => `word${i}`);
  assert.throws(() => parseSettings({ ...valid(), keywords: tooMany }), /too many/i);
});

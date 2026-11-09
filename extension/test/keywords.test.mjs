import { test } from "node:test";
import assert from "node:assert/strict";
import { matchKeyword, normalizeKeyword, normalizeDomain, findBlockReason } from "../src/matcher.js";

test("keyword matches anywhere in the url, case-insensitively", () => {
  assert.equal(matchKeyword("https://example.com/Casino/play", ["casino"]), "casino");
  assert.equal(matchKeyword("https://casino-world.org/", ["casino"]), "casino");
  assert.equal(matchKeyword("https://example.com/a?game=CASINO", ["casino"]), "casino");
  assert.equal(matchKeyword("https://sub.bet365.com/", ["bet365"]), "bet365");
});

test("keyword matches inside search queries, including encoded text and plus signs", () => {
  assert.equal(matchKeyword("https://www.google.com/search?q=online+casino", ["casino"]), "casino");
  assert.equal(matchKeyword("https://www.google.com/search?q=online%20casino%20bonus", ["online casino"]), "online casino");
});

test("returns the first matching keyword", () => {
  assert.equal(matchKeyword("https://x.com/a-b", ["zzz", "b", "a-"]), "b");
});

test("non-matching urls and empty keyword lists return null", () => {
  assert.equal(matchKeyword("https://example.com/news", ["casino"]), null);
  assert.equal(matchKeyword("https://example.com/news", []), null);
});

test("the scheme alone never triggers a keyword", () => {
  assert.equal(matchKeyword("https://example.com/", ["https"]), null);
  assert.equal(matchKeyword("http://example.com/", ["http"]), null);
});

test("non-http and invalid urls are never keyword-blocked", () => {
  assert.equal(matchKeyword("chrome://casino", ["casino"]), null);
  assert.equal(matchKeyword("", ["casino"]), null);
  assert.equal(matchKeyword("not a url casino", ["casino"]), null);
});

test("malformed percent-encoding does not throw", () => {
  assert.equal(matchKeyword("https://example.com/%E0%A4%A?x=casino", ["casino"]), "casino");
});

test("normalizeKeyword trims and lower-cases", () => {
  assert.equal(normalizeKeyword("  CaSiNo "), "casino");
});

test("normalizeKeyword rejects empty or too-short keywords", () => {
  assert.throws(() => normalizeKeyword(""));
  assert.throws(() => normalizeKeyword("   "));
  assert.throws(() => normalizeKeyword("a"));
});

test("normalizeDomain strips scheme, www, port and path", () => {
  assert.equal(normalizeDomain("https://www.Facebook.com/"), "facebook.com");
  assert.equal(normalizeDomain("  www.facebook.com/path  "), "facebook.com");
  assert.equal(normalizeDomain("example.com:8080/x"), "example.com");
});

test("normalizeDomain rejects invalid input", () => {
  assert.throws(() => normalizeDomain(""));
  assert.throws(() => normalizeDomain("not a domain"));
  assert.throws(() => normalizeDomain("localhost"));
});

test("findBlockReason reports the rule, the keyword, or null", () => {
  const rules = [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"] }];
  assert.deepEqual(findBlockReason("https://facebook.com/", rules, []), { type: "rule", domain: "facebook.com" });
  assert.deepEqual(findBlockReason("https://example.com/casino", rules, ["casino"]), { type: "keyword", keyword: "casino" });
  assert.equal(findBlockReason("https://facebook.com/marketplace", rules, []), null);
  assert.equal(findBlockReason("https://example.com/", rules, ["casino"]), null);
});

test("a keyword wins over an allowed path", () => {
  const rules = [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"] }];
  assert.deepEqual(
    findBlockReason("https://facebook.com/marketplace/item/casino-chips", rules, ["casino"]),
    { type: "keyword", keyword: "casino" },
  );
});

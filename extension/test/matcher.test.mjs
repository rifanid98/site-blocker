import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlocked } from "../src/matcher.js";

const facebook = [{ domain: "facebook.com", mode: "blockExcept", allowPaths: ["/marketplace*"] }];

test("blocks everything on the domain outside allowed paths", () => {
  for (const url of [
    "https://facebook.com/",
    "https://www.facebook.com/",
    "https://m.facebook.com/profile.php?id=1",
    "https://www.facebook.com/groups/123",
    "https://www.facebook.com/market",
  ]) {
    assert.equal(isBlocked(url, facebook), true, url);
  }
});

test("allows marketplace paths", () => {
  for (const url of [
    "https://www.facebook.com/marketplace",
    "https://www.facebook.com/marketplace/",
    "https://www.facebook.com/marketplace/item/999",
    "https://www.facebook.com/marketplace?x=1",
    "https://facebook.com/MarketPlace/category/cars",
  ]) {
    assert.equal(isBlocked(url, facebook), false, url);
  }
});

test("blockAll blocks every path including subdomains", () => {
  const rules = [{ domain: "facebook.com", mode: "blockAll", allowPaths: [] }];
  assert.equal(isBlocked("https://facebook.com/", rules), true);
  assert.equal(isBlocked("https://www.facebook.com/marketplace", rules), true);
  assert.equal(isBlocked("http://sub.facebook.com/anything", rules), true);
});

test("unrelated hosts are not blocked", () => {
  for (const url of [
    "https://example.com/",
    "https://notfacebook.com/",
    "https://facebook.com.evil.org/",
    "https://fbcdn.net/x.jpg",
  ]) {
    assert.equal(isBlocked(url, facebook), false, url);
  }
});

test("invalid or non-http urls are not blocked", () => {
  for (const url of ["", "not a url", "chrome://extensions", "about:blank"]) {
    assert.equal(isBlocked(url, facebook), false, url);
  }
});

test("no rules blocks nothing", () => {
  assert.equal(isBlocked("https://facebook.com/", []), false);
});

test("allowed path without wildcard matches path and sub-segments only", () => {
  const rules = [{ domain: "example.com", mode: "blockExcept", allowPaths: ["/docs"] }];
  assert.equal(isBlocked("https://example.com/docs", rules), false);
  assert.equal(isBlocked("https://example.com/docs/intro", rules), false);
  assert.equal(isBlocked("https://example.com/docsx", rules), true);
});

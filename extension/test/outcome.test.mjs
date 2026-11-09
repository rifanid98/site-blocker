import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCountDown } from "../src/outcome.js";

const unlockOn = { enabled: true, seconds: 10 };
const unlockOff = { enabled: false, seconds: 10 };
const shutdownOn = { enabled: true, delaySeconds: 15 };
const shutdownOff = { enabled: false, delaySeconds: 15 };

const ordinaryRule = { type: "rule", domain: "a.com" };
const forbiddenRule = { type: "rule", domain: "a.com", forbidden: true };
const ordinaryKeyword = { type: "keyword", keyword: "av" };
const forbiddenKeyword = { type: "keyword", keyword: "casino", forbidden: true };

test("an ordinary blocked page gets the countdown when it is on", () => {
  for (const reason of [ordinaryRule, ordinaryKeyword]) {
    for (const shutdown of [shutdownOn, shutdownOff]) {
      assert.equal(shouldCountDown({ reason, shutdown, unlock: unlockOn }), true);
    }
  }
});

test("a forbidden site or keyword skips the countdown and goes straight to shutdown when shutdown mode is on", () => {
  for (const reason of [forbiddenRule, forbiddenKeyword]) {
    assert.equal(shouldCountDown({ reason, shutdown: shutdownOn, unlock: unlockOn }), false);
  }
});

test("a forbidden page still gets the countdown when shutdown mode is off, since nothing special would happen", () => {
  for (const reason of [forbiddenRule, forbiddenKeyword]) {
    assert.equal(shouldCountDown({ reason, shutdown: shutdownOff, unlock: unlockOn }), true);
  }
});

test("no countdown is shown when the unlock countdown is off", () => {
  for (const reason of [ordinaryRule, forbiddenRule, ordinaryKeyword, forbiddenKeyword]) {
    for (const shutdown of [shutdownOn, shutdownOff]) {
      assert.equal(shouldCountDown({ reason, shutdown, unlock: unlockOff }), false);
    }
  }
});

test("a page that is not blocked never gets a countdown", () => {
  assert.equal(shouldCountDown({ reason: null, shutdown: shutdownOn, unlock: unlockOn }), false);
});

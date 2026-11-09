import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/auth.js";

test("verifies the correct password", async () => {
  const stored = await hashPassword("s3cret");
  assert.equal(await verifyPassword("s3cret", stored), true);
});

test("rejects a wrong password", async () => {
  const stored = await hashPassword("s3cret");
  assert.equal(await verifyPassword("nope", stored), false);
});

test("hashes are salted", async () => {
  assert.notEqual(await hashPassword("same"), await hashPassword("same"));
});

test("the hash does not contain the plaintext", async () => {
  assert.equal((await hashPassword("plain-text-pw")).includes("plain-text-pw"), false);
});

test("malformed stored hashes never verify", async () => {
  for (const stored of ["", "garbage", "1.2", "x.y.z.w", undefined, null]) {
    assert.equal(await verifyPassword("anything", stored), false, String(stored));
  }
});

test("empty passwords are rejected", async () => {
  await assert.rejects(() => hashPassword(""));
  const stored = await hashPassword("abc");
  assert.equal(await verifyPassword("", stored), false);
});

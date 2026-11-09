import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockStore } from "../src/store.js";
import { createCooldownGate } from "../src/cooldownGate.js";

function memoryStorage() {
  const data = {};
  return { data, get: async (k) => data[k], set: async (k, v) => void (data[k] = v) };
}

async function createStore(password = "pw123") {
  const store = new BlockStore(memoryStorage());
  if (password) await store.setInitialPassword(password);
  return store;
}

test("shutdown mode is off by default with a 15 second delay", async () => {
  const store = await createStore();
  assert.deepEqual(await store.getShutdown(), { enabled: false, delaySeconds: 15 });
});

test("turning shutdown mode on is free and stores the delay", async () => {
  const store = await createStore();
  await store.enableShutdown(30);
  assert.deepEqual(await store.getShutdown(), { enabled: true, delaySeconds: 30 });
});

test("delay must be a whole number between 0 and 600 seconds", async () => {
  const store = await createStore();
  for (const bad of [601, -1, 2.5, NaN, "abc", undefined]) {
    await assert.rejects(() => store.enableShutdown(bad), String(bad));
  }
  assert.equal((await store.getShutdown()).enabled, false);
});

test("the bounds are accepted, including 0 for an immediate shutdown", async () => {
  const store = await createStore();
  await store.enableShutdown(0);
  assert.deepEqual(await store.getShutdown(), { enabled: true, delaySeconds: 0 });
});

test("enabling twice is rejected so the delay cannot be loosened without the password", async () => {
  const store = await createStore();
  await store.enableShutdown(30);
  await assert.rejects(() => store.enableShutdown(600));
  assert.equal((await store.getShutdown()).delaySeconds, 30);
});

test("turning shutdown mode off needs the password", async () => {
  const store = await createStore("pw123");
  await store.enableShutdown(30);

  assert.equal(await store.disableShutdown("wrong"), false);
  assert.equal((await store.getShutdown()).enabled, true);

  assert.equal(await store.disableShutdown("pw123"), true);
  assert.equal((await store.getShutdown()).enabled, false);
});

test("turning off when already off returns false", async () => {
  const store = await createStore("pw123");
  assert.equal(await store.disableShutdown("pw123"), false);
});

test("cooldown gate lets the first call through and blocks repeats until the cooldown passes", () => {
  let now = 1000;
  const gate = createCooldownGate(30_000, () => now);

  assert.equal(gate.tryPass(), true);
  now += 5_000;
  assert.equal(gate.tryPass(), false);
  now += 24_999;
  assert.equal(gate.tryPass(), false);
  now += 1;
  assert.equal(gate.tryPass(), true);
});

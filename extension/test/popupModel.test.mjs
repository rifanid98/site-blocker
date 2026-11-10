import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOPE_BUTTONS, planScopeChange, popupModel } from "../src/popupModel.js";

const focus = (patch = {}) => ({ scope: "always", manualOn: false, schedules: [], ranges: [], ...patch });

test("the popup offers exactly the three blocking modes, in order", () => {
  assert.deepEqual(SCOPE_BUTTONS.map((button) => button.scope), ["always", "focus", "off"]);
  for (const button of SCOPE_BUTTONS) {
    assert.equal(typeof button.label, "string");
    assert.ok(button.label.length > 0);
    assert.ok(button.title.length > 0);
  }
});

test("without a password the popup only points to the settings", () => {
  const model = popupModel({ hasPassword: false, focus: focus() });
  assert.equal(model.ready, false);
  assert.match(model.message, /password/i);
});

test("with a password the popup is ready and highlights the current mode", () => {
  for (const scope of ["always", "focus", "off"]) {
    const model = popupModel({ hasPassword: true, focus: focus({ scope }) });
    assert.equal(model.ready, true);
    assert.equal(model.activeScope, scope);
  }
});

test("Start and End only exist in focus mode", () => {
  assert.equal(popupModel({ hasPassword: true, focus: focus({ scope: "always" }) }).startEnd, null);
  assert.equal(popupModel({ hasPassword: true, focus: focus({ scope: "off", manualOn: true }) }).startEnd, null);
});

test("in focus mode the button starts focus when it is off and ends it when it is on", () => {
  assert.deepEqual(popupModel({ hasPassword: true, focus: focus({ scope: "focus" }) }).startEnd, { action: "start", label: "Start" });
  assert.deepEqual(popupModel({ hasPassword: true, focus: focus({ scope: "focus", manualOn: true }) }).startEnd, {
    action: "end",
    label: "End focus mode",
  });
});

test("choosing the current mode changes nothing", () => {
  for (const scope of ["always", "focus", "off"]) {
    assert.deepEqual(planScopeChange(scope, scope), { noop: true, needsPassword: false });
  }
});

test("a looser mode needs the password and a stricter one does not", () => {
  assert.deepEqual(planScopeChange("always", "focus"), { noop: false, needsPassword: true });
  assert.deepEqual(planScopeChange("always", "off"), { noop: false, needsPassword: true });
  assert.deepEqual(planScopeChange("focus", "off"), { noop: false, needsPassword: true });
  assert.deepEqual(planScopeChange("focus", "always"), { noop: false, needsPassword: false });
  assert.deepEqual(planScopeChange("off", "focus"), { noop: false, needsPassword: false });
  assert.deepEqual(planScopeChange("off", "always"), { noop: false, needsPassword: false });
});

import { BlockStore } from "./store.js";
import { chromeStorage } from "./chromeStorage.js";
import { focusStatusText } from "./focus.js";
import { SCOPE_BUTTONS, planScopeChange, popupModel, siteExemptModel } from "./popupModel.js";

const store = new BlockStore(chromeStorage);
const $ = (id) => document.getElementById(id);

const SCOPE_CHANGED = {
  always: "Blocking is on. Your rules always apply.",
  focus: "Blocking is on only during focus mode.",
  off: "Blocking is off.",
};

function setMessage(text, ok = false) {
  $("msg").textContent = text;
  $("msg").className = ok ? "ok" : "";
}

// The action waiting for a password, or null. It resolves to { ok, text }.
let pending = null;

function askForPassword(prompt, run) {
  pending = run;
  $("confirmText").textContent = prompt;
  $("password").value = "";
  $("confirm").hidden = false;
  $("controls").hidden = true; // one thing at a time
  $("siteExempt").hidden = true;
  $("password").focus();
}

// The tab the popup was opened on, and what the site toggle would do for it.
let site = null; // { tab, host, entry } or null

async function renderSiteToggle(hasPassword) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { keywordExempt } = await store.getState();
  const model = hasPassword && tab?.url ? siteExemptModel(tab.url, keywordExempt) : null;
  site = model && { tab, ...model };

  $("siteExempt").hidden = site === null || !$("confirm").hidden;
  if (!site) return;
  $("siteHost").textContent = site.entry ?? site.host;
  $("siteToggle").checked = site.entry !== null;
}

async function toggleSite() {
  const wasChecked = !$("siteToggle").checked; // the state before this click
  const { tab, host, entry } = site;
  const reload = () => chrome.tabs.reload(tab.id).catch(() => {});

  if (wasChecked) {
    await store.removeKeywordExemption(entry); // blocking gets stricter: no password
    setMessage(`Keyword blocking is back on for ${entry}.`, true);
    await reload();
    await render();
    return;
  }

  $("siteToggle").checked = false; // stays off until the password is accepted
  askForPassword(`Enter your password to skip keyword blocking on ${host}.`, async (password) => {
    const result = await store.exemptSite(tab.url, host, password);
    if (!result.ok) return { ok: false, text: result.error };
    await reload();
    return { ok: true, text: `Keyword blocking is skipped on ${result.host}.` };
  });
}

function closeConfirm() {
  pending = null;
  $("confirm").hidden = true;
  $("password").value = "";
}

async function render() {
  const state = await store.getState();
  const focus = await store.getFocus();
  const model = popupModel({ hasPassword: state.hasPassword, focus });

  $("status").textContent = model.ready ? focusStatusText(focus) : model.message;
  $("controls").hidden = !model.ready || !$("confirm").hidden;
  await renderSiteToggle(model.ready);
  if (!model.ready) return;

  for (const button of $("modes").children) {
    button.setAttribute("aria-pressed", String(button.dataset.scope === model.activeScope));
  }

  $("startEnd").hidden = model.startEnd === null;
  if (model.startEnd) {
    $("startEnd").textContent = model.startEnd.label;
    $("startEnd").dataset.action = model.startEnd.action;
    $("startEnd").className = model.startEnd.action === "end" ? "danger" : "primary";
  }
}

async function changeScope(wanted) {
  const current = (await store.getFocus()).scope;
  const plan = planScopeChange(current, wanted);
  if (plan.noop) return;

  if (!plan.needsPassword) {
    await store.setFocusScope(wanted); // a stricter mode goes straight through
    setMessage(SCOPE_CHANGED[wanted], true);
    await render();
    return;
  }

  askForPassword(
    wanted === "off" ? "Enter your password to turn blocking off." : "Enter your password to apply your rules only during focus mode.",
    async (password) =>
      (await store.setFocusScope(wanted, password))
        ? { ok: true, text: SCOPE_CHANGED[wanted] }
        : { ok: false, text: "Wrong password. Nothing changed." },
  );
}

async function startOrEnd() {
  const focus = await store.getFocus();

  if (!focus.manualOn) {
    await store.startFocus(); // one click, no password: it only makes blocking stricter
    setMessage("Focus mode started.", true);
    await render();
    return;
  }

  askForPassword("Enter your password to end focus mode.", async (password) =>
    (await store.stopFocus(password)) ? { ok: true, text: "Focus mode ended." } : { ok: false, text: "Wrong password. Focus mode stays on." },
  );
}

async function confirm() {
  if (!pending) return;

  const result = await pending($("password").value);
  setMessage(result.text, result.ok);
  if (result.ok) {
    closeConfirm();
    await render();
  } else {
    $("password").select();
  }
}

for (const { scope, label, title } of SCOPE_BUTTONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode";
  button.dataset.scope = scope;
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", () => changeScope(scope));
  $("modes").append(button);
}

$("startEnd").addEventListener("click", startOrEnd);
$("siteToggle").addEventListener("change", toggleSite);
$("confirmBtn").addEventListener("click", confirm);
$("password").addEventListener("keydown", (event) => event.key === "Enter" && confirm());
$("cancelBtn").addEventListener("click", async () => {
  closeConfirm();
  setMessage("Nothing changed.");
  await render();
});
$("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

render();

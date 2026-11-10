import { BlockStore } from "./store.js";
import { chromeStorage } from "./chromeStorage.js";
import { renderCustomBlockPage } from "./blockPage.js";

const store = new BlockStore(chromeStorage);
const $ = (id) => document.getElementById(id);

let editingDomain = null; // set while editing an existing rule

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

/** Shows the password dialog. Resolves with the typed password, or null when cancelled. */
function askPassword(message) {
  return new Promise((resolve) => {
    const dialog = $("pwDialog");
    $("pwMessage").textContent = message;
    $("pwInput").value = "";

    const finish = (value) => {
      dialog.close();
      resolve(value);
    };
    $("pwForm").onsubmit = (event) => {
      event.preventDefault();
      finish($("pwInput").value);
    };
    $("pwCancel").onclick = () => finish(null);
    dialog.oncancel = () => resolve(null);

    dialog.showModal();
    $("pwInput").focus();
  });
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

const modeText = (mode) => (mode === "blockAll" ? "Block everything" : "Block, with exceptions");

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function renderRules(rules) {
  const body = $("ruleRows");
  body.replaceChildren();
  $("noRules").hidden = rules.length > 0;

  for (const rule of rules) {
    const row = document.createElement("tr");
    row.append(
      cell(rule.domain),
      cell(modeText(rule.mode)),
      cell(rule.allowPaths.join(", ")),
      cell(rule.forbidden ? "Yes" : ""),
    );

    const actions = cell("", "actions");
    actions.append(
      button("Edit", "secondary", () => startEdit(rule)),
      " ",
      button("Remove", "danger", () => removeRule(rule.domain)),
    );
    row.append(actions);
    body.append(row);
  }
}

function renderKeywords(keywords, forbiddenKeywords) {
  const chips = $("keywordChips");
  chips.replaceChildren();
  $("noKeywords").hidden = keywords.length > 0;

  for (const keyword of keywords) {
    const forbidden = forbiddenKeywords.includes(keyword);
    const chip = document.createElement("span");
    chip.className = "chip";

    const flag = button("⚑", forbidden ? "danger" : "secondary", () => toggleKeywordForbidden(keyword, !forbidden));
    flag.title = forbidden ? "Forbidden: triggers shutdown mode. Click to turn off (password)." : "Click to mark forbidden.";
    flag.setAttribute("aria-pressed", String(forbidden));
    flag.setAttribute("aria-label", `${forbidden ? "Unmark" : "Mark"} ${keyword} as forbidden`);

    const remove = button("×", "danger", () => removeKeyword(keyword));
    remove.setAttribute("aria-label", `Remove ${keyword}`);

    chip.append(keyword, flag, remove);
    chips.append(chip);
  }
}

async function toggleKeywordForbidden(keyword, forbidden) {
  try {
    if (forbidden) {
      await store.setKeywordForbidden(keyword, true);
      setStatus(`"${keyword}" is now forbidden.`, "ok");
    } else {
      const password = await askPassword(`Enter your password to stop treating "${keyword}" as forbidden.`);
      if (password === null) return;
      if (!(await store.setKeywordForbidden(keyword, false, password))) {
        setStatus("Wrong password.", "error");
        return;
      }
      setStatus(`"${keyword}" is no longer forbidden.`, "ok");
    }
    await render();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function renderExemptions(domains) {
  const chips = $("exemptChips");
  chips.replaceChildren();
  $("noExempt").hidden = domains.length > 0;

  for (const domain of domains) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.append(domain, button("×", "danger", () => removeExemption(domain)));
    chip.lastChild.setAttribute("aria-label", `Remove exception ${domain}`);
    chips.append(chip);
  }
}

async function addExemption() {
  try {
    const domain = $("exemptDomain").value;
    const password = await askPassword(`Enter your password to stop checking ${domain.trim() || "this domain or IP address"} for keywords.`);
    if (password === null) return;

    if (await store.addKeywordExemption(domain, password)) {
      setStatus(`${domain.trim()} is no longer checked for keywords.`, "ok");
      $("exemptDomain").value = "";
      await render();
    } else {
      setStatus("Wrong password.", "error");
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function removeExemption(domain) {
  await store.removeKeywordExemption(domain);
  setStatus(`${domain} is checked for keywords again.`, "ok");
  await render();
}

function renderAppRules(rules) {
  $("appRulesSection").hidden = rules.length === 0;
  const body = $("appRuleRows");
  body.replaceChildren();
  for (const rule of rules) {
    const row = document.createElement("tr");
    row.append(cell(rule.domain), cell(modeText(rule.mode)), cell((rule.allowPaths ?? []).join(", ")));
    body.append(row);
  }
}

async function renderUnlock() {
  const unlock = await store.getUnlockTimer();
  $("unlockToggle").checked = unlock.enabled;
  $("unlockSeconds").value = unlock.seconds;
  $("unlockSeconds").disabled = unlock.enabled; // the length is fixed while the countdown is on
}

async function toggleUnlock() {
  const wantsOn = $("unlockToggle").checked;
  try {
    if (wantsOn) {
      await store.enableUnlockTimer(Number($("unlockSeconds").value));
      setStatus("Unlock countdown is on. Blocked pages will count down before the real outcome.", "ok");
    } else {
      const password = await askPassword("Enter your password to turn off the unlock countdown.");
      if (password !== null && (await store.disableUnlockTimer(password))) {
        setStatus("Unlock countdown is off.", "ok");
      } else {
        setStatus(password === null ? "Unlock countdown stays on." : "Wrong password. Unlock countdown stays on.", "error");
      }
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
  await renderUnlock(); // snaps the checkbox back to the real state if the change was refused
}

const CUSTOM_EXAMPLE_HTML = `<h1>Not today.</h1>
<p>{{host}} is on your block list.</p>
<p class="small">Go and do something you will be proud of instead.</p>`;

const CUSTOM_EXAMPLE_CSS = `body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; text-align: center; padding-top: 18vh; }
h1 { font-size: 40px; margin: 0 0 12px; }
.small { color: #94a3b8; }`;

function renderPreview() {
  const doc = $("previewFrame").contentDocument;
  if (!doc) return;

  doc.open();
  doc.write("<!doctype html><html><head></head><body></body></html>");
  doc.close();

  renderCustomBlockPage("https://www.example.com/some/page", $("customHtml").value, doc);
  const style = doc.createElement("style");
  style.textContent = $("customCss").value;
  doc.head.append(style);
}

/** The HTML and CSS boxes (and the preview) are only shown while "Use my own blocked page" is checked. */
function showCustomEditor(visible) {
  $("customEditor").hidden = !visible;
  if (visible) renderPreview();
}

// True once the HTML or CSS box has been edited and not saved yet. Other actions re-render the page, and must never
// replace text that is still being written.
let customDirty = false;

async function renderCustomPage() {
  if (customDirty) return;
  const custom = await store.getCustomPage();
  $("customToggle").checked = custom.enabled;
  $("customHtml").value = custom.html;
  $("customCss").value = custom.css;
  showCustomEditor(custom.enabled);
}

async function saveCustomPage() {
  try {
    await store.setCustomPage({
      enabled: $("customToggle").checked,
      html: $("customHtml").value,
      css: $("customCss").value,
    });
    customDirty = false;
    setStatus($("customToggle").checked ? "Your own blocked page is on." : "Saved. The built-in blocked page is in use.", "ok");
    return true;
  } catch (error) {
    setStatus(error.message, "error"); // the editor stays open so the page can be fixed
    return false;
  }
}

async function toggleCustomPage() {
  if ($("customToggle").checked) {
    showCustomEditor(true);
    // A page written earlier switches on straight away. With nothing written yet, wait for Save.
    if ($("customHtml").value.trim() !== "") await saveCustomPage();
    else setStatus("Write your HTML, then press Save custom page.");
    return;
  }

  // Switching off keeps the text, so it is there again next time, and needs no password.
  if (await saveCustomPage()) showCustomEditor(false);
  else $("customToggle").checked = true; // saving failed: stay on the editor instead of hiding unsaved work
}

/** A message right next to the control it is about, so it is seen even far down the page. */
function setInline(id, text, kind = "") {
  const el = $(id);
  el.textContent = text;
  el.className = `tag ${kind}`.trim();
}

// True while the box is ticked but the mode is not on yet (waiting for an address, or the address was refused).
let redirectPending = false;

async function renderRedirect() {
  const redirect = await store.getRedirect();

  if (redirect.enabled) {
    redirectPending = false;
    $("redirectToggle").checked = true;
    $("redirectUrl").value = redirect.url;
    $("redirectUrl").disabled = true; // the target is fixed while the mode is on
    $("redirectApply").hidden = true;
  } else if (redirectPending) {
    $("redirectToggle").checked = true; // keep what the user is in the middle of typing
    $("redirectUrl").disabled = false;
    $("redirectApply").hidden = false;
  } else {
    $("redirectToggle").checked = false;
    $("redirectUrl").value = redirect.url;
    $("redirectUrl").disabled = false;
    $("redirectApply").hidden = true;
  }
}

async function applyRedirect() {
  try {
    await store.enableRedirect($("redirectUrl").value);
    redirectPending = false;
    setInline("redirectMsg", "Redirect mode is on. Blocked pages now go to your chosen page.", "ok");
  } catch (error) {
    redirectPending = true; // stay ticked so the address can be fixed
    setInline("redirectMsg", error.message, "error");
    $("redirectUrl").focus();
  }
  await renderRedirect();
}

async function toggleRedirect() {
  const redirect = await store.getRedirect();

  if ($("redirectToggle").checked) {
    if (redirect.enabled) return;
    redirectPending = true;
    await renderRedirect();

    if ($("redirectUrl").value.trim() !== "") {
      await applyRedirect();
    } else {
      setInline("redirectMsg", "Enter the address to redirect to, then press Turn on.");
      $("redirectUrl").focus();
    }
    return;
  }

  if (!redirect.enabled) {
    // Unticking before it was ever turned on: nothing to protect, no password.
    redirectPending = false;
    setInline("redirectMsg", "");
    await renderRedirect();
    return;
  }

  try {
    const password = await askPassword("Enter your password to turn off redirect mode.");
    if (password !== null && (await store.disableRedirect(password))) {
      setInline("redirectMsg", "Redirect mode is off.", "ok");
    } else {
      setInline("redirectMsg", password === null ? "Redirect mode stays on." : "Wrong password. Redirect mode stays on.", "error");
    }
  } catch (error) {
    setInline("redirectMsg", error.message, "error");
  }
  await renderRedirect(); // snaps the checkbox back to the real state if the change was refused
}

async function renderShutdown() {
  const shutdown = await store.getShutdown();
  $("shutdownToggle").checked = shutdown.enabled;
  $("shutdownDelay").value = shutdown.delaySeconds;
  $("shutdownDelay").disabled = shutdown.enabled; // the countdown is fixed while the mode is on
}

async function render() {
  const state = await store.getState();
  $("setup").hidden = state.hasPassword;
  $("app").hidden = !state.hasPassword;
  if (!state.hasPassword) return;

  renderRules(state.localRules);
  renderKeywords(state.keywords, state.forbiddenKeywords);
  renderExemptions(state.keywordExempt);
  renderAppRules(state.appRules);
  await renderUnlock();
  await renderCustomPage();
  await renderRedirect();
  await renderShutdown();
}

function resetRuleForm() {
  editingDomain = null;
  $("domain").value = "";
  $("domain").disabled = false;
  $("paths").value = "";
  $("ruleForbidden").checked = false;
  $("mode").value = "blockAll";
  $("saveRule").textContent = "Add";
  $("cancelEdit").hidden = true;
}

function startEdit(rule) {
  editingDomain = rule.domain;
  $("domain").value = rule.domain;
  $("domain").disabled = true;
  $("mode").value = rule.mode;
  $("paths").value = rule.allowPaths.join(", ");
  $("ruleForbidden").checked = rule.forbidden === true;
  $("saveRule").textContent = "Save changes (password)";
  $("cancelEdit").hidden = false;
  setStatus(`Editing ${rule.domain}.`);
}

const enteredPaths = () =>
  $("paths").value.split(",").map((p) => p.trim()).filter(Boolean);

async function saveRule() {
  try {
    if (editingDomain === null) {
      await store.addRule($("domain").value, $("mode").value, enteredPaths(), $("ruleForbidden").checked);
      setStatus(`Added ${$("domain").value.trim()}.`, "ok");
    } else {
      const password = await askPassword(`Enter your password to change ${editingDomain}.`);
      if (password === null) return;
      if (!(await store.updateRule(editingDomain, $("mode").value, enteredPaths(), password, $("ruleForbidden").checked))) {
        setStatus("Wrong password.", "error");
        return;
      }
      setStatus(`Updated ${editingDomain}.`, "ok");
    }
    resetRuleForm();
    await render();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function removeRule(domain) {
  const password = await askPassword(`Enter your password to unblock ${domain}.`);
  if (password === null) return;

  if (await store.removeRule(domain, password)) {
    if (editingDomain === domain) resetRuleForm();
    setStatus(`Unblocked ${domain}.`, "ok");
    await render();
  } else {
    setStatus("Wrong password.", "error");
  }
}

async function addKeyword() {
  try {
    await store.addKeyword($("keyword").value, $("keywordForbidden").checked);
    setStatus(`Added keyword "${$("keyword").value.trim().toLowerCase()}".`, "ok");
    $("keyword").value = "";
    $("keywordForbidden").checked = false;
    await render();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function removeKeyword(keyword) {
  const password = await askPassword(`Enter your password to remove the keyword "${keyword}".`);
  if (password === null) return;

  if (await store.removeKeyword(keyword, password)) {
    setStatus(`Removed keyword "${keyword}".`, "ok");
    await render();
  } else {
    setStatus("Wrong password.", "error");
  }
}

async function toggleShutdown() {
  const wantsOn = $("shutdownToggle").checked;
  try {
    if (wantsOn) {
      await store.enableShutdown(Number($("shutdownDelay").value));
      setStatus("Shutdown mode is on. Opening a blocked site will shut this PC down.", "ok");
    } else {
      const password = await askPassword("Enter your password to turn off shutdown mode.");
      if (password !== null && (await store.disableShutdown(password))) {
        setStatus("Shutdown mode is off.", "ok");
      } else {
        setStatus(password === null ? "Shutdown mode stays on." : "Wrong password. Shutdown mode stays on.", "error");
      }
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
  await renderShutdown(); // snaps the checkbox back to the real state if the change was refused
}

async function exportSettings() {
  const settings = await store.exportSettings();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `siteblocker-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  setStatus("Settings exported.", "ok");
}

async function importSettings() {
  const file = $("importFile").files[0];
  if (!file) {
    setStatus("Choose a settings file first.", "error");
    return;
  }

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    setStatus("That file is not valid JSON.", "error");
    return;
  }

  const mode = $("importMode").value;
  const password = await askPassword(
    mode === "replace"
      ? "Enter your password to replace your settings with the file's."
      : "Enter your password to merge the file into your settings.",
  );
  if (password === null) return;

  try {
    const result = await store.importSettings(data, mode, password);
    if (result === false) {
      setStatus("Wrong password. Nothing was imported.", "error");
      return;
    }
    $("importFile").value = "";
    setStatus(
      `Imported (${result.mode}). You now have ${result.localRules} sites, ${result.keywords} keywords and ${result.keywordExempt} keyword exceptions.`,
      "ok",
    );
    await render();
  } catch (error) {
    setStatus(`Nothing was imported: ${error.message}`, "error");
  }
}

async function checkLink() {
  const out = $("linkStatus");
  out.textContent = "Checking...";
  try {
    const reply = await chrome.runtime.sendNativeMessage("com.siteblocker.host", { type: "ping" });
    out.textContent = reply?.ok ? "Connected. Shutdown will work." : "The app answered, but not as expected.";
  } catch {
    out.textContent = "Not connected. Run the SiteBlocker Windows app once, then check again.";
  }
}

async function savePassword() {
  const first = $("pw1").value;
  if (!first || first !== $("pw2").value) {
    setStatus("The two passwords must match and not be empty.", "error");
    return;
  }
  await store.setInitialPassword(first);
  $("pw1").value = $("pw2").value = "";
  setStatus("Password saved.", "ok");
  await render();
}

$("saveRule").addEventListener("click", saveRule);
$("cancelEdit").addEventListener("click", () => {
  resetRuleForm();
  setStatus("");
});
$("addKeyword").addEventListener("click", addKeyword);
$("savePassword").addEventListener("click", savePassword);
$("exportSettings").addEventListener("click", exportSettings);
$("importSettings").addEventListener("click", importSettings);
$("addExempt").addEventListener("click", addExemption);
$("exemptDomain").addEventListener("keydown", (e) => e.key === "Enter" && addExemption());
$("unlockToggle").addEventListener("change", toggleUnlock);
$("customToggle").addEventListener("change", toggleCustomPage);
$("customSave").addEventListener("click", saveCustomPage);
$("customExample").addEventListener("click", () => {
  $("customHtml").value = CUSTOM_EXAMPLE_HTML;
  $("customCss").value = CUSTOM_EXAMPLE_CSS;
  customDirty = true;
  renderPreview();
});
for (const id of ["customHtml", "customCss"]) {
  $(id).addEventListener("input", () => {
    customDirty = true;
    renderPreview();
  });
}
$("redirectToggle").addEventListener("change", toggleRedirect);
$("redirectApply").addEventListener("click", applyRedirect);
$("redirectUrl").addEventListener("keydown", (e) => e.key === "Enter" && !$("redirectUrl").disabled && applyRedirect());
$("shutdownToggle").addEventListener("change", toggleShutdown);
$("checkLink").addEventListener("click", checkLink);
$("keyword").addEventListener("keydown", (e) => e.key === "Enter" && addKeyword());
$("domain").addEventListener("keydown", (e) => e.key === "Enter" && saveRule());

// Only the Windows app's rules arrive from outside this page. Every other change is made here and re-rendered here,
// so a full re-render on any storage change would just wipe whatever is being typed (it runs once a minute).
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.appRules) renderAppRules((await store.getState()).appRules);
});
render();

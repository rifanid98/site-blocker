import { findBlockReason, shouldShutDown } from "./matcher.js";
import { BlockStore } from "./store.js";
import { chromeStorage } from "./chromeStorage.js";
import { BLOCK_PAGE_CSS, renderBlockPage, renderCountdownPage, renderCustomBlockPage } from "./blockPage.js";
import { createCooldownGate } from "./cooldownGate.js";
import { shouldCountDown } from "./outcome.js";

const NATIVE_HOST = "com.siteblocker.host";
const store = new BlockStore(chromeStorage);

// Ask the Windows app for its rules. If the app/host is unavailable we keep the last known app rules,
// so a stopped app never silently unblocks everything. Rules added in the extension UI are unaffected.
async function syncRulesFromApp() {
  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: "getRules" });
    if (response && Array.isArray(response.rules)) await store.setAppRules(response.rules);
  } catch {
    // Native host not installed or app not running.
  }
}

// The user's own page (HTML + CSS from the options page) replaces the built-in block screen when it is switched on.
async function showBlockPage(tabId, url) {
  try {
    const custom = await store.getCustomPage();
    if (custom.enabled) {
      // The built-in styles may already be on the tab (from the countdown screen); they would override the user's CSS.
      await chrome.scripting.removeCSS({ target: { tabId }, css: BLOCK_PAGE_CSS }).catch(() => {});
      if (custom.css.trim() !== "") await chrome.scripting.insertCSS({ target: { tabId }, css: custom.css });
      await chrome.scripting.executeScript({ target: { tabId }, func: renderCustomBlockPage, args: [url, custom.html] });
      return;
    }

    await chrome.scripting.insertCSS({ target: { tabId }, css: BLOCK_PAGE_CSS });
    await chrome.scripting.executeScript({ target: { tabId }, func: renderBlockPage, args: [url] });
  } catch {
    // The tab closed or navigated away before we could draw on it.
  }
}

async function showCountdownPage(tabId, url, seconds) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, css: BLOCK_PAGE_CSS });
    await chrome.scripting.executeScript({ target: { tabId }, func: renderCountdownPage, args: [url, seconds] });
  } catch {
    // The tab closed or navigated away before we could draw on it.
  }
}

// Shutdown mode: opening a page blocked by something flagged forbidden asks the native host to shut the PC down
// after a countdown. The cooldown stops one blocked page (several navigation events) from firing repeated requests.
const shutdownGate = createCooldownGate(30_000);

async function maybeShutDown(url) {
  const shutdown = await store.getShutdown();
  if (!shutdown.enabled || !shutdownGate.tryPass()) return;

  try {
    // Only the host name is sent, never the full address, so search text stays in the browser.
    await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      type: "shutdown",
      seconds: shutdown.delaySeconds,
      host: new URL(url).hostname,
    });
  } catch {
    // Native host missing: nothing we can do from here. The options page has a connection check.
  }
}

async function evaluate(url) {
  const state = await store.getEffective();
  // Focus mode: with the "only during focus mode" scope, nothing is blocked (and no mode acts) outside focus mode.
  // This also covers a countdown that is still running when focus mode ends: the page then opens for real.
  const applies = await store.rulesApplyNow();
  const reason = applies ? findBlockReason(url, state.rules, state.keywords, state.keywordExempt, state.forbiddenKeywords) : null;
  return { ...state, reason };
}

// When focus mode starts (one click, a schedule or a range), pages that are already open are checked too, instead
// of waiting for the next navigation. The previous state is kept in session storage so only a start triggers it.
async function sweepWhenFocusStarts() {
  const applying = await store.rulesApplyNow();
  const { focusWasApplying = true } = await chrome.storage.session.get("focusWasApplying");
  await chrome.storage.session.set({ focusWasApplying: applying });
  if (!applying || focusWasApplying) return;

  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs
      .filter((tab) => tab.id !== undefined && tab.url)
      .map((tab) => checkNavigation({ frameId: 0, tabId: tab.id, url: tab.url })),
  );
}

// What a blocked page turns into: a redirect, or the block screen, plus a shutdown if something forbidden matched.
async function applyBlock(tabId, url, state) {
  await Promise.all([
    respondToBlock(tabId, url, state),
    shouldShutDown(state.reason) ? maybeShutDown(url) : undefined,
  ]);
}

// Redirect mode sends the tab to the chosen page instead of showing the block screen. If that page has since
// ended up on the block list (or the redirect fails), fall back to the block screen so the tab never loops.
async function respondToBlock(tabId, url, { rules, keywords, keywordExempt, forbiddenKeywords }) {
  const redirect = await store.getRedirect();
  if (redirect.enabled && findBlockReason(redirect.url, rules, keywords, keywordExempt, forbiddenKeywords) === null) {
    try {
      await chrome.tabs.update(tabId, { url: redirect.url });
      return;
    } catch {
      // fall through to the block screen
    }
  }
  await showBlockPage(tabId, url);
}

async function checkNavigation(details) {
  // Top-level frame only. Sub-resource requests (images, graphql, etc.) are never blocked, so allowed
  // pages like facebook.com/marketplace keep working.
  if (details.frameId !== 0) return;

  const state = await evaluate(details.url);
  if (state.reason === null) return;

  // Unlock countdown: show a countdown that looks like the page is about to open. Whatever the page turns into
  // (block screen, redirect, shutdown) waits until it reaches zero (see finishUnlockCountdown). A forbidden match
  // with shutdown mode on skips the countdown and shuts down straight away.
  const unlock = await store.getUnlockTimer();
  const shutdown = await store.getShutdown();
  if (shouldCountDown({ reason: state.reason, shutdown, unlock })) {
    await showCountdownPage(details.tabId, details.url, unlock.seconds);
    return;
  }

  await applyBlock(details.tabId, details.url, state);
}

// The countdown screen reports back when it reaches zero. The rules are checked again then, because they may
// have changed while it ran: if the page is no longer blocked it opens for real, otherwise the outcome applies.
async function finishUnlockCountdown(tabId, url) {
  const state = await evaluate(url);
  if (state.reason !== null) {
    await applyBlock(tabId, url, state);
    return;
  }

  try {
    const protocol = new URL(url).protocol;
    if (protocol === "http:" || protocol === "https:") await chrome.tabs.update(tabId, { url });
  } catch {
    // not a web address, or the tab is gone
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return;
  if (message?.type === "unlockCountdownDone" && typeof message.url === "string") {
    finishUnlockCountdown(sender.tab.id, message.url);
  }
});

// Page loads (including reload, back and forward), and in-page (history.pushState) navigation inside
// single-page apps like Facebook. DOMContentLoaded is a second chance if the first draw lost a race.
chrome.webNavigation.onCommitted.addListener(checkNavigation);
chrome.webNavigation.onDOMContentLoaded.addListener(checkNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(checkNavigation);

// The toolbar icon opens the popup (one-click focus mode), so there is no click handler here.

// A one-click start, or any change to focus mode made in the options page or popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.focus) sweepWhenFocusStarts();
});

chrome.runtime.onInstalled.addListener(() => {
  syncRulesFromApp();
  sweepWhenFocusStarts();
});
chrome.runtime.onStartup.addListener(() => {
  syncRulesFromApp();
  sweepWhenFocusStarts();
});

// Once a minute: refresh the Windows app's rules, and notice a schedule or time range that has just started.
chrome.alarms.create("sync-rules", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "sync-rules") return;
  syncRulesFromApp();
  sweepWhenFocusStarts();
});

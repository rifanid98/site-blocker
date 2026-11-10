import { hashPassword, verifyPassword } from "./auth.js";
import {
  cleanAllowPaths as cleanPaths,
  findBlockReason,
  normalizeDomain,
  normalizeExemptHost,
  normalizeKeyword,
  normalizeRedirectUrl,
} from "./matcher.js";
import {
  SHUTDOWN_DEFAULT_SECONDS,
  SHUTDOWN_MAX_SECONDS,
  SHUTDOWN_MIN_SECONDS,
  UNLOCK_DEFAULT_SECONDS,
  UNLOCK_MAX_SECONDS,
  UNLOCK_MIN_SECONDS,
} from "./constants.js";
import { buildExport, isValidUnlockSeconds, parseSettings, validateCustomPage } from "./settingsFile.js";
import { FOCUS_SCOPES, needsPasswordToChange, rulesApplyNow, strictest, validateRange, validateSchedule } from "./focus.js";

export { SHUTDOWN_DEFAULT_SECONDS, SHUTDOWN_MAX_SECONDS, SHUTDOWN_MIN_SECONDS };

const KEYS = {
  appRules: "appRules", // pushed by the Windows app through native messaging; read-only here
  localRules: "localRules", // managed in the extension UI
  keywords: "keywords",
  forbiddenKeywords: "forbiddenKeywords", // subset of keywords that trigger shutdown mode
  keywordExempt: "keywordExempt", // domains that skip keyword detection
  passwordHash: "passwordHash",
  shutdown: "shutdown", // { enabled, delaySeconds }
  redirect: "redirect", // { enabled, url }
  unlockTimer: "unlockTimer", // { enabled, seconds }: fake "unlocking" countdown before the block outcome
  customPage: "customPage", // { enabled, html, css }: replaces the built-in block screen
  focus: "focus", // { scope, manualOn, schedules, ranges }: see focus.js
};

const sameContent = (a, b) => JSON.stringify({ ...a, id: undefined }) === JSON.stringify({ ...b, id: undefined });

/** A rule as stored. The forbidden key exists only when true, so ordinary rules look the same as before. */
function makeRule(domain, mode, allowPaths, forbidden) {
  return { domain, mode, allowPaths: cleanPaths(mode, allowPaths), ...(forbidden ? { forbidden: true } : {}) };
}

/**
 * Block list kept in storage. Adding a site or keyword is free; removing or changing one needs the password.
 * `storage` is { get(key) -> Promise<value>, set(key, value) -> Promise }.
 */
export class BlockStore {
  constructor(storage) {
    this.storage = storage;
  }

  async #read(key, fallback) {
    return (await this.storage.get(key)) ?? fallback;
  }

  async getState() {
    return {
      appRules: await this.#read(KEYS.appRules, []),
      localRules: await this.#read(KEYS.localRules, []),
      keywords: await this.#read(KEYS.keywords, []),
      forbiddenKeywords: await this.#read(KEYS.forbiddenKeywords, []),
      keywordExempt: await this.#read(KEYS.keywordExempt, []),
      hasPassword: Boolean(await this.storage.get(KEYS.passwordHash)),
    };
  }

  /** Everything the background worker enforces: app rules first, then the extension's own. */
  async getEffective() {
    const { appRules, localRules, keywords, forbiddenKeywords, keywordExempt } = await this.getState();
    return { rules: [...appRules, ...localRules], keywords, forbiddenKeywords, keywordExempt };
  }

  async setAppRules(rules) {
    await this.storage.set(KEYS.appRules, rules);
  }

  async setInitialPassword(password) {
    if (await this.storage.get(KEYS.passwordHash)) throw new Error("A password is already set.");
    await this.storage.set(KEYS.passwordHash, await hashPassword(password));
  }

  async verify(password) {
    return verifyPassword(password, await this.storage.get(KEYS.passwordHash));
  }

  async changePassword(oldPassword, newPassword) {
    if (!(await this.verify(oldPassword))) return false;
    await this.storage.set(KEYS.passwordHash, await hashPassword(newPassword));
    return true;
  }

  /** `forbidden` marks the site as one that triggers shutdown mode. Adding a site, flagged or not, is free. */
  async addRule(domainInput, mode, allowPaths, forbidden = false) {
    const domain = normalizeDomain(domainInput);
    const rules = await this.#read(KEYS.localRules, []);
    if (rules.some((r) => r.domain === domain)) {
      throw new Error(`'${domain}' is already in the list. Edit it instead (needs the password).`);
    }
    await this.storage.set(KEYS.localRules, [...rules, makeRule(domain, mode, allowPaths, forbidden)]);
  }

  /** Leave `forbidden` undefined to keep the rule's current flag. */
  async updateRule(domainInput, mode, allowPaths, password, forbidden = undefined) {
    if (!(await this.verify(password))) return false;

    const domain = normalizeDomain(domainInput);
    const rules = await this.#read(KEYS.localRules, []);
    const index = rules.findIndex((r) => r.domain === domain);
    if (index < 0) return false;

    const next = [...rules];
    next[index] = makeRule(domain, mode, allowPaths, forbidden ?? rules[index].forbidden === true);
    await this.storage.set(KEYS.localRules, next);
    return true;
  }

  async removeRule(domainInput, password) {
    if (!(await this.verify(password))) return false;

    const domain = normalizeDomain(domainInput);
    const rules = await this.#read(KEYS.localRules, []);
    const next = rules.filter((r) => r.domain !== domain);
    if (next.length === rules.length) return false;

    await this.storage.set(KEYS.localRules, next);
    return true;
  }

  async getShutdown() {
    const stored = await this.#read(KEYS.shutdown, null);
    return {
      enabled: stored?.enabled === true,
      delaySeconds: stored?.delaySeconds ?? SHUTDOWN_DEFAULT_SECONDS,
    };
  }

  /** Turning shutdown mode on is stricter, so it is free. The delay is fixed until it is turned off with the password. */
  async enableShutdown(delaySeconds) {
    if (!Number.isInteger(delaySeconds) || delaySeconds < SHUTDOWN_MIN_SECONDS || delaySeconds > SHUTDOWN_MAX_SECONDS) {
      throw new Error(`The delay must be a whole number between ${SHUTDOWN_MIN_SECONDS} and ${SHUTDOWN_MAX_SECONDS} seconds.`);
    }
    if ((await this.getShutdown()).enabled) {
      throw new Error("Shutdown mode is already on. Turn it off first (needs the password).");
    }
    await this.storage.set(KEYS.shutdown, { enabled: true, delaySeconds });
  }

  async disableShutdown(password) {
    if (!(await this.verify(password))) return false;

    const current = await this.getShutdown();
    if (!current.enabled) return false;

    await this.storage.set(KEYS.shutdown, { enabled: false, delaySeconds: current.delaySeconds });
    return true;
  }

  async getUnlockTimer() {
    const stored = await this.#read(KEYS.unlockTimer, null);
    return { enabled: stored?.enabled === true, seconds: stored?.seconds ?? UNLOCK_DEFAULT_SECONDS };
  }

  /** Turning the countdown on is free. Its length is fixed until it is turned off with the password. */
  async enableUnlockTimer(seconds) {
    if (!isValidUnlockSeconds(seconds)) {
      throw new Error(`The countdown must be a whole number between ${UNLOCK_MIN_SECONDS} and ${UNLOCK_MAX_SECONDS} seconds.`);
    }
    if ((await this.getUnlockTimer()).enabled) {
      throw new Error("The unlock countdown is already on. Turn it off first (needs the password).");
    }
    await this.storage.set(KEYS.unlockTimer, { enabled: true, seconds });
  }

  async disableUnlockTimer(password) {
    if (!(await this.verify(password))) return false;

    const current = await this.getUnlockTimer();
    if (!current.enabled) return false;

    await this.storage.set(KEYS.unlockTimer, { enabled: false, seconds: current.seconds });
    return true;
  }

  async getCustomPage() {
    const stored = await this.#read(KEYS.customPage, null);
    return { enabled: stored?.enabled === true, html: stored?.html ?? "", css: stored?.css ?? "" };
  }

  /** Only changes how the block screen looks, so it is free. Throws when the page is invalid or too large. */
  async setCustomPage(value) {
    await this.storage.set(KEYS.customPage, validateCustomPage(value));
  }

  /** Focus mode state. Ranges that have already ended are left out (they no longer matter). `now` is epoch milliseconds. */
  async getFocus(now = Date.now()) {
    const stored = await this.#read(KEYS.focus, null);
    return {
      scope: FOCUS_SCOPES.includes(stored?.scope) ? stored.scope : "always",
      manualOn: stored?.manualOn === true,
      schedules: stored?.schedules ?? [],
      ranges: (stored?.ranges ?? []).filter((range) => range.end > now),
    };
  }

  /** Whether the user's rules are enforced right now (always, or only while focus mode is active). */
  async rulesApplyNow(now = new Date()) {
    return rulesApplyNow(await this.getFocus(now.getTime()), now);
  }

  /** One click. Turning focus mode on only ever makes blocking stricter, so it is free. */
  async startFocus() {
    await this.storage.set(KEYS.focus, { ...(await this.getFocus()), manualOn: true });
  }

  /** Ending focus mode loosens things, so it needs the password. */
  async stopFocus(password) {
    if (!(await this.verify(password))) return false;

    const focus = await this.getFocus();
    if (!focus.manualOn) return false;

    await this.storage.set(KEYS.focus, { ...focus, manualOn: false });
    return true;
  }

  /**
   * "always" is the strictest scope, then "focus" (rules only during focus mode), then "off" (no rules at all).
   * Moving to a looser scope weakens the user's own rules, so it needs the password. Moving to a stricter one is free.
   */
  async setFocusScope(scope, password = undefined) {
    if (!FOCUS_SCOPES.includes(scope)) throw new Error(`Unknown scope '${scope}'.`);

    const focus = await this.getFocus();
    if (focus.scope === scope) return true;
    if (needsPasswordToChange(focus.scope, scope) && !(await this.verify(password))) return false;

    await this.storage.set(KEYS.focus, { ...focus, scope });
    return true;
  }

  async addFocusSchedule(input) {
    const schedule = validateSchedule(input);
    const focus = await this.getFocus();
    if (focus.schedules.some((existing) => sameContent(existing, schedule))) {
      throw new Error("That schedule is already in the list.");
    }

    const added = { id: crypto.randomUUID(), ...schedule };
    await this.storage.set(KEYS.focus, { ...focus, schedules: [...focus.schedules, added] });
    return added;
  }

  async removeFocusSchedule(id, password) {
    if (!(await this.verify(password))) return false;

    const focus = await this.getFocus();
    const schedules = focus.schedules.filter((schedule) => schedule.id !== id);
    if (schedules.length === focus.schedules.length) return false;

    await this.storage.set(KEYS.focus, { ...focus, schedules });
    return true;
  }

  async addFocusRange(input, now = Date.now()) {
    const range = validateRange(input);
    if (range.end <= now) throw new Error("That time range is already over.");

    const focus = await this.getFocus(now);
    if (focus.ranges.some((existing) => sameContent(existing, range))) throw new Error("That time range is already in the list.");

    const added = { id: crypto.randomUUID(), ...range };
    await this.storage.set(KEYS.focus, { ...focus, ranges: [...focus.ranges, added] });
    return added;
  }

  async removeFocusRange(id, password, now = Date.now()) {
    if (!(await this.verify(password))) return false;

    const focus = await this.getFocus(now);
    const ranges = focus.ranges.filter((range) => range.id !== id);
    if (ranges.length === focus.ranges.length) return false;

    await this.storage.set(KEYS.focus, { ...focus, ranges });
    return true;
  }

  /** Everything the user set up, ready to save as a file. Leaves out the password hash and the Windows app's rules. */
  async exportSettings(now = Date.now()) {
    const { localRules, keywords, forbiddenKeywords, keywordExempt } = await this.getState();
    const focus = await this.getFocus(now);
    return buildExport({
      localRules,
      keywords,
      forbiddenKeywords,
      keywordExempt,
      shutdown: await this.getShutdown(),
      redirect: await this.getRedirect(),
      unlockTimer: await this.getUnlockTimer(),
      customPage: await this.getCustomPage(),
      focus: {
        scope: focus.scope,
        schedules: focus.schedules.map(({ id, ...schedule }) => schedule), // ids are internal, and manualOn is a live switch
        ranges: focus.ranges.map(({ id, ...range }) => range),
      },
    });
  }

  /**
   * Loads a settings file. Needs the password, because a file could remove rules or switch shutdown/redirect off.
   * "merge" only adds: existing rules win, and shutdown/redirect already on stay as they are.
   * "replace" makes the settings match the file. The whole file is validated before anything is written.
   * @returns false on a wrong password, otherwise a summary of what is now stored. Throws on a bad file.
   */
  async importSettings(data, mode, password, now = Date.now()) {
    if (mode !== "merge" && mode !== "replace") {
      throw new Error(`Unknown import mode '${mode}'. Use "merge" or "replace".`);
    }
    if (!(await this.verify(password))) return false;

    const incoming = parseSettings(data);
    const current = await this.getState();
    const currentFocus = await this.getFocus(now);
    const currentShutdown = await this.getShutdown();
    const currentRedirect = await this.getRedirect();
    const currentUnlock = await this.getUnlockTimer();
    const currentPage = await this.getCustomPage();

    let next;
    if (mode === "replace") {
      next = incoming;
    } else {
      const haveDomains = new Set(current.localRules.map((r) => r.domain));
      next = {
        localRules: [...current.localRules, ...incoming.localRules.filter((r) => !haveDomains.has(r.domain))],
        keywords: [...new Set([...current.keywords, ...incoming.keywords])],
        forbiddenKeywords: [...new Set([...current.forbiddenKeywords, ...incoming.forbiddenKeywords])], // flags are only ever added
        keywordExempt: [...new Set([...current.keywordExempt, ...incoming.keywordExempt])],
        shutdown: currentShutdown.enabled || !incoming.shutdown.enabled ? currentShutdown : incoming.shutdown,
        redirect: currentRedirect.enabled || !incoming.redirect.enabled ? currentRedirect : incoming.redirect,
        unlockTimer: currentUnlock.enabled || !incoming.unlockTimer.enabled ? currentUnlock : incoming.unlockTimer,
        // The look of the block screen is cosmetic: keep the user's own page, and only adopt the file's when there is none.
        customPage: currentPage.enabled || currentPage.html !== "" || currentPage.css !== "" ? currentPage : incoming.customPage,
      };
    }

    // Focus mode. Ranges that have already ended are not imported. Merge keeps what exists and adds what is missing, and
    // the stricter scope ("always") wins. Replace takes the file's. The manual on/off switch is live state, never imported.
    const incomingRanges = incoming.focus.ranges.filter((range) => range.end > now);
    const withIds = (items) => items.map((item) => ({ id: crypto.randomUUID(), ...item }));
    const missing = (items, have) => items.filter((item) => !have.some((existing) => sameContent(existing, item)));
    const nextFocus =
      mode === "replace"
        ? {
            scope: incoming.focus.scope,
            manualOn: currentFocus.manualOn,
            schedules: withIds(incoming.focus.schedules),
            ranges: withIds(incomingRanges),
          }
        : {
            scope: strictest(currentFocus.scope, incoming.focus.scope),
            manualOn: currentFocus.manualOn,
            schedules: [...currentFocus.schedules, ...withIds(missing(incoming.focus.schedules, currentFocus.schedules))],
            ranges: [...currentFocus.ranges, ...withIds(missing(incomingRanges, currentFocus.ranges))],
          };

    // The redirect target must not be blocked by the lists we are about to store, or tabs would loop.
    if (next.redirect.enabled) {
      const rules = [...current.appRules, ...next.localRules];
      if (findBlockReason(next.redirect.url, rules, next.keywords, next.keywordExempt) !== null) {
        throw new Error("The redirect address in this file would be blocked by the imported block list.");
      }
    }

    await this.storage.set(KEYS.localRules, next.localRules);
    await this.storage.set(KEYS.keywords, next.keywords);
    await this.storage.set(KEYS.forbiddenKeywords, next.forbiddenKeywords);
    await this.storage.set(KEYS.keywordExempt, next.keywordExempt);
    await this.storage.set(KEYS.shutdown, next.shutdown);
    await this.storage.set(KEYS.redirect, next.redirect);
    await this.storage.set(KEYS.unlockTimer, next.unlockTimer);
    await this.storage.set(KEYS.customPage, next.customPage);
    await this.storage.set(KEYS.focus, nextFocus);

    return {
      mode,
      localRules: next.localRules.length,
      keywords: next.keywords.length,
      keywordExempt: next.keywordExempt.length,
    };
  }

  async getRedirect() {
    const stored = await this.#read(KEYS.redirect, null);
    return { enabled: stored?.enabled === true, url: stored?.url ?? "" };
  }

  /** Turning redirect mode on is free. The target is fixed until it is turned off with the password. */
  async enableRedirect(urlInput) {
    const url = normalizeRedirectUrl(urlInput);
    if ((await this.getRedirect()).enabled) {
      throw new Error("Redirect mode is already on. Turn it off first (needs the password).");
    }

    // A target that is itself blocked would send the tab round in circles.
    const { rules, keywords, keywordExempt } = await this.getEffective();
    if (findBlockReason(url, rules, keywords, keywordExempt) !== null) {
      throw new Error("That address is on your block list, so it cannot be the redirect target.");
    }

    await this.storage.set(KEYS.redirect, { enabled: true, url });
  }

  async disableRedirect(password) {
    if (!(await this.verify(password))) return false;

    const current = await this.getRedirect();
    if (!current.enabled) return false;

    await this.storage.set(KEYS.redirect, { enabled: false, url: current.url });
    return true;
  }

  /** `forbidden` marks the keyword as one that triggers shutdown mode. Adding a keyword, flagged or not, is free. */
  async addKeyword(input, forbidden = false) {
    const keyword = normalizeKeyword(input);
    const keywords = await this.#read(KEYS.keywords, []);
    if (keywords.includes(keyword)) throw new Error(`'${keyword}' is already in the list.`);

    await this.storage.set(KEYS.keywords, [...keywords, keyword]);
    if (forbidden) {
      await this.storage.set(KEYS.forbiddenKeywords, [...(await this.#read(KEYS.forbiddenKeywords, [])), keyword]);
    }
  }

  /** Marking a keyword forbidden is stricter, so it is free. Unmarking it loosens things, so it needs the password. */
  async setKeywordForbidden(input, forbidden, password = undefined) {
    const keyword = normalizeKeyword(input);
    const keywords = await this.#read(KEYS.keywords, []);
    if (!keywords.includes(keyword)) throw new Error(`'${keyword}' is not in the keyword list.`);

    if (!forbidden && !(await this.verify(password))) return false;

    const flagged = await this.#read(KEYS.forbiddenKeywords, []);
    const next = forbidden ? [...new Set([...flagged, keyword])] : flagged.filter((k) => k !== keyword);
    await this.storage.set(KEYS.forbiddenKeywords, next);
    return true;
  }

  /** Adding an exception loosens blocking, so it needs the password. */
  async addKeywordExemption(hostInput, password) {
    if (!(await this.verify(password))) return false;

    const host = normalizeExemptHost(hostInput); // a domain, an IP address or localhost
    const exempt = await this.#read(KEYS.keywordExempt, []);
    if (exempt.includes(host)) throw new Error(`'${host}' is already an exception.`);

    await this.storage.set(KEYS.keywordExempt, [...exempt, host]);
    return true;
  }

  /** Removing an exception makes blocking stricter, so it is free. */
  async removeKeywordExemption(hostInput) {
    const host = normalizeExemptHost(hostInput);
    const exempt = await this.#read(KEYS.keywordExempt, []);
    const next = exempt.filter((d) => d !== host);
    if (next.length === exempt.length) return false;

    await this.storage.set(KEYS.keywordExempt, next);
    return true;
  }

  async removeKeyword(input, password) {
    if (!(await this.verify(password))) return false;

    const keyword = normalizeKeyword(input);
    const keywords = await this.#read(KEYS.keywords, []);
    const next = keywords.filter((k) => k !== keyword);
    if (next.length === keywords.length) return false;

    await this.storage.set(KEYS.keywords, next);
    // A removed keyword must not leave its flag behind, or it would come back flagged if it is added again.
    const flagged = await this.#read(KEYS.forbiddenKeywords, []);
    await this.storage.set(KEYS.forbiddenKeywords, flagged.filter((k) => k !== keyword));
    return true;
  }
}

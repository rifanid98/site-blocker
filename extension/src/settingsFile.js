import { cleanAllowPaths, normalizeDomain, normalizeKeyword, normalizeRedirectUrl } from "./matcher.js";
import {
  CUSTOM_PAGE_MAX_CHARS,
  SHUTDOWN_DEFAULT_SECONDS,
  SHUTDOWN_MAX_SECONDS,
  SHUTDOWN_MIN_SECONDS,
  UNLOCK_DEFAULT_SECONDS,
  UNLOCK_MAX_SECONDS,
  UNLOCK_MIN_SECONDS,
} from "./constants.js";

export const SETTINGS_APP = "SiteBlocker";
export const SETTINGS_VERSION = 1;
export const MAX_ITEMS = 1000;

/** The export file. It never contains the password hash or the rules that come from the Windows app. */
export const DEFAULT_UNLOCK_TIMER = { enabled: false, seconds: UNLOCK_DEFAULT_SECONDS };
export const DEFAULT_CUSTOM_PAGE = { enabled: false, html: "", css: "" };

export function buildExport(
  {
    localRules,
    keywords,
    forbiddenKeywords = [],
    keywordExempt,
    shutdown,
    redirect,
    unlockTimer = DEFAULT_UNLOCK_TIMER,
    customPage = DEFAULT_CUSTOM_PAGE,
  },
  now = new Date(),
) {
  return {
    app: SETTINGS_APP,
    version: SETTINGS_VERSION,
    exportedAt: now.toISOString(),
    localRules,
    keywords,
    forbiddenKeywords,
    keywordExempt,
    shutdown,
    redirect,
    unlockTimer,
    customPage,
  };
}

function list(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`"${name}" must be a list.`);
  if (value.length > MAX_ITEMS) throw new Error(`"${name}" has too many entries (limit ${MAX_ITEMS}).`);
  return value;
}

function unique(items) {
  return [...new Set(items)];
}

function parseRule(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error('"localRules" contains an entry that is not an object.');
  }

  const domain = normalizeDomain(entry.domain);
  if (entry.mode !== "blockAll" && entry.mode !== "blockExcept") {
    throw new Error(`Rule for ${domain}: mode must be "blockAll" or "blockExcept".`);
  }

  const paths = entry.allowPaths ?? [];
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    throw new Error(`Rule for ${domain}: "allowPaths" must be a list of text.`);
  }
  if (entry.forbidden !== undefined && typeof entry.forbidden !== "boolean") {
    throw new Error(`Rule for ${domain}: "forbidden" must be true or false.`);
  }
  return {
    domain,
    mode: entry.mode,
    allowPaths: cleanAllowPaths(entry.mode, paths),
    ...(entry.forbidden === true ? { forbidden: true } : {}),
  };
}

function parseShutdown(value) {
  if (value === undefined) return { enabled: false, delaySeconds: SHUTDOWN_DEFAULT_SECONDS };
  if (value === null || typeof value !== "object" || typeof value.enabled !== "boolean") {
    throw new Error('"shutdown" must have an "enabled" true/false value.');
  }

  const delaySeconds = value.delaySeconds ?? SHUTDOWN_DEFAULT_SECONDS;
  if (!Number.isInteger(delaySeconds) || delaySeconds < SHUTDOWN_MIN_SECONDS || delaySeconds > SHUTDOWN_MAX_SECONDS) {
    throw new Error(`"shutdown" delaySeconds must be a whole number from ${SHUTDOWN_MIN_SECONDS} to ${SHUTDOWN_MAX_SECONDS}.`);
  }
  return { enabled: value.enabled, delaySeconds };
}

function parseRedirect(value) {
  if (value === undefined) return { enabled: false, url: "" };
  if (value === null || typeof value !== "object" || typeof value.enabled !== "boolean") {
    throw new Error('"redirect" must have an "enabled" true/false value.');
  }

  const raw = typeof value.url === "string" ? value.url.trim() : "";
  if (raw === "") {
    if (value.enabled) throw new Error("Redirect is on but has no address.");
    return { enabled: false, url: "" };
  }

  try {
    return { enabled: value.enabled, url: normalizeRedirectUrl(raw) };
  } catch (error) {
    throw new Error(`Redirect: ${error.message}`);
  }
}

export function isValidUnlockSeconds(seconds) {
  return Number.isInteger(seconds) && seconds >= UNLOCK_MIN_SECONDS && seconds <= UNLOCK_MAX_SECONDS;
}

function parseUnlockTimer(value) {
  if (value === undefined) return { ...DEFAULT_UNLOCK_TIMER };
  if (value === null || typeof value !== "object" || typeof value.enabled !== "boolean") {
    throw new Error('"unlockTimer" must have an "enabled" true/false value.');
  }

  const seconds = value.seconds ?? UNLOCK_DEFAULT_SECONDS;
  if (!isValidUnlockSeconds(seconds)) {
    throw new Error(`"unlockTimer" seconds must be a whole number from ${UNLOCK_MIN_SECONDS} to ${UNLOCK_MAX_SECONDS}.`);
  }
  return { enabled: value.enabled, seconds };
}

/** Validates a custom blocked page { enabled, html, css }. Used for files and for saving in the options page. */
export function validateCustomPage(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.enabled !== "boolean") {
    throw new Error('"customPage" must have an "enabled" true/false value.');
  }

  const html = value.html ?? "";
  const css = value.css ?? "";
  if (typeof html !== "string" || typeof css !== "string") {
    throw new Error('"customPage" html and css must be text.');
  }
  if (html.length > CUSTOM_PAGE_MAX_CHARS || css.length > CUSTOM_PAGE_MAX_CHARS) {
    throw new Error(`"customPage" html and css are limited to ${CUSTOM_PAGE_MAX_CHARS} characters each.`);
  }
  if (value.enabled && html.trim() === "") {
    throw new Error('"customPage" is on but has no HTML.');
  }
  return { enabled: value.enabled, html, css };
}

function parseCustomPage(value) {
  return value === undefined ? { ...DEFAULT_CUSTOM_PAGE } : validateCustomPage(value);
}

/** Validates and normalizes a settings file. Throws on the first problem, so a bad file is never half-applied. */
export function parseSettings(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("This is not a SiteBlocker settings file.");
  }
  if (data.app !== SETTINGS_APP) throw new Error("This is not a SiteBlocker settings file.");
  if (data.version !== SETTINGS_VERSION) {
    throw new Error(`Unsupported settings file version (${data.version}). Expected ${SETTINGS_VERSION}.`);
  }

  const seen = new Set();
  const localRules = [];
  for (const entry of list(data.localRules, "localRules")) {
    const rule = parseRule(entry);
    if (seen.has(rule.domain)) continue; // first entry for a domain wins
    seen.add(rule.domain);
    localRules.push(rule);
  }

  const forbiddenKeywords = unique(list(data.forbiddenKeywords, "forbiddenKeywords").map(normalizeKeyword));
  // A forbidden keyword is a keyword too, so it is added to the keyword list if the file left it out.
  const keywords = unique([...list(data.keywords, "keywords").map(normalizeKeyword), ...forbiddenKeywords]);

  return {
    localRules,
    keywords,
    forbiddenKeywords,
    keywordExempt: unique(list(data.keywordExempt, "keywordExempt").map(normalizeDomain)),
    shutdown: parseShutdown(data.shutdown),
    redirect: parseRedirect(data.redirect),
    unlockTimer: parseUnlockTimer(data.unlockTimer),
    customPage: parseCustomPage(data.customPage),
  };
}

// Rule matching mirrors src/SiteBlocker.Core/RuleMatcher.cs. Keep the two in sync.
// Rule shape: { domain: "facebook.com", mode: "blockAll" | "blockExcept", allowPaths: ["/marketplace*"] }

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MIN_KEYWORD_LENGTH = 2;

export function normalizeDomain(input) {
  if (typeof input !== "string" || input.trim() === "") throw new Error("Domain is empty.");

  let value = input.trim().toLowerCase();
  const schemeEnd = value.indexOf("://");
  if (schemeEnd >= 0) value = value.slice(schemeEnd + 3);
  value = value.split(/[/?#]/)[0].split(":")[0];
  if (value.startsWith("www.")) value = value.slice(4);

  if (!DOMAIN_PATTERN.test(value)) throw new Error(`'${input}' is not a valid domain.`);
  return value;
}

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/** True for an IP-address entry (IPv4, or IPv6 in the brackets a URL host has). Those match exactly, never as a suffix. */
export function isIpHost(entry) {
  return IPV4_PATTERN.test(entry) || entry.startsWith("[");
}

/**
 * What can go in the keyword exception list: a domain, an IPv4 or IPv6 address, or localhost. Scheme, port and path
 * are dropped, so "http://192.168.1.10:3000/app" becomes "192.168.1.10". IPv6 comes back in brackets, as a URL host.
 */
export function normalizeExemptHost(input) {
  if (typeof input !== "string" || input.trim() === "") throw new Error("Enter a domain or an IP address.");

  let value = input.trim().toLowerCase();
  const schemeEnd = value.indexOf("://");
  if (schemeEnd >= 0) value = value.slice(schemeEnd + 3);
  value = value.split(/[/?#]/)[0];

  // IPv6: "[::1]", "[::1]:3000", or a bare "::1" (several colons, so it cannot be host:port)
  const bracketed = value.startsWith("[");
  if (bracketed || value.split(":").length > 2) {
    const end = value.indexOf("]");
    if (bracketed && end < 0) throw new Error(`'${input}' is not a valid IP address.`);
    const inner = bracketed ? value.slice(1, end) : value;
    try {
      return new URL(`http://[${inner}]/`).hostname;
    } catch {
      throw new Error(`'${input}' is not a valid IP address.`);
    }
  }

  value = value.split(":")[0]; // drop a port
  if (IPV4_PATTERN.test(value)) {
    if (value.split(".").some((octet) => Number(octet) > 255)) throw new Error(`'${input}' is not a valid IP address.`);
    return new URL(`http://${value}/`).hostname;
  }

  if (value === "localhost") return value;
  return normalizeDomain(value);
}

export function normalizeKeyword(input) {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (value.length < MIN_KEYWORD_LENGTH) {
    throw new Error(`A keyword needs at least ${MIN_KEYWORD_LENGTH} characters.`);
  }
  return value;
}

/** Allowed paths as stored: trimmed, non-empty, always starting with "/". A "blockAll" rule has none. */
export function cleanAllowPaths(mode, allowPaths) {
  if (mode === "blockAll") return [];
  return allowPaths
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => (p.startsWith("/") ? p : "/" + p));
}

/** Turns what the user typed into a canonical http(s) address, or throws. "wikipedia.org" becomes "https://wikipedia.org/". */
export function normalizeRedirectUrl(input) {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "") throw new Error("Enter a web address to redirect to.");

  let parsed;
  try {
    parsed = new URL(text.includes("://") ? text : `https://${text}`);
  } catch {
    throw new Error(`'${input}' is not a valid web address.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The redirect address must start with http:// or https://.");
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    throw new Error(`'${input}' is not a valid web address.`);
  }
  return parsed.href;
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function pathAllowed(path, pattern) {
  pattern = pattern.toLowerCase();
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  const trimmed = pattern.replace(/\/+$/, "");
  return path === trimmed || path === trimmed + "/" || path.startsWith(trimmed + "/");
}

function parseHttpUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function ruleBlocking(parsed, rules) {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  for (const rule of rules) {
    if (!hostMatches(host, rule.domain)) continue;
    if (rule.mode === "blockAll") return rule;
    if (!(rule.allowPaths ?? []).some((pattern) => pathAllowed(path, pattern))) return rule;
  }
  return null;
}

export function isBlocked(url, rules) {
  const parsed = parseHttpUrl(url);
  return parsed !== null && ruleBlocking(parsed, rules) !== null;
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Every keyword contained in the url (the scheme is ignored), in list order.
 * Domains in `exemptDomains` (and their subdomains) are never checked for keywords; only the host counts,
 * so a path or query that merely mentions an exempt domain does not make a url exempt.
 */
export function matchKeywords(url, keywords, exemptDomains = []) {
  const parsed = parseHttpUrl(url);
  if (parsed === null || !keywords?.length) return [];

  const host = parsed.hostname.toLowerCase();
  if (exemptDomains.some((entry) => (isIpHost(entry) ? host === entry : hostMatches(host, entry)))) return [];

  const withoutScheme = url.slice(url.indexOf("://") + 3).toLowerCase();
  const candidates = [withoutScheme, safeDecode(withoutScheme.replace(/\+/g, " "))];

  return keywords.filter((keyword) => {
    const needle = keyword.toLowerCase();
    return needle && candidates.some((text) => text.includes(needle));
  });
}

/** The first keyword contained in the url, or null. */
export function matchKeyword(url, keywords, exemptDomains = []) {
  return matchKeywords(url, keywords, exemptDomains)[0] ?? null;
}

/**
 * Why a url is blocked: { type: "rule", domain } | { type: "keyword", keyword } | null. A keyword wins over an
 * allowed path. `forbidden: true` is added when ANY rule or keyword the url matches is flagged forbidden, even if
 * the main reason shown is a different, ordinary one. The key is left out when nothing forbidden matched.
 */
export function findBlockReason(url, rules, keywords, keywordExemptDomains = [], forbiddenKeywords = []) {
  const parsed = parseHttpUrl(url);
  if (parsed === null) return null;

  const hits = matchKeywords(url, keywords, keywordExemptDomains);
  const rule = ruleBlocking(parsed, rules);
  if (hits.length === 0 && rule === null) return null;

  const forbidden = rule?.forbidden === true || hits.some((keyword) => forbiddenKeywords.includes(keyword));
  const flag = forbidden ? { forbidden: true } : {};

  if (hits.length > 0) return { type: "keyword", keyword: hits[0], ...flag };
  return { type: "rule", domain: rule.domain, ...flag };
}

/** Shutdown mode only acts on pages blocked because of something the user flagged forbidden. */
export function shouldShutDown(reason) {
  return reason?.forbidden === true;
}

import { needsPasswordToChange } from "./focus.js";
import { isIpHost, normalizeExemptHost } from "./matcher.js";

/** The three blocking modes the toolbar popup can switch between, in the order they are shown. */
export const SCOPE_BUTTONS = [
  { scope: "always", label: "Always on", title: "Your rules apply all the time" },
  { scope: "focus", label: "Focus mode", title: "Your rules apply only while focus mode is on" },
  { scope: "off", label: "Off", title: "Blocking is off completely" },
];

/** What the popup should show for the current state. Kept free of the DOM so it can be tested. */
export function popupModel({ hasPassword, focus }) {
  if (!hasPassword) return { ready: false, message: "Open settings and choose a password first." };

  return {
    ready: true,
    activeScope: focus.scope,
    // Start and End only make sense when rules apply "only during focus mode".
    startEnd:
      focus.scope !== "focus"
        ? null
        : focus.manualOn
          ? { action: "end", label: "End focus mode" }
          : { action: "start", label: "Start" },
  };
}

/**
 * The "skip keyword blocking on this site" toggle for the tab on screen: the host to offer (www dropped, an IP address
 * as it is) and the existing exception that covers it, if any. Null when the tab is not a web page.
 */
export function siteExemptModel(url, keywordExempt) {
  let hostname;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  let host;
  try {
    host = normalizeExemptHost(hostname);
  } catch {
    return null;
  }
  const covers = (entry) => (isIpHost(entry) ? hostname === entry : hostname === entry || hostname.endsWith("." + entry));
  return { host, entry: keywordExempt.find(covers) ?? null };
}

/** Whether switching to `wanted` does nothing, needs the password (a looser mode), or goes straight through. */
export function planScopeChange(current, wanted) {
  if (current === wanted) return { noop: true, needsPassword: false };
  return { noop: false, needsPassword: needsPasswordToChange(current, wanted) };
}

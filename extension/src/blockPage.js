// The screens below are drawn inside the blocked tab, so they never depend on navigating to an extension page
// (some Chromium browsers refuse that with ERR_BLOCKED_BY_CLIENT). Colors match the options page.
//
// Every render* function is serialized and injected into the tab with chrome.scripting.executeScript, so each one
// must stay self-contained: no imports and no variables from outside the function. They use DOM APIs only, which
// also works under strict page policies. `doc` defaults to the page's document; tests and the options-page preview
// pass another one.

/** Injected with chrome.scripting.insertCSS (exempt from the page's content security policy). */
export const BLOCK_PAGE_CSS = `
html[data-siteblocker] {
  --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b; --line: #e2e8f0; --danger: #dc2626;
}
@media (prefers-color-scheme: dark) {
  html[data-siteblocker] { --bg: #0b1220; --card: #131c2e; --text: #f1f5f9; --muted: #94a3b8; --line: #243049; --danger: #f87171; }
}
html[data-siteblocker], html[data-siteblocker] body {
  margin: 0; min-height: 100vh; background: var(--bg); color: var(--text);
  font: 15px/1.5 system-ui, sans-serif;
}
html[data-siteblocker] .sb-wrap { display: grid; place-items: center; min-height: 100vh; padding: 24px 16px; box-sizing: border-box; }
html[data-siteblocker] .sb-card { width: 100%; max-width: 460px; box-sizing: border-box; padding: 28px 24px; text-align: center; }
html[data-siteblocker] .sb-title { font-size: 24px; font-weight: 600; margin: 0 0 8px; }
html[data-siteblocker] .sb-count { font-size: 64px; font-weight: 700; line-height: 1.1; margin: 4px 0 8px; font-variant-numeric: tabular-nums; }
html[data-siteblocker] .sb-url { color: var(--muted); font-size: 13px; word-break: break-all; margin: 0 0 12px; }
html[data-siteblocker] .sb-note { color: var(--muted); margin: 0; }
`;

/** Replaces the current page with the built-in block screen. */
export function renderBlockPage(blockedUrl, doc = document) {
  if (typeof document !== "undefined" && doc === document) window.stop();

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const card = el("div", "sb-card");
  card.append(
    el("h1", "sb-title", "This site is blocked"),
    el("p", "sb-url", blockedUrl),
    el("p", "sb-note", "Open the SiteBlocker app and enter your password to change the block list."),
  );

  const wrap = el("div", "sb-wrap");
  wrap.append(card);

  const head = doc.createElement("head");
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  head.append(charset, el("title", "", "Blocked"));
  const body = doc.createElement("body");
  body.append(wrap);

  doc.documentElement.setAttribute("data-siteblocker", "1");
  doc.documentElement.replaceChildren(head, body);
}

/**
 * Replaces the current page with the user's own HTML. The HTML is cleaned first: only a short list of harmless
 * elements and attributes survive, so pasted templates cannot run script, load frames, submit forms or restyle the
 * page through <style>/<link>. CSS belongs in the separate CSS field (applied with insertCSS).
 * `{{url}}` and `{{host}}` are replaced by the blocked address, escaped so they can only ever be text.
 */
export function renderCustomBlockPage(blockedUrl, html, doc = document) {
  if (typeof document !== "undefined" && doc === document) window.stop();

  // Removed together with everything inside them.
  const DROP = new Set([
    "script", "style", "link", "meta", "base", "title", "head", "iframe", "frame", "frameset", "object", "embed",
    "applet", "form", "input", "button", "textarea", "select", "option", "svg", "math", "template", "noscript",
    "audio", "video", "source", "track", "canvas",
  ]);
  // Kept. Any other element is unwrapped: the element goes, its (cleaned) children stay.
  const ALLOWED = new Set([
    "a", "abbr", "b", "blockquote", "br", "caption", "code", "dd", "div", "dl", "dt", "em", "figcaption", "figure",
    "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i", "img", "li", "main", "mark", "ol", "p", "pre",
    "q", "s", "section", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
    "tr", "u", "ul",
  ]);
  const PLAIN_ATTRIBUTES = new Set(["class", "id", "title", "alt", "width", "height", "lang", "dir", "role", "colspan", "rowspan"]);

  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  let host = "";
  try {
    host = new URL(blockedUrl).hostname;
  } catch {
    // not a valid address: leave {{host}} empty
  }
  const filled = String(html).split("{{url}}").join(escapeHtml(blockedUrl)).split("{{host}}").join(escapeHtml(host));

  // DOMParser builds an inert document: nothing in it runs or loads until we copy the clean parts out.
  const parsed = new DOMParser().parseFromString(filled, "text/html");

  const clean = (node) => {
    if (node.nodeType === 3) return [doc.createTextNode(node.nodeValue)];
    if (node.nodeType !== 1) return []; // comments and anything else

    const tag = node.tagName.toLowerCase();
    if (DROP.has(tag)) return [];

    const children = [...node.childNodes].flatMap(clean);
    if (!ALLOWED.has(tag)) return children;

    const element = doc.createElement(tag);
    for (const { name, value } of [...node.attributes]) {
      const attribute = name.toLowerCase();
      const text = value.trim();
      if (PLAIN_ATTRIBUTES.has(attribute)) {
        element.setAttribute(attribute, value);
      } else if (attribute === "style") {
        element.style.cssText = value; // through the style object, which strict page policies allow
      } else if (tag === "a" && attribute === "href" && /^https?:\/\//i.test(text)) {
        element.setAttribute("href", text);
      } else if (
        tag === "img" &&
        attribute === "src" &&
        (/^https?:\/\//i.test(text) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(text))
      ) {
        element.setAttribute("src", text);
      }
    }
    if (tag === "a" && element.hasAttribute("href")) element.setAttribute("rel", "noopener noreferrer");

    element.append(...children);
    return [element];
  };

  const head = doc.createElement("head");
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  const title = doc.createElement("title");
  title.textContent = "Blocked";
  head.append(charset, title);

  const body = doc.createElement("body");
  body.append(...[...parsed.body.childNodes].flatMap(clean));

  doc.documentElement.setAttribute("data-siteblocker", "1");
  doc.documentElement.replaceChildren(head, body);
}

/**
 * Replaces the current page with an "unlocking" countdown. When it reaches zero it tells the extension, which then
 * shows the real outcome (block screen, redirect, shutdown). Does nothing, and returns false, when this document is
 * already showing one of our screens, so repeated navigation events cannot restart the countdown.
 */
export function renderCountdownPage(blockedUrl, seconds, doc = document) {
  const root = doc.documentElement;
  if (root.hasAttribute("data-siteblocker")) return false;
  if (typeof document !== "undefined" && doc === document) window.stop();

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const count = el("div", "sb-count", String(seconds));
  const card = el("div", "sb-card");
  card.append(
    el("h1", "sb-title", "Unlocking this site"),
    count,
    el("p", "sb-url", blockedUrl),
    el("p", "sb-note", "Hang tight, this page is about to open."),
  );
  const wrap = el("div", "sb-wrap");
  wrap.append(card);

  const head = doc.createElement("head");
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  head.append(charset, el("title", "", "Unlocking"));
  const body = doc.createElement("body");
  body.append(wrap);

  root.setAttribute("data-siteblocker", "1");
  root.replaceChildren(head, body);

  // Based on the clock rather than counting ticks, so a throttled background tab still finishes on time.
  const end = Date.now() + seconds * 1000;
  const timer = setInterval(() => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    count.textContent = String(left);
    if (left > 0) return;

    clearInterval(timer);
    try {
      const sent = chrome.runtime.sendMessage({ type: "unlockCountdownDone", url: blockedUrl });
      sent?.catch?.(() => {}); // the extension was reloaded: nothing left to tell
    } catch {
      // extension context invalidated
    }
  }, 1000);

  return true;
}

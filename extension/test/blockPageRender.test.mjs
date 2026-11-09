import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderCustomBlockPage, renderCountdownPage } from "../src/blockPage.js";

function freshDocument() {
  const dom = new JSDOM("<!doctype html><html><head><title>Original</title></head><body><p id='orig'>original page</p></body></html>");
  globalThis.DOMParser = dom.window.DOMParser; // the renderers use the global parser, as they do inside a real tab
  return dom.window.document;
}

const URL_ = "https://www.facebook.com/groups/1";
const render = (html, doc = freshDocument()) => {
  renderCustomBlockPage(URL_, html, doc);
  return doc;
};

test("allowed content is rendered and replaces the original page", () => {
  const doc = render('<h1 class="t">Hi</h1><p>Blocked: {{host}}</p>');
  assert.equal(doc.querySelector("h1.t").textContent, "Hi");
  assert.equal(doc.querySelector("p").textContent, "Blocked: www.facebook.com");
  assert.equal(doc.getElementById("orig"), null);
  assert.equal(doc.title, "Blocked");
  assert.equal(doc.documentElement.getAttribute("data-siteblocker"), "1");
});

test("{{url}} is shown as text, never as markup", () => {
  const doc = freshDocument();
  renderCustomBlockPage('https://x.com/<img src=x onerror=alert(1)>"', "<p>{{url}}</p>", doc);
  assert.equal(doc.querySelector("img"), null);
  assert.ok(doc.querySelector("p").textContent.includes("<img src=x onerror=alert(1)>"));
});

test("dangerous elements are removed together with their content", () => {
  const doc = render(
    "<script>alert(1)</script><iframe src='https://evil.example'></iframe><object data='x'></object><embed src='x'>" +
      "<form action='https://evil.example'><input name='pw'></form><svg><script>alert(2)</script></svg>" +
      "<style>body{display:none}</style><link rel='stylesheet' href='https://evil.example/x.css'>" +
      "<meta http-equiv='refresh' content='0;url=https://evil.example'><base href='https://evil.example/'><p>ok</p>",
  );
  const body = doc.body.innerHTML;
  for (const banned of ["script", "iframe", "object", "embed", "form", "input", "svg", "style", "link", "meta", "base", "alert"]) {
    assert.equal(body.toLowerCase().includes(banned), false, banned);
  }
  assert.equal(doc.querySelector("p").textContent, "ok");
});

test("dangerous elements nested inside allowed ones are removed too", () => {
  const doc = render("<div><script>x()</script><span>ok</span></div>");
  assert.equal(doc.body.querySelector("div").innerHTML, "<span>ok</span>");
});

test("event handlers and unknown attributes are stripped, safe ones kept", () => {
  const doc = render('<p onclick="x()" onmouseover="y()" data-x="1" formaction="z" class="a" id="b" title="t">hi</p>');
  const p = doc.querySelector("p");
  assert.deepEqual([...p.attributes].map((a) => a.name).sort(), ["class", "id", "title"]);
});

test("links keep only http(s) addresses and get rel=noopener", () => {
  const doc = render(
    '<a href="javascript:alert(1)">a</a><a href="https://example.com/">b</a><a href="data:text/html,x">c</a><a href="/relative">d</a>',
  );
  const [a, b, c, d] = doc.querySelectorAll("a");
  assert.equal(a.getAttribute("href"), null);
  assert.equal(b.getAttribute("href"), "https://example.com/");
  assert.equal(b.getAttribute("rel"), "noopener noreferrer");
  assert.equal(c.getAttribute("href"), null);
  assert.equal(d.getAttribute("href"), null);
});

test("images keep only http(s) and safe data:image sources", () => {
  const doc = render(
    '<img src="https://example.com/a.png" alt="a"><img src="javascript:alert(1)"><img src="data:text/html,x">' +
      '<img src="data:image/png;base64,AAAA"><img src="data:image/svg+xml;base64,AAAA">',
  );
  const [ok, js, html, png, svg] = doc.querySelectorAll("img");
  assert.equal(ok.getAttribute("src"), "https://example.com/a.png");
  assert.equal(js.getAttribute("src"), null);
  assert.equal(html.getAttribute("src"), null);
  assert.equal(png.getAttribute("src").startsWith("data:image/png"), true);
  assert.equal(svg.getAttribute("src").startsWith("data:image/svg+xml"), true);
});

test("inline style is applied through the style object, not as an attribute string", () => {
  const doc = render('<p style="color: red; font-size: 30px">hi</p>');
  const p = doc.querySelector("p");
  assert.equal(p.style.color, "red");
  assert.equal(p.style.fontSize, "30px");
});

test("unknown harmless elements are unwrapped and their children kept", () => {
  const doc = render("<center><b>bold</b></center>");
  assert.equal(doc.querySelector("center"), null);
  assert.equal(doc.querySelector("b").textContent, "bold");
});

test("comments are dropped and text is preserved", () => {
  const doc = render("<!-- secret --><p>one</p>two");
  assert.equal(doc.body.innerHTML.includes("secret"), false);
  assert.ok(doc.body.textContent.includes("one"));
  assert.ok(doc.body.textContent.includes("two"));
});

// --- unlock countdown screen ---------------------------------------------------------------------------------

function countdownSetup() {
  const sent = [];
  globalThis.chrome = { runtime: { sendMessage: (message) => sent.push(message) } };
  return { sent, doc: freshDocument() };
}

test("the countdown screen replaces the page and shows the starting number", () => {
  const { doc } = countdownSetup();
  assert.equal(renderCountdownPage(URL_, 10, doc), true);
  assert.equal(doc.getElementById("orig"), null);
  assert.equal(doc.querySelector(".sb-count").textContent, "10");
  assert.equal(doc.documentElement.getAttribute("data-siteblocker"), "1");
});

test("rendering the countdown again on the same document does not restart it", () => {
  const { doc } = countdownSetup();
  assert.equal(renderCountdownPage(URL_, 10, doc), true);
  assert.equal(renderCountdownPage(URL_, 10, doc), false);
});

test("a document that already shows a block page is left alone", () => {
  const { doc } = countdownSetup();
  renderCustomBlockPage(URL_, "<p>blocked</p>", doc);
  assert.equal(renderCountdownPage(URL_, 10, doc), false);
  assert.equal(doc.querySelector("p").textContent, "blocked");
});

test("the number counts down and one message is sent when it reaches zero", () => {
  mock.timers.enable({ apis: ["setInterval", "Date"] });
  try {
    const { doc, sent } = countdownSetup();
    renderCountdownPage(URL_, 3, doc);

    mock.timers.tick(1000);
    assert.equal(doc.querySelector(".sb-count").textContent, "2");
    assert.equal(sent.length, 0);

    mock.timers.tick(1000);
    assert.equal(doc.querySelector(".sb-count").textContent, "1");

    mock.timers.tick(1000);
    assert.equal(doc.querySelector(".sb-count").textContent, "0");
    assert.deepEqual(sent, [{ type: "unlockCountdownDone", url: URL_ }]);

    mock.timers.tick(5000); // the timer is cleared, so nothing more is sent
    assert.equal(sent.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("a message failure (extension reloaded) does not throw", () => {
  mock.timers.enable({ apis: ["setInterval", "Date"] });
  try {
    const doc = freshDocument();
    globalThis.chrome = { runtime: { sendMessage: () => { throw new Error("Extension context invalidated."); } } };
    renderCountdownPage(URL_, 1, doc);
    assert.doesNotThrow(() => mock.timers.tick(1000));
  } finally {
    mock.timers.reset();
  }
});

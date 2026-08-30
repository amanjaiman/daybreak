import assert from "node:assert/strict";
import test from "node:test";
import { buildWidgetSandboxDocument, isAllowedWidgetUrl } from "../src/lib/widgetSandbox.ts";

test("generated widget sandbox", async (t) => {
  await t.test("ships an opaque-runtime CSP with networking disabled", () => {
    const document = buildWidgetSandboxDocument(".gw-root { color: var(--ink); }");

    assert.match(document, /connect-src 'none'/);
    assert.match(document, /default-src 'none'/);
    assert.match(document, /id="widget-root" class="gw-root"/);
    assert.match(document, /daybreak-widget-v1/);
    assert.match(document, /new Function/);
  });

  await t.test("escapes attempted closing tags in embedded styles", () => {
    const document = buildWidgetSandboxDocument("</style><script>bad()</script>");

    assert.doesNotMatch(document, /<style><\/style><script>bad\(\)<\/script>/);
    assert.ok(document.includes("<\\/style><script>bad()</script>"));
  });

  await t.test("allows only credential-free HTTP(S) data URLs", () => {
    assert.equal(isAllowedWidgetUrl("https://api.example.com/data.json"), true);
    assert.equal(isAllowedWidgetUrl("http://localhost:3000/api/data"), true);
    assert.equal(isAllowedWidgetUrl("/api/weather?city=Boston"), true);
    assert.equal(isAllowedWidgetUrl("javascript:alert(1)"), false);
    assert.equal(isAllowedWidgetUrl("data:application/json,{}"), false);
    assert.equal(isAllowedWidgetUrl("file:///etc/passwd"), false);
    assert.equal(isAllowedWidgetUrl("https://user:secret@example.com/data"), false);
  });
});

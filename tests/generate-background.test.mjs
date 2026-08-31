import assert from "node:assert/strict";
import test from "node:test";
import {
  getWidgetGeneration,
  startWidgetGeneration,
  validateGeneratedWidget,
} from "../supabase/functions/_shared/generate.ts";

test("background widget generation lifecycle", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test("starts a stored background response", async () => {
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return Response.json({ id: "resp_test", status: "queued" });
    };

    assert.equal(await startWidgetGeneration("Track launches", "test-key"), "resp_test");
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(request.init.body);
    assert.equal(body.background, true);
    assert.equal(body.store, true);
    assert.equal(body.model, "gpt-5.6-sol");
    assert.equal(body.reasoning.effort, "high");
    assert.equal(body.max_tool_calls, 6);
    assert.equal(body.prompt_cache_key, "daybreak-widget-v3");
    assert.equal(body.text.verbosity, "low");
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.text.format.schema.required, ["title", "icon", "html", "script", "refreshMs"]);
  });

  await t.test("rejects widgets that escape the capability API", () => {
    const issues = validateGeneratedWidget({
      title: "Unsafe",
      icon: "panel",
      html: '<div style="color:#fff"></div>',
      script: "fetch('https://example.com').then(() => window.alert('nope'));",
      refreshMs: 60_000,
    });

    assert.ok(issues.some((issue) => issue.includes("direct network access")));
    assert.ok(issues.some((issue) => issue.includes("window")));
    assert.ok(issues.some((issue) => issue.includes("hard-coded colors")));
  });

  await t.test("requires complete states for data widgets", () => {
    const issues = validateGeneratedWidget({
      title: "Rates",
      icon: "money",
      html: '<div class="gw-hero"></div>',
      script: "widget.getJSON('https://example.com/rates').then(render);",
      refreshMs: null,
    });

    assert.ok(issues.includes("Data widget has no refresh interval"));
    assert.ok(issues.includes("Data widget has no loading state"));
    assert.ok(issues.includes("Data widget has no recoverable error path"));
    assert.ok(issues.includes("Data widget has no retry control"));
  });

  await t.test("keeps queued and in-progress responses pending", async () => {
    for (const status of ["queued", "in_progress"]) {
      globalThis.fetch = async () => Response.json({ id: "resp_test", status });
      assert.deepEqual(await getWidgetGeneration("resp_test", "test-key"), { status: "pending" });
    }
  });

  await t.test("validates and returns a completed widget", async () => {
    const spec = {
      title: "Launches",
      icon: "rocket-is-not-valid",
      html: "<div></div>",
      script: "widget.root.textContent = 'Ready';",
      refreshMs: 1000,
    };
    globalThis.fetch = async () =>
      Response.json({
        id: "resp_test",
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(spec) }],
          },
        ],
      });

    assert.deepEqual(await getWidgetGeneration("resp_test", "test-key"), {
      status: "done",
      widget: {
        title: "Launches",
        icon: "panel",
        html: "<div></div>",
        script: "widget.root.textContent = 'Ready';",
        refreshMs: 60_000,
      },
    });
  });

  await t.test("surfaces terminal OpenAI failures", async () => {
    globalThis.fetch = async () =>
      Response.json({ id: "resp_test", status: "failed", error: { message: "Model failed" } });
    assert.deepEqual(await getWidgetGeneration("resp_test", "test-key"), {
      status: "error",
      error: "Model failed",
    });
  });

  await t.test("turns an expired response into a terminal retry message", async () => {
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    assert.deepEqual(await getWidgetGeneration("resp_expired", "test-key"), {
      status: "error",
      error: "The generation result expired before it could be retrieved. Try again.",
    });
  });
});

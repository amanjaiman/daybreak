import assert from "node:assert/strict";
import test from "node:test";
import {
  getWidgetGeneration,
  startWidgetGeneration,
  startWidgetRepair,
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
    assert.equal(body.reasoning.effort, "medium");
    assert.equal(body.max_output_tokens, 12_000);
    assert.equal(body.max_tool_calls, 2);
    assert.equal(body.prompt_cache_key, "daybreak-widget-v5-build");
    assert.match(body.instructions, /Do not search for current values/);
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

  await t.test("rejects media that cannot load in the network-isolated frame", () => {
    const issues = validateGeneratedWidget({
      title: "Remote art",
      icon: "panel",
      html: '<img src="https://example.com/art.jpg">',
      script: "widget.root.dataset.ready = 'true';",
      refreshMs: null,
    });

    assert.ok(issues.includes("HTML contains a forbidden element"));
  });

  await t.test("starts a narrow tool-free repair only for listed failures", async () => {
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return Response.json({ id: "resp_repair", status: "queued" });
    };
    const draft = {
      title: "Birthdays",
      icon: "calendar",
      html: '<form class="gw-form"></form>',
      script: "widget.root.textContent = 'Ready';",
      refreshMs: null,
    };

    assert.equal(
      await startWidgetRepair("Track birthdays", draft, ["Data widget has no retry control"], "test-key"),
      "resp_repair",
    );
    const body = JSON.parse(request.init.body);
    assert.equal(body.background, true);
    assert.equal(body.prompt_cache_key, "daybreak-widget-v5-repair");
    assert.equal(body.reasoning.effort, "medium");
    assert.equal(body.max_output_tokens, 10_000);
    assert.equal(body.tools, undefined);
    assert.equal(body.max_tool_calls, undefined);
    assert.equal(body.text.format.type, "json_schema");
    assert.match(body.instructions, /Targeted repair/);
    assert.match(body.input, /Original request:\nTrack birthdays/);
    assert.match(body.input, /Data widget has no retry control/);
    assert.match(body.input, /Candidate widget:/);
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
    assert.ok(issues.includes("Data widget does not persist and render its last good data"));
  });

  await t.test("rejects multiple metered AI lookups in one widget", () => {
    const issues = validateGeneratedWidget({
      title: "Scores",
      icon: "trophy",
      html: '<div class="skeleton"></div><button type="button">Try again</button>',
      script: 'widget.on("click", "button", retry); widget.store.get(); widget.ai("games").catch(retry); widget.ai("standings").then(widget.store.set);',
      refreshMs: 3_600_000,
    });

    assert.ok(issues.includes("Widget makes multiple AI lookups instead of one combined request"));
  });

  await t.test("rejects fragile controls before they are published", () => {
    const issues = validateGeneratedWidget({
      title: "Planner",
      icon: "calendar",
      html: '<form class="gw-form"><input class="gw-input"><button type="button">Add</button></form>',
      script: 'widget.root.querySelector("form").addEventListener("submit", render);',
      refreshMs: null,
    });

    assert.ok(issues.includes("Widget uses fragile direct event listeners instead of widget.on"));
    assert.ok(issues.includes("Interactive widget does not use delegated widget.on handlers"));
    assert.ok(issues.includes("Form has no explicit submit control"));
  });

  await t.test("accepts delegated controls with an explicit submit action", () => {
    const issues = validateGeneratedWidget({
      title: "Planner",
      icon: "calendar",
      html: '<form class="gw-form"><input class="gw-input"><button type="submit">Add</button></form>',
      script: 'widget.on("submit", "form", (event) => { event.preventDefault(); widget.store.set([]); });',
      refreshMs: null,
    });

    assert.deepEqual(issues, []);
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

  await t.test("returns a structured candidate for one repair when checks fail", async () => {
    const spec = {
      title: "Rates",
      icon: "money",
      html: '<div class="gw-hero"></div>',
      script: "widget.getJSON('https://example.com/rates').then(render);",
      refreshMs: null,
    };
    globalThis.fetch = async () =>
      Response.json({
        id: "resp_invalid",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(spec) }] }],
      });

    const result = await getWidgetGeneration("resp_invalid", "test-key");
    assert.equal(result.status, "invalid");
    assert.deepEqual(result.status === "invalid" ? result.widget : null, spec);
    assert.ok(result.status === "invalid" && result.issues.includes("Data widget has no refresh interval"));
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

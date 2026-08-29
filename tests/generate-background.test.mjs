import assert from "node:assert/strict";
import test from "node:test";
import {
  getWidgetGeneration,
  startWidgetGeneration,
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
    assert.equal(body.model, "gpt-5");
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

import assert from "node:assert/strict";
import test from "node:test";
import { fetchWidgetData } from "../supabase/functions/_shared/widget-data.ts";

test("runtime widget data uses a bounded fast response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: '{"value":42}' }] }],
    });
  };

  assert.deepEqual(await fetchWidgetData("Return a value", "test-key"), { value: 42 });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.ok(request.init.signal instanceof AbortSignal);
  const body = JSON.parse(request.init.body);
  assert.equal(body.model, "gpt-5-mini");
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.max_tool_calls, 2);
  assert.equal(body.max_output_tokens, 4_000);
  assert.equal(body.text.verbosity, "low");
  assert.equal(body.prompt_cache_key, "daybreak-widget-data-v2");
});

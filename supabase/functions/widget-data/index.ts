// Runtime data lifeline for generated widgets: widget.ai(request) POSTs here
// and gets back parsed JSON from OpenAI (Responses API + live web search).
// Synchronous — no job/polling needed, because the widget already shows a
// skeleton while it waits and caches the result. It lives on Supabase (not
// Netlify) so a slow web-search lookup has real headroom instead of dying at
// Netlify's ~26s synchronous function ceiling.

import { fetchWidgetData } from "../_shared/widget-data.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "Data lookups aren't configured (OPENAI_API_KEY is not set)." });

  let prompt: unknown;
  try {
    prompt = ((await req.json()) as { prompt?: unknown }).prompt;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    return json(400, { error: "Data request must be 1-4000 characters." });
  }

  try {
    const data = await fetchWidgetData(prompt.trim(), apiKey, {
      model: Deno.env.get("OPENAI_DATA_MODEL") || Deno.env.get("OPENAI_MODEL") || undefined,
      effort: Deno.env.get("OPENAI_DATA_REASONING_EFFORT") || undefined,
    });
    return json(200, { data });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : "Data lookup failed" });
  }
});

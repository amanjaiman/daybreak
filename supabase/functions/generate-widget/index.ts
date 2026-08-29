// Kicks off an async "Generate Widget" job. The Daybreak frontend POSTs a
// prompt; we start an OpenAI background response, persist its id with a
// pending widget_jobs row, and return 202 immediately. The client polls the
// widget-status function, which retrieves and finalizes that OpenAI response.
//
// OpenAI owns the long-running work, so generation is no longer coupled to a
// Supabase Edge Function worker's wall-clock lifetime.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { startWidgetGeneration } from "../_shared/generate.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

// Supabase injects these into the edge runtime automatically.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "Widget generation isn't configured (OPENAI_API_KEY is not set)." });

  let prompt: unknown;
  try {
    prompt = ((await req.json()) as { prompt?: unknown }).prompt;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
    return json(400, { error: "Describe the widget in 1-2000 characters." });
  }
  const text = prompt.trim();

  let responseId: string;
  try {
    responseId = await startWidgetGeneration(text, apiKey, {
      model: Deno.env.get("OPENAI_MODEL") || undefined,
      effort: Deno.env.get("OPENAI_REASONING_EFFORT") || undefined,
    });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : "Widget generation failed to start" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from("widget_jobs")
    .insert({ prompt: text, status: "pending", openai_response_id: responseId })
    .select("id")
    .single();
  if (error || !row) {
    return json(500, { error: "Couldn't start the generation job." });
  }
  const jobId = row.id as string;

  return json(202, { jobId });
});

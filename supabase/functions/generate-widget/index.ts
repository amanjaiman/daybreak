// Kicks off an async "Generate Widget" job. The Daybreak frontend POSTs a
// prompt; we insert a pending row into widget_jobs, start the (slow, web-
// searching) gpt-5 generation as a background task via EdgeRuntime.waitUntil,
// and return 202 with the job id immediately. The client shows a placeholder
// card and polls the widget-status function until the row is done or errored.
//
// This lives on Supabase (not Netlify) precisely because a tool-using gpt-5
// generation runs far past Netlify's ~26s synchronous function ceiling; the
// edge runtime keeps the background task alive well beyond the 202 response.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateWidget } from "../_shared/generate.ts";
import { corsHeaders, json } from "../_shared/cors.ts";

// Supabase injects these into the edge runtime automatically.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Declared by the Supabase edge runtime; keeps a background promise alive
// after the response is sent (up to the function's wall-clock budget).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from("widget_jobs")
    .insert({ prompt: text, status: "pending" })
    .select("id")
    .single();
  if (error || !row) {
    return json(500, { error: "Couldn't start the generation job." });
  }
  const jobId = row.id as string;

  // Run the actual generation after responding. On finish, write the result
  // (or a short error) back to the row for the client's poll to pick up.
  EdgeRuntime.waitUntil(
    (async () => {
      try {
        const widget = await generateWidget(text, apiKey, {
          model: Deno.env.get("OPENAI_MODEL") || undefined,
          effort: Deno.env.get("OPENAI_REASONING_EFFORT") || undefined,
        });
        await supabase.from("widget_jobs").update({ status: "done", result: widget }).eq("id", jobId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Widget generation failed";
        await supabase.from("widget_jobs").update({ status: "error", error: message }).eq("id", jobId);
      }
    })(),
  );

  return json(202, { jobId });
});

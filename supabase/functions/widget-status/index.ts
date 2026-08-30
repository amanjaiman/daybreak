// Polled by the Daybreak frontend to learn how a generation job is going.
// GET /widget-status?id=<jobId> -> { status, widget? , error? }. Reads the
// widget_jobs row with the service role key, so the table itself stays fully
// locked to anon callers (no RLS exposure of prompts or results).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getWidgetGeneration } from "../_shared/generate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GENERATION_TIMEOUT_MS = 15 * 60_000;
const GENERATION_TIMEOUT_MESSAGE = 'This widget took longer than 15 minutes to build. Try again.';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "GET only" });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json(503, { error: "Widget generation isn't configured (OPENAI_API_KEY is not set)." });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json(400, { error: "Missing job id" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from("widget_jobs")
    .select("status, result, error, openai_response_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return json(500, { error: "Couldn't read the generation job." });
  if (!row) return json(404, { error: "Unknown job" });

  if (row.status === "done") return json(200, { status: "done", widget: row.result });
  if (row.status === "error") return json(200, { status: "error", error: row.error ?? "Widget generation failed" });

  const responseId = row.openai_response_id as string | null;
  if (!responseId) {
    const message = "This generation was interrupted before it started. Try again.";
    await supabase.from("widget_jobs").update({ status: "error", error: message }).eq("id", id);
    return json(200, { status: "error", error: message });
  }

  let generation;
  try {
    generation = await getWidgetGeneration(responseId, apiKey);
    if (generation.status === 'pending') {
      const { data: ageRow } = await supabase
        .from('widget_jobs')
        .select('created_at')
        .eq('id', id)
        .single();
      const createdAt = Date.parse(ageRow?.created_at ?? '');
      if (Number.isFinite(createdAt) && Date.now() - createdAt >= GENERATION_TIMEOUT_MS) {
        await supabase
          .from('widget_jobs')
          .update({ status: 'error', error: GENERATION_TIMEOUT_MESSAGE })
          .eq('id', id)
          .eq('status', 'pending');
        return json(200, { status: 'error', error: GENERATION_TIMEOUT_MESSAGE });
      }
    }
  } catch {
    // OpenAI status retrieval can fail transiently (network, rate limit, 5xx).
    // Keep the durable job pending; the client will retry this endpoint.
    return json(503, { error: "Generation status is temporarily unavailable." });
  }

  if (generation.status === "pending") return json(200, generation);
  if (generation.status === "done") {
    await supabase
      .from("widget_jobs")
      .update({ status: "done", result: generation.widget })
      .eq("id", id)
      .eq("status", "pending");
    return json(200, { status: "done", widget: generation.widget });
  }

  await supabase
    .from("widget_jobs")
    .update({ status: "error", error: generation.error })
    .eq("id", id)
    .eq("status", "pending");
  return json(200, generation);
});

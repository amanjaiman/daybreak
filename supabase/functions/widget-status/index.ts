// Polled by the Daybreak frontend to learn how a generation job is going.
// GET /widget-status?id=<jobId> -> { status, widget? , error? }. Reads the
// widget_jobs row with the service role key, so the table itself stays fully
// locked to anon callers (no RLS exposure of prompts or results).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { getWidgetGeneration, startWidgetRepair } from "../_shared/generate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GENERATION_TIMEOUT_MS = 15 * 60_000;
const GENERATION_TIMEOUT_MESSAGE = 'This widget took longer than 15 minutes to build. Try again.';
const REVIEW_START_TIMEOUT_MS = 2 * 60_000;

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
    .select("status, result, error, openai_response_id, prompt, generation_stage, stage_started_at, draft, review_error, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return json(500, { error: "Couldn't read the generation job." });
  if (!row) return json(404, { error: "Unknown job" });

  if (row.status === "done") return json(200, { status: "done", widget: row.result });
  if (row.status === "error") return json(200, { status: "error", error: row.error ?? "Widget generation failed" });

  const stage = (row.generation_stage ?? "build") as "build" | "review_starting" | "review";
  let draft = row.draft as Record<string, unknown> | null;
  const repairing = typeof row.review_error === "string" && row.review_error.startsWith("repair:");
  const publishDraft = async (reviewError: string) => {
    // A repair draft failed validation and must never be published as a
    // fallback. This path remains only for valid drafts from legacy review jobs.
    if (!draft || repairing) return null;
    await supabase
      .from("widget_jobs")
      .update({ status: "done", result: draft, review_error: reviewError })
      .eq("id", id)
      .eq("status", "pending");
    return json(200, { status: "done", widget: draft, reviewFallback: true });
  };
  const failRepair = async (message: string) => {
    await supabase
      .from("widget_jobs")
      .update({ status: "error", error: message })
      .eq("id", id)
      .eq("status", "pending");
    return json(200, { status: "error", error: message });
  };

  if (stage === "review_starting") {
    const stageStartedAt = Date.parse(row.stage_started_at as string);
    if (Number.isFinite(stageStartedAt) && Date.now() - stageStartedAt >= REVIEW_START_TIMEOUT_MS) {
      if (repairing) return await failRepair("The generated widget could not be repaired in time. Try again.");
      const fallback = await publishDraft("Review did not start in time; published the validated draft.");
      if (fallback) return fallback;
    }
    return json(200, { status: "pending", stage: "review" });
  }

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
      const createdAt = Date.parse(row.created_at as string);
      if (Number.isFinite(createdAt) && Date.now() - createdAt >= GENERATION_TIMEOUT_MS) {
        if (stage === "review") {
          if (repairing) return await failRepair("The generated widget repair exceeded the deadline. Try again.");
          const fallback = await publishDraft("Review exceeded the generation deadline; published the validated draft.");
          if (fallback) return fallback;
        }
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

  if (generation.status === "pending") {
    return json(200, { ...generation, stage: stage === "build" ? "build" : "review" });
  }

  if (generation.status === "invalid" && stage === "build") {
    const now = new Date().toISOString();
    const repairMarker = `repair:${generation.issues.join("; ")}`;
    const { data: claimed } = await supabase
      .from("widget_jobs")
      .update({
        generation_stage: "review_starting",
        stage_started_at: now,
        draft: generation.widget,
        review_error: repairMarker,
      })
      .eq("id", id)
      .eq("status", "pending")
      .eq("generation_stage", "build")
      .select("id")
      .maybeSingle();
    if (!claimed) return json(200, { status: "pending", stage: "review" });
    draft = generation.widget;

    let repairId: string;
    try {
      repairId = await startWidgetRepair(row.prompt as string, generation.widget, generation.issues, apiKey, {
        model:
          Deno.env.get("OPENAI_REPAIR_MODEL") ||
          Deno.env.get("OPENAI_REVIEW_MODEL") ||
          Deno.env.get("OPENAI_MODEL") ||
          undefined,
        effort:
          Deno.env.get("OPENAI_REPAIR_REASONING_EFFORT") ||
          Deno.env.get("OPENAI_REVIEW_REASONING_EFFORT") ||
          undefined,
      });
    } catch (err) {
      return await failRepair(
        err instanceof Error ? err.message : "The generated widget failed checks and repair did not start. Try again.",
      );
    }

    await supabase
      .from("widget_jobs")
      .update({ generation_stage: "review", stage_started_at: new Date().toISOString(), openai_response_id: repairId })
      .eq("id", id)
      .eq("status", "pending")
      .eq("generation_stage", "review_starting");
    return json(200, { status: "pending", stage: "review" });
  }

  if (generation.status === "invalid") {
    if (stage === "review" && !repairing) {
      const fallback = await publishDraft(`Legacy review failed checks: ${generation.issues.join("; ")}`);
      if (fallback) return fallback;
    }
    return await failRepair(`The generated widget still failed quality checks: ${generation.issues.join("; ")}. Try again.`);
  }

  if (generation.status === "done") {
    await supabase
      .from("widget_jobs")
      .update({ status: "done", result: generation.widget, draft: null, review_error: null })
      .eq("id", id)
      .eq("status", "pending");
    return json(200, { status: "done", widget: generation.widget, repaired: stage === "review" && repairing });
  }

  if (stage === "review") {
    if (repairing) return await failRepair(generation.error);
    const fallback = await publishDraft(generation.error);
    if (fallback) return fallback;
  }

  await supabase
    .from("widget_jobs")
    .update({ status: "error", error: generation.error })
    .eq("id", id)
    .eq("status", "pending");
  return json(200, generation);
});

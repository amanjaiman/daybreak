// Polled by the Daybreak frontend to learn how a generation job is going.
// GET /widget-status?id=<jobId> -> { status, widget? , error? }. Reads the
// widget_jobs row with the service role key, so the table itself stays fully
// locked to anon callers (no RLS exposure of prompts or results).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "GET only" });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json(400, { error: "Missing job id" });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from("widget_jobs")
    .select("status, result, error")
    .eq("id", id)
    .maybeSingle();

  if (error) return json(500, { error: "Couldn't read the generation job." });
  if (!row) return json(404, { error: "Unknown job" });

  if (row.status === "done") return json(200, { status: "done", widget: row.result });
  if (row.status === "error") return json(200, { status: "error", error: row.error ?? "Widget generation failed" });
  return json(200, { status: "pending" });
});

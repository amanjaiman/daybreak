// Client side of the async "Generate Widget" job: kick off a generation and
// poll it to completion. In production these call the Supabase edge functions
// directly (the publishable key is public by design); in dev they hit the
// Vite middleware twin at /api/* (see vite.config.ts), which runs the same
// generation core against an in-memory job map — so local dev still needs only
// OPENAI_API_KEY, no Supabase.

import type { GeneratedWidget } from "./customWidgets";
import { fnHeaders, fnUrl } from "./backend";

/** Start a generation job; resolves to its job id once the backend accepts it. */
export async function startGeneration(prompt: string): Promise<string> {
  const res = await fetch(fnUrl("generate-widget"), {
    method: "POST",
    headers: fnHeaders(),
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  if (!data.jobId) throw new Error("Generation didn't start (no job id).");
  return data.jobId;
}

type JobStatus =
  | { status: "pending" }
  | { status: "done"; widget: GeneratedWidget }
  | { status: "error"; error: string };

async function fetchStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${fnUrl("widget-status")}?id=${encodeURIComponent(jobId)}`, {
    headers: fnHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as JobStatus & { error?: string };
  if (res.status === 404) {
    return { status: "error", error: data.error ?? "This generation job no longer exists. Try again." };
  }
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

const POLL_MS = 2500;
const FIRST_POLL_MS = 1200;
const MAX_RETRY_MS = 30_000;

/**
 * Poll a job until it finishes, calling back with the widget or an error.
 * Transient network/poll failures are swallowed and retried with backoff.
 * There is deliberately no client-side generation deadline: the OpenAI
 * response is a durable background job, and placeholders persist across
 * reloads, so a slow-but-healthy generation must not become a false error.
 * Returns a cancel function (used when the placeholder card is removed).
 */
export function pollJob(
  jobId: string,
  cbs: { onDone: (widget: GeneratedWidget) => void; onError: (message: string) => void },
): () => void {
  let cancelled = false;
  let consecutiveFailures = 0;

  const loop = async () => {
    if (cancelled) return;
    try {
      const s = await fetchStatus(jobId);
      if (cancelled) return;
      consecutiveFailures = 0;
      if (s.status === "done") return cbs.onDone(s.widget);
      if (s.status === "error") return cbs.onError(s.error);
    } catch {
      consecutiveFailures += 1;
    }
    if (cancelled) return;
    const retryMs = Math.min(POLL_MS * 2 ** Math.min(consecutiveFailures, 4), MAX_RETRY_MS);
    window.setTimeout(loop, retryMs);
  };

  window.setTimeout(loop, FIRST_POLL_MS);
  return () => {
    cancelled = true;
  };
}

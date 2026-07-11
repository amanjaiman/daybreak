// Runtime data source for generated widgets: widget.ai(request) posts here,
// and we ask the OpenAI Responses API — with live web search — to answer
// with pure JSON. This is what lets a generated widget be "smart" about
// real-world data that has no free public API (local gas prices, rankings,
// schedules, …) instead of asking the user to type it in.
//
// Kept standalone (no imports outside this directory) so Netlify's function
// bundler doesn't need to resolve paths beyond netlify/functions/. The Vite
// dev server imports fetchWidgetData() from here for its /api/widget-data
// middleware.

const SYSTEM = `You are a data source for a personal-dashboard widget. The request describes real-world data to look up and the exact JSON shape to return. Use web search whenever the request involves current or local real-world data. Respond with ONLY the JSON value (no prose, no markdown fences) in exactly the requested shape; use numbers for numeric values.

Always return the best available data — never refuse because the exact granularity, time span, or locality isn't published:
- If the requested locality isn't covered, substitute the nearest published level (city -> metro -> state -> national) and say so in any label field.
- If the requested granularity doesn't exist (e.g. daily history when only current + weekly/monthly averages are published), fill the requested shape with reasonable values derived from what IS published (e.g. interpolate a daily series from current, week-ago, and month-ago figures). Widgets show trends at a glance; a faithful approximation clearly beats no data.
- Reputable estimates are fine; pick the best figure and move on.
Only respond with {"error": "<short reason>"} if you can find nothing relevant at all — this should be rare.`;

/** Extract the assistant's final text from a Responses API payload. */
function outputText(data: { output?: { type?: string; content?: { type?: string; text?: string }[] }[] }): string {
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

/** Pull the first JSON value out of a text blob (tolerates stray prose/fences). */
function parseLooseJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    if (start !== -1) {
      const candidate = cleaned.slice(start, (cleaned.lastIndexOf(cleaned[start] === "[" ? "]" : "}") + 1) || undefined);
      try {
        return JSON.parse(candidate);
      } catch {
        /* fall through */
      }
    }
    throw new Error("The data lookup didn't return valid JSON");
  }
}

export async function fetchWidgetData(prompt: string, apiKey: string): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_DATA_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
      // Low effort keeps lookups inside Netlify's ~26s synchronous limit.
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      instructions: SYSTEM,
      input: prompt,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Data lookup failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = parseLooseJSON(outputText((await res.json()) as Parameters<typeof outputText>[0]));
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

type NetlifyEvent = {
  httpMethod?: string;
  body?: string | null;
};

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(503, { error: "Data lookups aren't configured (OPENAI_API_KEY is not set)." });

  let prompt: unknown;
  try {
    prompt = (JSON.parse(event.body ?? "{}") as { prompt?: unknown }).prompt;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    return json(400, { error: "Data request must be 1-4000 characters." });
  }

  try {
    return json(200, { data: await fetchWidgetData(prompt.trim(), apiKey) });
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : "Data lookup failed" });
  }
};

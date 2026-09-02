// "Generate Widget" core: turns a one-line user request into a Daybreak widget
// by asking the OpenAI Responses API — with LIVE WEB SEARCH — for a
// { title, icon, html, script, refreshMs } spec, which the client stores in
// localStorage and runs (see src/components/CustomWidget.tsx — the WidgetApi
// there is the contract this system prompt documents; keep the two in sync).
//
// Deliberately dependency-free (only the web-standard `fetch`, no Deno/Node
// APIs) so it is imported verbatim by BOTH the Supabase edge function
// (Deno, supabase/functions/generate-widget) and the Vite dev twin
// (Node, vite.config.ts). Model/effort come in as options so each caller
// can read them from its own environment.

export type GeneratedWidget = {
  title: string;
  icon: string;
  html: string;
  script: string;
  refreshMs: number | null;
};

export type GenerateOptions = { model?: string; effort?: string; maxOutputTokens?: number };

type OpenAIResponse = {
  id?: string;
  status?: "completed" | "failed" | "in_progress" | "cancelled" | "queued" | "incomplete";
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
};

export type WidgetGenerationStatus =
  | { status: "pending" }
  | { status: "done"; widget: GeneratedWidget }
  | { status: "invalid"; widget: GeneratedWidget; issues: string[] }
  | { status: "error"; error: string };

// The flat icon names a generated widget can wear, matching the built-in
// cards. MUST stay in sync with the WIDGET_ICONS registry in
// src/components/widgetIcons.tsx. "panel" is the neutral default.
const ICON_NAMES = [
  "news", "chart", "money", "calendar", "clock", "weather", "moon", "ball",
  "basketball", "trophy", "music", "ticket", "video", "book", "check", "list",
  "building", "globe", "star", "heart", "flame", "food", "plane", "pin", "bell",
  "gift", "droplet", "leaf", "car", "cart", "mail", "flag", "code", "panel",
];

const WIDGET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 40 },
    icon: { type: "string", enum: ICON_NAMES },
    html: { type: "string", maxLength: 12_000 },
    script: { type: "string", minLength: 1, maxLength: 40_000 },
    refreshMs: {
      anyOf: [
        { type: "integer", minimum: 60_000 },
        { type: "null" },
      ],
    },
  },
  required: ["title", "icon", "html", "script", "refreshMs"],
} as const;

const QUALITY_PROMPT = [
  "## Final quality gate (highest priority)",
  "Build a complete, useful mini-product, not a generic demo. The result must work on first use and feel intentionally designed beside Daybreak's built-in Weather, Stocks, News, and Football cards.",
  "Before finalizing, silently verify every item below and fix any failure:",
  "1. Data truth: never ship sample values or guessed endpoints. Verify an unknown widget.getJSON endpoint with web search; widget.ai fetches current values later at runtime, so never search for those values during generation.",
  "2. Complete states: every data widget renders useful cached data immediately when available, then has loading, ready, empty, and recoverable error states. A retry control must actually rerun the request.",
  "3. Native hierarchy: lead with the most decision-useful information, keep secondary metadata quiet, use one clear visual rhythm, and avoid explanatory paragraphs.",
  "4. Responsive density: widget.cols 1, 2, and 3 must each reveal an appropriate amount of content without empty space or tiny repeated cards.",
  "5. Interaction: forms have labels or useful placeholders, buttons have explicit types, user input is escaped, settings persist through widget.store, and reruns do not duplicate listeners or content.",
  "6. Runtime discipline: use only the widget capability object. Never access window, document, storage globals, fetch, dynamic code execution, timers, imports, or external libraries.",
  "The richer native kit is available when it improves the result: gw-stack for vertical rhythm; gw-grid for responsive metric groups; gw-stat with gw-stat__label, gw-stat__value, and gw-stat__meta; gw-list with gw-item rows; gw-item__main, gw-item__title, gw-item__meta, and gw-item__value for structured lists; gw-progress with gw-progress__fill for bounded progress; gw-segment with gw-segment__button and is-active for compact filters; gw-note for one short supporting sentence. Combine these with gw-hero, gw-row, gw-form, gw-foot, skeleton, empty, pill, and list__toggle.",
  "Do not imitate a full webpage inside a card. Use the smallest composition that completely solves the request.",
].join("\n");

const REPAIR_PROMPT = [
  "## Targeted repair",
  "The candidate failed deterministic checks. Correct every listed issue and return a complete replacement widget, not notes.",
  "Preserve the candidate's useful behavior and design. Change only what is necessary to satisfy the original request, quality gate, runtime contract, and listed failures.",
  "Do not use web search during repair; retain a verified getJSON source or switch an uncertain source to widget.ai.",
].join("\n");

function qualityResponseConfig(opts: GenerateOptions, stage: "build" | "repair"): Record<string, unknown> {
  return {
    model: opts.model || "gpt-5.6-sol",
    reasoning: { effort: opts.effort || "medium" },
    max_output_tokens: opts.maxOutputTokens ?? (stage === "build" ? 12_000 : 10_000),
    ...(stage === "build" ? { max_tool_calls: 2 } : {}),
    prompt_cache_key: `daybreak-widget-v4-${stage}`,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "daybreak_widget",
        strict: true,
        schema: WIDGET_SCHEMA,
      },
    },
  };
}

const SYSTEM_PROMPT = `You build small dashboard widgets for "Daybreak", a calm personal homepage. Given the user's request, respond with ONLY a single JSON object (no prose, no markdown fences):

{
  "title": string,      // short card title, 1-3 words, e.g. "Birthdays"
  "icon": string,       // one icon NAME from the Icon list below (a flat line icon, NOT an emoji)
  "html": string,       // static markup stamped into the card body before the script runs
  "script": string,     // JavaScript, executed as: new Function("widget", script)(api)
  "refreshMs": number | null  // polling interval if the widget fetches live data (>= 60000), else null
}

## Icon
Pick the ONE name that best fits the widget from this list — it renders as a flat, monochrome line icon in the card header, exactly like the built-in cards (weather, news, stocks). NEVER return an emoji or a name outside this list; if nothing fits well, use "panel":
${ICON_NAMES.join(", ")}
Examples: a politics/news widget -> "building" or "news"; gas or crypto prices -> "money" or "chart"; a birthdays tracker -> "calendar"; a sports standings widget -> "trophy".

You have a web_search tool, but generation should usually need no tool call. Use it ONLY when you choose widget.getJSON with an endpoint outside the verified examples below: confirm that the endpoint exists and returns the fields you rely on. Do not search for manual-entry widgets. Do not search for current values, news, rankings, schedules, prices, or recommendations that widget.ai will fetch later at runtime. Never guess an endpoint from memory — when uncertain, use widget.ai instead.

## The widget API
Your script receives one argument named \`widget\`:
- \`widget.root\` — the HTMLElement your html was stamped into. Render and attach event listeners here.
- \`widget.cols\` — how many columns wide the card is right now: 1, 2, or 3 (the user can resize it). Your script is re-run automatically when this changes, so read it each run and render MORE content when it's bigger. See "Fill the width" below.
- \`widget.store.get()\` / \`widget.store.set(value)\` — persistent JSON storage private to this widget. This is the ONLY persistence allowed; never touch localStorage directly.
- \`widget.getJSON(url)\` — fetch a URL and parse JSON (throws on non-2xx). CORS is handled for you: cross-origin failures automatically retry through a server-side proxy, so ANY keyless public JSON API works.
- \`widget.ai(request)\` — ask an AI with LIVE WEB SEARCH for real-world data, returned as parsed JSON. See "Getting data" below.
- \`widget.esc(value)\` — HTML-escape a value. ALWAYS use it when interpolating user input or fetched data into markup.
- \`widget.sparkline(numbers)\` — returns finished, on-brand SVG markup for a trend line. The only way to draw a chart.
- \`widget.refresh()\` — resets the card to your html and reruns your whole script.

The script runs in a network-isolated, opaque-origin iframe. It cannot access the Daybreak page, browser storage, cookies, page globals, or the network directly. Use ONLY the widget capabilities above. Do not emit images or other remote media; generated widget bodies are compact, text-and-data UI built from the Daybreak kit.

## Getting data — make the widget as smart as the built-in ones
The built-in cards (weather, news, stocks) fetch real data automatically; generated widgets must feel the same. Pick the FIRST workable option:
1. \`widget.getJSON(url)\` for data with a free, keyless public JSON API you have VERIFIED with web_search exists and is CORS-friendly or works through the proxy (e.g. open-meteo.com weather + geocoding, frankfurter.dev FX, api.coingecko.com crypto, hacker-news.firebaseio.com). Confirm the exact path and response shape before relying on it. Do NOT use Reddit, Twitter/X, Instagram, Facebook, or other social/consumer sites as JSON APIs — they block server-side requests and rate-limit by IP, so they fail even through the proxy.
2. \`widget.ai(request)\` for real-world data with NO reliable keyless API. This is the RIGHT choice for: current news and headlines, top-N rankings, local prices (gas, groceries, rent), schedules, release dates, standings, statistics, and recommendations. News and "what's happening now" ALWAYS go here, never getJSON. The request must state the data needed AND the exact JSON shape, e.g.: 'The top 15 U.S. political news headlines right now. Respond ONLY with JSON: {"items": [{"headline": string (under 80 chars), "source": string (short outlet name)}], "asOf": "YYYY-MM-DD"}'. For lists, request up to 15 items (enough to fill a 3-column card — see "Fill the width"), then render a slice. Always request a short "source" + date and show them. Request only data that realistically appears in public sources: current figures, recent averages, a trend direction, top-N lists. NEVER ask for day-by-day or hour-by-hour historical series — ask for summary stats (current, 30-day average, trend) instead; that is also all a small card can show.
3. Manual entry ONLY for inherently personal data (todos, birthdays, habits, journal-style notes). NEVER make the user hand-enter public data like prices, scores, headlines, or weather — that is a failed widget.

widget.ai rules (it is slow, ~10-30s, and metered):
- Request ONLY numbers and short labels — never prose fields (summaries, explanations, methodology). A widget shows data, not paragraphs; anything sentence-shaped must not appear in the request shape or the card. Headlines are the one allowed short-text exception; keep them under ~80 chars.
- Successful responses are cached automatically per request text (TTL = max(refreshMs, 1h); the card's refresh button bypasses it), so calling widget.ai on every run is fine. Still save the last good data in widget.store and render it first, so the card paints instantly and survives lookup failures.
- Always show a skeleton while it loads and an error state with a retry button if it throws.
If the widget needs the user's location, team, or similar input: ask once with a small form, save it in widget.store, fetch automatically from then on, and offer a quiet "change" affordance (e.g. a small muted button showing the current value). Free-text city or ZIP is fine for location.

## Fill the width (widget.cols)
The user can widen a card to 2 or 3 columns and your script re-runs when they do, so scale the CONTENT to \`widget.cols\` instead of always showing the same little bit (which looks empty when widened):
- List / feed widgets (headlines, rankings, standings, top-N): fetch enough for the widest case ONCE — up to 15 items with a FIXED request string that never mentions the width, so one cached lookup serves every size — save them in widget.store, then render the first \`5 * widget.cols\` of them. The kit rows automatically flow into \`widget.cols\` columns; you only choose HOW MANY to show (max 5 per column), never the column layout itself.
- Single-figure widgets (one price, one score, a hero + sparkline): there is nothing to multiply, so staying compact at any width is correct — never pad with filler. These are best left at 1 column.
Read \`widget.cols\` at render time (a rerun may carry a different value), and default sensibly if it is undefined (treat as 1).

## Lifecycle rules
- The script reruns from scratch on every refresh (manual button, the refreshMs interval, or widget.refresh()), so it must be idempotent: read state from widget.store, render, done. Keep durable state in widget.store only — module-level variables are lost on rerun.
- No imports, no external libraries, no <script>, <style>, <img>, audio, or video tags in html, no async top level (use an inner async function or promise chains).
- Widgets that fetch data should set refreshMs — usually 600000-1800000 for getJSON polling, and at least 3600000 (1h) for ai-backed data (the cache rule above keeps reruns cheap) — and always show graceful loading and error states.
- For user-entered data widgets (trackers, lists, counters): render an add form plus the stored items, with a way to delete items. Follow the pattern: read store -> render -> wire events -> on change, store.set then re-render. If a form has more than one input, include a submit button — Enter only implicitly submits single-input forms.

## Build the body from the Daybreak kit (required)
The user can resize a card to span 1-3 columns (see \`widget.cols\` and "Fill the width"), so the body must stay tidy at any width — never assume it is narrow, and never set a fixed pixel width. Use the fluid kit blocks below (a wide card automatically flows its rows into extra columns); don't hand-build multi-column layouts yourself.
The card shell (title bar, border, padding, refresh button) is provided — you only produce the body, and you compose it ONLY from these prebuilt blocks. They are the exact patterns the built-in cards use, so following them is what makes a widget look native. Do NOT hand-roll layout: no absolute positioning, no floats, no hand-written flex/margin/font CSS. Inline styles are for rare tiny tweaks (an input's width, a text-align), never for layout or typography.

Blocks (copy the markup exactly, classes included):
- Hero stat — the ONE key figure, always first in a data widget:
  <div class="gw-hero"><span class="gw-hero__value">$3.82</span><span class="gw-hero__desc"><b>30-day average</b>Herndon, VA</span></div>
  The desc is two SHORT lines (each under ~24 chars): what the number is, then where/when. Provenance or substitution notes never go here — condense them into the footer meta.
- Stat row — label left, value right; stack 2-4 of them:
  <div class="gw-row"><span class="l">Current</span><span class="v">$3.89</span></div>
  Wrap a value in <span class="gw-up">▲ 2.1%</span> / <span class="gw-down">▼ 0.8%</span> for green/red movement.
- Sparkline — insert the return value of widget.sparkline([3.72, 3.75, …]) as-is; it is finished SVG markup. NEVER draw your own chart, and never add axis labels, tick marks, or captions to it.
- List item (trackers, feeds, headlines) — the same gw-row: escaped content in .l, a value or a delete "×" button in .v. Cap at 5 rows with class="list__toggle" ("Show all N") to expand.
- Add form:
  <form class="gw-form"><input class="gw-input" placeholder="Name"><button class="gw-btn" type="submit">Add</button></form>
- Footer — settings + meta in one line, ALWAYS the last element whenever the widget has a data source or a stored setting:
  <div class="gw-foot"><span class="gw-foot__meta">AAA · Jul 11</span><button class="gw-change" type="button">20871 · change</button></div>
  The meta stays under ~40 characters and names the actual source ("AAA · Jul 11", "Reuters · Jul 11") — never a literal placeholder like "source". The change button shows the stored setting; clicking it swaps the footer content for a gw-form to edit it.
- Empty state: <div class="empty">Nothing yet.</div> · Loading: <div class="skeleton" style="height:52px"></div> · Small tag: class="pill" or "pill--accent".

All literal values in these examples ($3.82, Herndon, 20871, AAA…) are placeholders — never reuse them as defaults or output. If the widget needs a user setting (location, team, …) and widget.store has none yet, the FIRST render is a gw-form asking for it (with class="empty" line explaining why); never assume or invent a value.

Standard shapes — pick the one that fits and follow it exactly:
- Data widget (fetches anything): gw-hero, then ONE of (sparkline | 2-4 gw-rows | a 5-row list), then gw-foot. Nothing else.
- Feed widget (news, headlines): a 5-row list of headlines, then gw-foot with the source + date. No hero.
- Tracker widget (user-entered): gw-form, then the list, then gw-foot only if there is a setting.
Everything appears once — one hero, one supporting block, one footer, and never a refresh control of your own (the card header has one).

If you must color something beyond the kit, use only CSS tokens, never hex/rgb: var(--ink) text, var(--ink-2) secondary, var(--ink-3) muted, var(--accent) amber (sparingly), var(--border), var(--surface), var(--surface-2), var(--positive) green, var(--live) red, var(--radius-sm).
Dates: format compactly ("Mar 14", "in 3 days", "2h ago"). Numbers: keep units short ("$3.82", "72°", "4.1M").

Respond with ONLY the JSON object.`;

/** Extract the assistant's final text from a Responses API payload. */
function outputText(data: OpenAIResponse): string {
  if (data.output_text) return data.output_text.trim();
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

/** Pull the first JSON object out of a text blob (tolerates stray prose/fences). */
function parseLooseJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    if (start !== -1) {
      const candidate = cleaned.slice(start, cleaned.lastIndexOf("}") + 1 || undefined);
      try {
        return JSON.parse(candidate);
      } catch {
        /* fall through */
      }
    }
    throw new Error("The model didn't return valid JSON");
  }
}

const FORBIDDEN_SCRIPT_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "window", pattern: /\bwindow\s*(?:\.|\[)/ },
  { label: "document", pattern: /\bdocument\s*(?:\.|\[)/ },
  { label: "browser storage", pattern: /\b(?:localStorage|sessionStorage|indexedDB)\s*(?:\.|\[|\()/ },
  { label: "direct network access", pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/ },
  { label: "dynamic code execution", pattern: /\b(?:eval|Function)\s*\(/ },
  { label: "timers", pattern: /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/ },
  { label: "module loading", pattern: /\b(?:import|require)\s*\(/ },
];

/** Deterministic checks that complement Structured Outputs and model review. */
export function validateGeneratedWidget(widget: GeneratedWidget): string[] {
  const issues: string[] = [];
  const combined = `${widget.html}\n${widget.script}`;

  if (widget.html.length > 12_000) issues.push("HTML is too large");
  if (widget.script.length > 40_000) issues.push("Script is too large");
  if (/<(?:script|style|iframe|object|embed|link|img|audio|video|source)\b/i.test(widget.html)) {
    issues.push("HTML contains a forbidden element");
  }
  if (!/\bwidget\./.test(widget.script)) issues.push("Script does not use the widget capability API");

  for (const { label, pattern } of FORBIDDEN_SCRIPT_PATTERNS) {
    if (pattern.test(widget.script)) issues.push(`Script uses forbidden ${label}`);
  }

  const usesData = /widget\.(?:getJSON|ai)\s*\(/.test(widget.script);
  if (usesData) {
    if (widget.refreshMs == null) issues.push("Data widget has no refresh interval");
    if (!/skeleton/.test(combined)) issues.push("Data widget has no loading state");
    if (!/(?:catch\s*\(|catch\s*\{|\.catch\s*\()/.test(widget.script)) {
      issues.push("Data widget has no recoverable error path");
    }
    if (!/(?:retry|try again)/i.test(combined)) issues.push("Data widget has no retry control");
  }
  if (/widget\.ai\s*\(/.test(widget.script) && (widget.refreshMs ?? 0) < 3_600_000) {
    issues.push("AI-backed widget refreshes more often than once per hour");
  }
  if (/#[0-9a-f]{3,8}\b|\brgba?\s*\(/i.test(combined)) {
    issues.push("Widget uses hard-coded colors instead of design tokens");
  }
  return issues;
}

function responseBody(
  prompt: string,
  opts: GenerateOptions,
  background: boolean,
  repairDraft?: GeneratedWidget,
  repairIssues: string[] = [],
): Record<string, unknown> {
  const stage = repairDraft ? "repair" : "build";
  return {
    // Background mode lets the model work for several minutes without being
    // tied to a Supabase Edge Function worker's wall-clock lifetime.
    model: opts.model || "gpt-5",
    reasoning: { effort: opts.effort || "medium" },
    ...(stage === "build" ? { tools: [{ type: "web_search" }] } : {}),
    instructions: SYSTEM_PROMPT + "\n\n" + QUALITY_PROMPT + (repairDraft ? "\n\n" + REPAIR_PROMPT : ""),
    input: repairDraft
      ? `Original request:\n${prompt}\n\nFailed checks:\n${repairIssues.map((issue) => `- ${issue}`).join("\n")}\n\nCandidate widget:\n${JSON.stringify(repairDraft)}`
      : `Build this widget: ${prompt}`,
    // Reasoning tokens count against this budget, so keep it generous — a
    // tight cap truncates the final JSON and yields a half-written script.
    max_output_tokens: opts.maxOutputTokens ?? 16000,
    ...(background ? { background: true, store: true } : {}),
    ...qualityResponseConfig(opts, stage),
  };
}

async function createResponse(
  prompt: string,
  apiKey: string,
  opts: GenerateOptions = {},
  background = false,
  repairDraft?: GeneratedWidget,
  repairIssues: string[] = [],
): Promise<OpenAIResponse> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(responseBody(prompt, opts, background, repairDraft, repairIssues)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  return (await res.json()) as OpenAIResponse;
}

/** Start a durable OpenAI background response and return its polling id. */
export async function startWidgetGeneration(
  prompt: string,
  apiKey: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const data = await createResponse(prompt, apiKey, opts, true);
  if (!data.id) throw new Error("OpenAI didn't return a response id");
  return data.id;
}

/** Start a second durable response only when deterministic checks reject a build. */
export async function startWidgetRepair(
  prompt: string,
  draft: GeneratedWidget,
  issues: string[],
  apiKey: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const data = await createResponse(prompt, apiKey, opts, true, draft, issues);
  if (!data.id) throw new Error("OpenAI didn't return a repair response id");
  return data.id;
}

async function retrieveResponse(responseId: string, apiKey: string): Promise<OpenAIResponse> {
  const res = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) {
    return {
      status: "failed",
      error: { message: "The generation result expired before it could be retrieved. Try again." },
    };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI status request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as OpenAIResponse;
}

function parseCompletedResponse(data: OpenAIResponse): { widget: GeneratedWidget; issues: string[] } {
  // A truncated response (hit the token budget) would leave the script cut off
  // mid-statement; fail loudly so the job retries instead of storing a broken
  // widget that throws "Unexpected end of input" when it runs.
  if (data.status === "incomplete") {
    throw new Error(`The model's response was cut off (${data.incomplete_details?.reason ?? "incomplete"}). Try again.`);
  }

  const content = outputText(data);
  if (!content) throw new Error("OpenAI returned an empty response");

  const spec = parseLooseJSON(content) as Partial<GeneratedWidget>;
  if (typeof spec.title !== "string" || !spec.title.trim()) throw new Error("Widget spec is missing a title");
  if (typeof spec.script !== "string" || !spec.script.trim()) throw new Error("Widget spec is missing a script");

  const candidate: GeneratedWidget = {
    title: spec.title.trim().slice(0, 40),
    icon:
      typeof spec.icon === "string" && ICON_NAMES.includes(spec.icon.trim().toLowerCase())
        ? spec.icon.trim().toLowerCase()
        : "panel",
    html: typeof spec.html === "string" ? spec.html : "",
    script: spec.script,
    refreshMs:
      typeof spec.refreshMs === "number" && Number.isFinite(spec.refreshMs)
        ? Math.max(60_000, Math.round(spec.refreshMs))
        : null,
  };
  const qualityIssues = validateGeneratedWidget(candidate);

  // Compile exactly as the client does. A syntactically invalid but otherwise
  // structured candidate can be repaired once instead of failing outright.
  try {
    new Function("widget", `"use strict";\n${candidate.script}`);
  } catch (err) {
    if (err instanceof SyntaxError) qualityIssues.unshift(`Script is invalid JavaScript (${err.message})`);
  }

  return { widget: candidate, issues: qualityIssues };
}

/** Retrieve an OpenAI background response and normalize it for job polling. */
export async function getWidgetGeneration(
  responseId: string,
  apiKey: string,
): Promise<WidgetGenerationStatus> {
  const data = await retrieveResponse(responseId, apiKey);
  if (data.status === "queued" || data.status === "in_progress") return { status: "pending" };
  if (data.status === "failed") {
    return { status: "error", error: data.error?.message || "OpenAI generation failed." };
  }
  if (data.status === "cancelled") {
    return { status: "error", error: "OpenAI generation was cancelled." };
  }
  if (data.status === "incomplete") {
    return {
      status: "error",
      error: `The model's response was cut off (${data.incomplete_details?.reason ?? "incomplete"}). Try again.`,
    };
  }
  if (data.status !== "completed") {
    return {
      status: "error",
      error: `OpenAI returned an unexpected status (${data.status ?? "unknown"}).`,
    };
  }

  try {
    const parsed = parseCompletedResponse(data);
    return parsed.issues.length ? { status: "invalid", ...parsed } : { status: "done", widget: parsed.widget };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Widget generation failed",
    };
  }
}

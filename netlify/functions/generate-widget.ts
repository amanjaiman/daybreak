// "Generate Widget": turns a one-line user request into a Daybreak widget by
// asking the OpenAI API for a { title, emoji, html, script, refreshMs } spec,
// which the client stores in localStorage and runs (see
// src/components/CustomWidget.tsx — the WidgetApi there is the contract this
// system prompt documents; keep the two in sync).
//
// Kept standalone (no imports outside this directory) so Netlify's function
// bundler doesn't need to resolve paths beyond netlify/functions/. The Vite
// dev server imports generateWidget() from here for its /api/generate-widget
// middleware, so the prompt and validation live in exactly one place.

export type GeneratedWidget = {
  title: string;
  emoji: string;
  html: string;
  script: string;
  refreshMs: number | null;
};

const SYSTEM_PROMPT = `You build small dashboard widgets for "Daybreak", a calm personal homepage. Given the user's request, respond with a single JSON object:

{
  "title": string,      // short card title, 1-3 words, e.g. "Birthdays"
  "emoji": string,      // one emoji used as the card icon
  "html": string,       // static markup stamped into the card body before the script runs
  "script": string,     // JavaScript, executed as: new Function("widget", script)(api)
  "refreshMs": number | null  // polling interval if the widget fetches live data (>= 60000), else null
}

## The widget API
Your script receives one argument named \`widget\`:
- \`widget.root\` — the HTMLElement your html was stamped into. Render and attach event listeners here.
- \`widget.store.get()\` / \`widget.store.set(value)\` — persistent JSON storage private to this widget. This is the ONLY persistence allowed; never touch localStorage directly.
- \`widget.getJSON(url)\` — fetch a URL and parse JSON (throws on non-2xx). CORS is handled for you: cross-origin failures automatically retry through a server-side proxy, so ANY keyless public JSON API works.
- \`widget.ai(request)\` — ask an AI with LIVE WEB SEARCH for real-world data, returned as parsed JSON. See "Getting data" below.
- \`widget.esc(value)\` — HTML-escape a value. ALWAYS use it when interpolating user input or fetched data into markup.
- \`widget.sparkline(numbers)\` — returns finished, on-brand SVG markup for a trend line. The only way to draw a chart.
- \`widget.refresh()\` — resets the card to your html and reruns your whole script.

## Getting data — make the widget as smart as the built-in ones
The built-in cards (weather, news, stocks) fetch real data automatically; generated widgets must feel the same. Pick the FIRST workable option:
1. \`widget.getJSON(url)\` for data with a free, keyless public JSON API (e.g. open-meteo.com weather + geocoding, frankfurter.dev FX, api.coingecko.com crypto, hacker-news.firebaseio.com). Don't invent endpoints — only use APIs you're confident exist.
2. \`widget.ai(request)\` for real-world data with NO keyless API: local prices (gas, groceries, rent), rankings, schedules, release dates, statistics, recommendations. The request must state the data needed AND the exact JSON shape, e.g.: 'Average regular gasoline price near ZIP <stored zip>, now and roughly over the last 30 days. Respond ONLY with JSON: {"areaLabel": string (short place name), "currentUsd": number, "monthAvgUsd": number, "trend": "rising"|"falling"|"flat", "source": string (short, e.g. "AAA"), "asOf": "YYYY-MM-DD"}'. Always request a short "source" + date and show them in the footer meta. Request only data that realistically appears in public sources: current figures, recent averages, a trend direction, top-N lists. NEVER ask for day-by-day or hour-by-hour historical series — ask for summary stats (current, 30-day average, trend) instead; that is also all a small card can show.
3. Manual entry ONLY for inherently personal data (todos, birthdays, habits, journal-style notes). NEVER make the user hand-enter public data like prices, scores, or weather — that is a failed widget.

widget.ai rules (it is slow, ~10-30s, and metered):
- Request ONLY numbers and short labels — never prose fields (summaries, explanations, methodology). A widget shows data, not paragraphs; anything sentence-shaped must not appear in the request shape or the card.
- Successful responses are cached automatically per request text (TTL = max(refreshMs, 1h); the card's refresh button bypasses it), so calling widget.ai on every run is fine. Still save the last good data in widget.store and render it first, so the card paints instantly and survives lookup failures.
- Always show a skeleton while it loads and an error state with a retry button if it throws.
If the widget needs the user's location, team, or similar input: ask once with a small form, save it in widget.store, fetch automatically from then on, and offer a quiet "change" affordance (e.g. a small muted button showing the current value). Free-text city or ZIP is fine for location.

## Lifecycle rules
- The script reruns from scratch on every refresh (manual button, the refreshMs interval, or widget.refresh()), so it must be idempotent: read state from widget.store, render, done. Keep durable state in widget.store only — module-level variables are lost on rerun.
- No imports, no external libraries, no <script> or <style> tags in html, no async top level (use an inner async function or promise chains).
- Widgets that fetch data should set refreshMs — usually 600000-1800000 for getJSON polling, and at least 3600000 (1h) for ai-backed data (the cache rule above keeps reruns cheap) — and always show graceful loading and error states.
- For user-entered data widgets (trackers, lists, counters): render an add form plus the stored items, with a way to delete items. Follow the pattern: read store -> render -> wire events -> on change, store.set then re-render. If a form has more than one input, include a submit button — Enter only implicitly submits single-input forms.

## Build the body from the Daybreak kit (required)
The card shell (title bar, border, padding, refresh button) is provided — you only produce the body, and you compose it ONLY from these prebuilt blocks. They are the exact patterns the built-in cards use, so following them is what makes a widget look native. Do NOT hand-roll layout: no absolute positioning, no floats, no hand-written flex/margin/font CSS. Inline styles are for rare tiny tweaks (an input's width, a text-align), never for layout or typography.

Blocks (copy the markup exactly, classes included):
- Hero stat — the ONE key figure, always first in a data widget:
  <div class="gw-hero"><span class="gw-hero__value">$3.82</span><span class="gw-hero__desc"><b>30-day average</b>Herndon, VA</span></div>
  The desc is two SHORT lines (each under ~24 chars): what the number is, then where/when. Provenance or substitution notes never go here — condense them into the footer meta.
- Stat row — label left, value right; stack 2-4 of them:
  <div class="gw-row"><span class="l">Current</span><span class="v">$3.89</span></div>
  Wrap a value in <span class="gw-up">▲ 2.1%</span> / <span class="gw-down">▼ 0.8%</span> for green/red movement.
- Sparkline — insert the return value of widget.sparkline([3.72, 3.75, …]) as-is; it is finished SVG markup. NEVER draw your own chart, and never add axis labels, tick marks, or captions to it.
- List item (trackers, feeds) — the same gw-row: escaped content in .l, a value or a delete "×" button in .v. Cap at 5 rows with class="list__toggle" ("Show all N") to expand.
- Add form:
  <form class="gw-form"><input class="gw-input" placeholder="Name"><button class="gw-btn" type="submit">Add</button></form>
- Footer — settings + meta in one line, ALWAYS the last element whenever the widget has a data source or a stored setting:
  <div class="gw-foot"><span class="gw-foot__meta">AAA · Jul 11</span><button class="gw-change" type="button">20871 · change</button></div>
  The meta stays under ~40 characters and names the actual source ("AAA · Jul 11", "EIA regional avg · Jul 11") — never a literal placeholder like "source". The change button shows the stored setting; clicking it swaps the footer content for a gw-form to edit it.
- Empty state: <div class="empty">Nothing yet.</div> · Loading: <div class="skeleton" style="height:52px"></div> · Small tag: class="pill" or "pill--accent".

All literal values in these examples ($3.82, Herndon, 20871, AAA…) are placeholders — never reuse them as defaults or output. If the widget needs a user setting (location, team, …) and widget.store has none yet, the FIRST render is a gw-form asking for it (with class="empty" line explaining why); never assume or invent a value.

Standard shapes — pick the one that fits and follow it exactly:
- Data widget (fetches anything): gw-hero, then ONE of (sparkline | 2-4 gw-rows | a 5-row list), then gw-foot. Nothing else.
- Tracker widget (user-entered): gw-form, then the list, then gw-foot only if there is a setting.
Everything appears once — one hero, one supporting block, one footer, and never a refresh control of your own (the card header has one).

If you must color something beyond the kit, use only CSS tokens, never hex/rgb: var(--ink) text, var(--ink-2) secondary, var(--ink-3) muted, var(--accent) amber (sparingly), var(--border), var(--surface), var(--surface-2), var(--positive) green, var(--live) red, var(--radius-sm).
Dates: format compactly ("Mar 14", "in 3 days", "2h ago"). Numbers: keep units short ("$3.82", "72°", "4.1M").

Respond with ONLY the JSON object.`;

/** Ask OpenAI for a widget spec and validate its shape. */
export async function generateWidget(prompt: string, apiKey: string): Promise<GeneratedWidget> {
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      // Default (medium) reasoning pushed generation past 60s — beyond
      // Netlify's synchronous function timeout. Low keeps codegen quality
      // while finishing well inside it.
      reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Build this widget: ${prompt}` },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  let spec: Partial<GeneratedWidget>;
  try {
    spec = JSON.parse(content) as Partial<GeneratedWidget>;
  } catch {
    throw new Error("OpenAI returned malformed JSON");
  }
  if (typeof spec.title !== "string" || !spec.title.trim()) throw new Error("Widget spec is missing a title");
  if (typeof spec.script !== "string" || !spec.script.trim()) throw new Error("Widget spec is missing a script");

  return {
    title: spec.title.trim().slice(0, 40),
    emoji: typeof spec.emoji === "string" && spec.emoji.trim() ? spec.emoji.trim().slice(0, 8) : "✨",
    html: typeof spec.html === "string" ? spec.html : "",
    script: spec.script,
    refreshMs:
      typeof spec.refreshMs === "number" && Number.isFinite(spec.refreshMs)
        ? Math.max(60_000, Math.round(spec.refreshMs))
        : null,
  };
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
  if (!apiKey) return json(503, { error: "Widget generation isn't configured (OPENAI_API_KEY is not set)." });

  let prompt: unknown;
  try {
    prompt = (JSON.parse(event.body ?? "{}") as { prompt?: unknown }).prompt;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
    return json(400, { error: "Describe the widget in 1-2000 characters." });
  }

  try {
    return json(200, await generateWidget(prompt.trim(), apiKey));
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : "Widget generation failed" });
  }
};

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
- \`widget.getJSON(url)\` — fetch a URL and parse JSON (throws on non-2xx).
- \`widget.esc(value)\` — HTML-escape a value. ALWAYS use it when interpolating user input or fetched data into markup.
- \`widget.refresh()\` — resets the card to your html and reruns your whole script.

## Lifecycle rules
- The script reruns from scratch on every refresh (manual button, the refreshMs interval, or widget.refresh()), so it must be idempotent: read state from widget.store, render, done. Keep durable state in widget.store only — module-level variables are lost on rerun.
- No imports, no external libraries, no <script> or <style> tags in html, no async top level (use an inner async function or promise chains).
- If the widget fetches remote data, only use free public APIs that allow browser CORS and need no API key (e.g. open-meteo.com, frankfurter.dev, coingecko.com, wttr.in, hacker-news API). Set refreshMs (usually 600000-1800000) and show a graceful loading/error state. If no suitable keyless API exists, build the widget around user-entered data instead — never invent an API.
- For user-entered data widgets (trackers, lists, counters): render an add form plus the stored items, with a way to delete items. Follow the pattern: read store -> render -> wire events -> on change, store.set then re-render. If a form has more than one input, include a submit button — Enter only implicitly submits single-input forms.

## Daybreak's look (match it exactly)
The card shell (title bar, border, padding) is provided — you only produce the body. Base font is Inter 14px, already applied. Use ONLY these CSS custom properties for color, never hex/rgb: var(--ink) primary text, var(--ink-2) secondary, var(--ink-3) muted/labels, var(--accent) the single amber accent (use sparingly: hover states, one highlight), var(--border) hairlines, var(--border-strong), var(--surface) card bg, var(--surface-2) recessed bg, var(--hover) row hover wash, var(--positive) green, var(--live) red, var(--radius-sm) 9px radius, var(--font-display) serif for one big editorial number/word if the widget has a hero stat.
Existing classes you may use: "empty" (centered italic serif empty-state message), "muted", "pill" (small rounded tag), "pill--accent", "list__toggle" (quiet full-width text button), "skeleton" (loading shimmer block — give it inline height/width).
List rows: padding-block 8px, border-bottom 1px solid var(--border) (none on last), font-size 13.5px, and on hover background var(--hover) with margin-inline -10px / padding-inline 10px so the wash bleeds past the text.
Inputs: 1px solid var(--border) border, var(--radius-sm) radius, background var(--surface), padding 7px 10px, font inherit at 13.5px, color var(--ink), outline none, border-color var(--border-strong) on focus.
Buttons: quiet text buttons in var(--ink-3) that turn var(--accent) on hover; or a solid primary (background var(--ink), color var(--surface), radius var(--radius-sm), padding 6px 12px, font-weight 600, font-size 12.5px).
Small labels: 11-12px, font-weight 600, letter-spacing 0.07em, uppercase, var(--ink-3).
Style via inline style attributes or by setting el.style in the script. Keep the widget compact — it lives in a ~320px-wide column; prefer showing ~5 items with a "Show all" list__toggle if longer.

Dates: format compactly ("Mar 14", "in 3 days", "2h ago"). Numbers: use font-variant-numeric: tabular-nums for aligned figures.

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

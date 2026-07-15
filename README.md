# Daybreak

A personal dashboard — the homepage to your life. Weather, the news you care
about, your todos, concerts near you, and the football matches worth watching,
all in one calm place.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

> Note: the Concerts, Football, and Stocks cards proxy their APIs through the
> Vite dev server (`vite.config.ts`), since Bandsintown, ESPN, and Yahoo
> Finance don't send CORS headers for browser requests. The Reading queue's
> title/favicon enrichment (`/api/unfurl`) works the same way — it fetches
> each saved page directly, so no third-party unfurl service ever sees your
> saved URLs. All four only run under `vite dev` by default.

To use **Generate Widget** (the sparkle in the floating bubble menu) locally,
copy `.env.example` to `.env` and set `OPENAI_API_KEY` — it's the one feature
that needs a key. Everything else works without it. In dev, generation runs
in-process through the Vite middleware (an in-memory job map), so you don't
need Supabase locally — only the OpenAI key.

## Deploying to Netlify

`netlify.toml` is already set up — connect the repo and deploy as-is. The
built-in cards need no environment variables (every data source above is
keyless). **Generate Widget** is the exception, and in production it runs as
an async job on **Supabase** (a tool-using gpt-5 generation runs well past
Netlify's ~26s synchronous function limit).

Set up the Supabase backend once:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                       # creates the widget_jobs table
supabase secrets set OPENAI_API_KEY=sk-...   # optionally OPENAI_MODEL / OPENAI_DATA_MODEL / *_REASONING_EFFORT
supabase functions deploy generate-widget
supabase functions deploy widget-status
supabase functions deploy widget-data
```

Then set two variables in the Netlify site env (both public by design — the
frontend calls the Supabase functions directly with them):

- `VITE_SUPABASE_URL` — `https://<ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — the project's publishable key

How it fits together:

- The Bandsintown/ESPN/Yahoo proxies become `[[redirects]]` rewrites in
  `netlify.toml`.
- The widget AI backends are three Supabase edge functions in
  [`supabase/functions/`](supabase/functions): `generate-widget` inserts a job
  row and runs gpt-5 (with live web search) as a background task, returning a
  job id immediately; `widget-status` is polled until the job is done (the
  frontend shows a placeholder card meanwhile and stores the job id, so a
  reload mid-generation resumes instead of losing the widget); and
  `widget-data` answers runtime `widget.ai(...)` lookups (OpenAI + web search,
  for real-world data with no free API — local gas prices, rankings, current
  headlines, …). The finished widget spec is stored (and runs) in your
  browser's localStorage. Cores in
  [`supabase/functions/_shared/`](supabase/functions/_shared) are plain
  `fetch`-only TS so the Vite dev middleware runs the same code in-process.
- The one server helper still on Netlify is
  [`netlify/functions/proxy.ts`](netlify/functions/proxy.ts) — the JSON CORS
  fallback behind `widget.getJSON(...)` (a fast fetch with no timeout concern).
- `/api/unfurl` is instead a real serverless function at
  [`netlify/functions/unfurl.ts`](netlify/functions/unfurl.ts), doing the
  same server-side fetch-and-parse as the dev middleware. It's intentionally
  self-contained (no imports outside `netlify/functions/`) so Netlify's
  function bundler doesn't need to resolve paths elsewhere in the repo.

Deploying to a host other than Netlify (Vercel, Cloudflare Pages, …) needs
equivalent rewrites for the three proxies plus a serverless function for
`/api/unfurl` — without it, saved links still work, just falling back to a
humanized title guessed from the URL with no favicon.

## Make it yours

Everything is editable in the app itself — no file editing needed:

- **Your name** — click it in the greeting.
- **Home city** — **Edit** on the weather card; type any city, it's geocoded
  automatically.
- **News tabs** — **Edit** on the News card: add a tab with a name and
  comma-separated search terms (searched on Hacker News over the last week,
  ranked by points), remove tabs, and pick which NBA team's news to follow.
- **Shows** — **Edit** on the Shows card to track anyone on Bandsintown
  (musicians, comedians, …), each scoped to a city of your choice or to
  "anywhere".
- **Football** — **Edit** shows a checklist of competitions.
- **Stocks** — **Edit** to add/remove tickers.
- **Anything else** — click the Daybreak bubble (bottom right) to
  **generate a widget**: describe what you want ("track my friends'
  birthdays") and an AI-built widget matching Daybreak's design is added to
  your board. Hovering the bubble fans out the rest: lock the view (hides
  reposition handles and edit/remove controls), switch between the Dashboard
  and Flow layouts, and toggle light/dark mode.

All choices persist in localStorage. [`src/config.ts`](src/config.ts) only
provides the defaults used on first run.

## Refresh cadence

Every card refreshes itself in the background: football every 2 minutes (live
scores), stocks every 5, news every 15, weather every 30, concerts every 6
hours. A failed refresh keeps the last good data on screen.

## Data sources

| Card | Source | Key required |
| --- | --- | --- |
| Weather | [Open-Meteo](https://open-meteo.com) | No |
| News (topics) | [HN Algolia Search](https://hn.algolia.com/api) | No |
| News (team) | ESPN public API | No |
| Football | ESPN public API | No |
| Shows | Bandsintown (+ Open-Meteo geocoding for city lookup) | No |
| Stocks | Yahoo Finance | No |
| Todos, Reading queue | localStorage | — |
| Generated widgets | OpenAI API (generation only; widgets run locally) | `OPENAI_API_KEY`, server-side |

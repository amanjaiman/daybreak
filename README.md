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
that needs a key. Everything else works without it.

## Deploying to Netlify

`netlify.toml` is already set up — connect the repo and deploy as-is. The
built-in cards need no environment variables (every data source above is
keyless); set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in the site
env to enable Generate Widget.

- The Bandsintown/ESPN/Yahoo proxies become `[[redirects]]` rewrites in
  `netlify.toml`.
- `/api/generate-widget` is a serverless function at
  [`netlify/functions/generate-widget.ts`](netlify/functions/generate-widget.ts)
  that asks the OpenAI API to design a widget matching Daybreak's look; the
  result is stored (and runs) in your browser's localStorage.
- Generated widgets get two data lifelines at runtime:
  [`netlify/functions/widget-data.ts`](netlify/functions/widget-data.ts)
  answers `widget.ai(...)` lookups via OpenAI with live web search (for
  real-world data with no free API — local gas prices, rankings, …), and
  [`netlify/functions/proxy.ts`](netlify/functions/proxy.ts) is the JSON
  CORS fallback behind `widget.getJSON(...)`.
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
- **Anything else** — hover the Daybreak bubble (bottom right) and pick
  **Generate widget**: describe what you want ("track my friends' birthdays")
  and an AI-built widget matching Daybreak's design is added to your board.
  The bubble menu is also where you switch between the Dashboard and Flow
  layouts and toggle light/dark mode.

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

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

> Note: the Concerts card uses the Vite dev-server proxy to reach Bandsintown
> (their API doesn't allow browser requests directly). If you deploy a
> production build, add an equivalent rewrite on your host — e.g. a Vercel
> rewrite from `/api/bandsintown/*` to `https://rest.bandsintown.com/*`.

> Note: the Reading queue fetches each saved page's real `<title>` and
> favicon via a small dev-server middleware (`/api/unfurl` in
> `vite.config.ts`) that requests the page directly — no third-party unfurl
> service ever sees your saved URLs. It only runs under `vite dev`; on a
> static production host it falls back gracefully to a humanized title
> guessed from the URL, no favicon. Porting it needs a serverless function
> that does the same fetch-and-parse server-side.

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

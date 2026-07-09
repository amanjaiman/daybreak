import { useState } from "react";
import type { ReactNode } from "react";
import { useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { ForecastDays, useWeather, wmo } from "./Weather";
import { MatchRow, useMatches } from "./Soccer";
import { ShowRow, useUpcomingShows } from "./Shows";
import { useQuotes } from "./Stocks";
import { loadTopic } from "./News";
import { Todos } from "./Todos";
import { ReadingQueue } from "./ReadingQueue";

/**
 * The "Flow" layout: one narrow column that reads top to bottom, ordered by
 * what's actually going on — live matches float up, an empty todo list sinks
 * down, sections with nothing to say don't render at all.
 */

function storedCount(key: string, pred: (item: never) => boolean = () => true): number {
  try {
    const items = JSON.parse(localStorage.getItem(key) ?? "[]") as never[];
    return items.filter(pred).length;
  } catch {
    return 0;
  }
}

function Section({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="flow-section__label">{label}</h2>
      {children}
    </section>
  );
}

export function FlowPage() {
  const { settings } = useSettings();
  const weather = useWeather(settings.location.latitude, settings.location.longitude);
  const matches = useMatches(settings.soccerLeagues);
  const shows = useUpcomingShows(settings.concertRadiusMiles);
  const quotes = useQuotes(settings.stocks);

  const topic = settings.topics[0];
  const news = useFetched(
    () => (topic ? loadTopic(topic.query) : Promise.resolve([])),
    [topic?.id],
    15 * 60 * 1000,
  );

  // Snapshot of the lists at load time — used only for the lede and for
  // ordering sections, so it doesn't need to track edits live.
  const [openTodos] = useState(() => storedCount("daybreak.todos", (t: { done: boolean }) => !t.done));
  const [savedReads] = useState(() => storedCount("daybreak.reading"));

  const allMatches = matches.status === "ready" ? matches.data : [];
  const live = allMatches.filter((m) => m.live);
  const upcoming = allMatches.filter((m) => !m.live);
  const today = upcoming.filter((m) => m.date.toDateString() === new Date().toDateString());
  const fixtures = (today.length > 0 ? today : upcoming).slice(0, 4);

  const lede =
    weather.status === "ready" ? (
      <p className="flow__lede">
        It's <b>{Math.round(weather.data.current.temperature_2m)}°</b> and{" "}
        {wmo(weather.data.current.weather_code).label.toLowerCase()} in {settings.location.label}.
        {live.length > 0 && (
          <>
            {" "}
            <b>{live.length === 1 ? "A match is" : `${live.length} matches are`} live</b> right now.
          </>
        )}
        {live.length === 0 && today.length > 0 && (
          <> {today.length === 1 ? "One fixture" : `${today.length} fixtures`} on today.</>
        )}
        {openTodos > 0 && (
          <> You have {openTodos === 1 ? "one thing" : `${openTodos} things`} on your plate.</>
        )}
      </p>
    ) : (
      <p className="flow__lede">Here's what's going on today.</p>
    );

  // Each section gets a weight; busier sections float toward the top.
  // Compact sections get paired up into two-column rows to keep the page short.
  const sections: { key: string; weight: number; node: ReactNode; compact?: boolean }[] = [];

  if (live.length > 0) {
    sections.push({
      key: "live",
      weight: 0,
      node: (
        <Section label={<span className="pill pill--live">Live</span>}>
          {live.map((m) => (
            <MatchRow match={m} key={m.id} />
          ))}
        </Section>
      ),
    });
  }

  sections.push({ key: "todos", weight: openTodos > 0 ? 1 : 6, node: <Todos />, compact: true });

  if (fixtures.length > 0) {
    sections.push({
      key: "fixtures",
      weight: today.length > 0 ? 2 : 5,
      compact: true,
      node: (
        <Section label={today.length > 0 ? "Today's fixtures" : "Upcoming fixtures"}>
          {fixtures.map((m) => (
            <MatchRow match={m} key={m.id} />
          ))}
        </Section>
      ),
    });
  }

  sections.push({
    key: "reading",
    weight: savedReads > 0 ? 3 : 7,
    node: <ReadingQueue />,
    compact: true,
  });

  if (topic && news.status === "ready" && news.data.length > 0) {
    sections.push({
      key: "news",
      weight: 4,
      node: (
        <Section label={`${topic.label} headlines`}>
          <div className="news__list">
            {news.data.slice(0, 5).map((s) => (
              <a className="news__item" key={s.id} href={s.url} target="_blank" rel="noreferrer">
                <span className="t">{s.title}</span>
                <span className="m">{s.meta}</span>
              </a>
            ))}
          </div>
        </Section>
      ),
    });
  }

  if (shows.status === "ready" && shows.data.length > 0) {
    sections.push({
      key: "shows",
      weight: 5.5,
      compact: true,
      node: (
        <Section label="Shows on the horizon">
          {shows.data.slice(0, 3).map((s) => (
            <ShowRow show={s} key={s.id} />
          ))}
        </Section>
      ),
    });
  }

  if (quotes.status === "ready" && quotes.data.length > 0) {
    sections.push({
      key: "markets",
      weight: 8,
      compact: true,
      node: (
        <Section label="Markets">
          <div className="flow__strip">
            {quotes.data.map((q) => {
              const up = q.changePct >= 0;
              return (
                <a
                  className="flow__ticker"
                  key={q.symbol}
                  href={`https://finance.yahoo.com/quote/${q.symbol}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {q.symbol}
                  <span className={up ? "up" : "down"}>
                    {up ? "+" : ""}
                    {q.changePct.toFixed(2)}%
                  </span>
                </a>
              );
            })}
          </div>
        </Section>
      ),
    });
  }

  if (weather.status === "ready") {
    sections.push({
      key: "forecast",
      weight: 9,
      compact: true,
      node: (
        <Section label="This week">
          <ForecastDays daily={weather.data.daily} />
        </Section>
      ),
    });
  }

  sections.sort((a, b) => a.weight - b.weight);

  // Greedily pair up adjacent compact sections into two-column rows.
  const rows: { key: string; nodes: ReactNode[] }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const next = sections[i + 1];
    if (s.compact && next?.compact) {
      rows.push({ key: `${s.key}+${next.key}`, nodes: [s.node, next.node] });
      i++;
    } else {
      rows.push({ key: s.key, nodes: [s.node] });
    }
  }

  return (
    <main className="flow">
      {lede}
      {rows.map((r) =>
        r.nodes.length === 2 ? (
          <div className="flow__row" key={r.key}>
            {r.nodes[0]}
            {r.nodes[1]}
          </div>
        ) : (
          <div key={r.key}>{r.nodes[0]}</div>
        ),
      )}
    </main>
  );
}

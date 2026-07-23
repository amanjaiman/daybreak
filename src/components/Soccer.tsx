import { useState } from "react";
import { getJSON, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import type { League } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { BallIcon } from "./icons";

// Competitions offered in edit mode and onboarding (ESPN league slugs).
export const LEAGUE_CATALOG: League[] = [
  { slug: "fifa.world", label: "World Cup" },
  { slug: "uefa.champions", label: "Champions League" },
  { slug: "uefa.europa", label: "Europa League" },
  { slug: "eng.1", label: "Premier League" },
  { slug: "esp.1", label: "LaLiga" },
  { slug: "ger.1", label: "Bundesliga" },
  { slug: "ita.1", label: "Serie A" },
  { slug: "fra.1", label: "Ligue 1" },
  { slug: "usa.1", label: "MLS" },
  { slug: "mex.1", label: "Liga MX" },
  { slug: "conmebol.libertadores", label: "Copa Libertadores" },
  { slug: "ind.1", label: "Indian Super League" },
];

type ESPNEvent = {
  id: string;
  date: string;
  name: string;
  shortName: string;
  status: { type: { state: "pre" | "in" | "post" } };
  competitions: {
    competitors: { homeAway: string; score?: string; team: { shortDisplayName: string } }[];
  }[];
};

export type Match = {
  id: string;
  date: Date;
  home: string;
  away: string;
  homeScore?: string;
  awayScore?: string;
  live: boolean;
  league: string;
};

async function loadMatches(leagues: League[]): Promise<Match[]> {
  const results = await Promise.allSettled(
    leagues.map(async (lg) => {
      // Today through two weeks out.
      const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
      const now = new Date();
      const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
      const data = await getJSON<{ events: ESPNEvent[] }>(
        `/api/espn/apis/site/v2/sports/soccer/${lg.slug}/scoreboard?dates=${fmt(now)}-${fmt(end)}`,
      );
      return (data.events ?? [])
        .filter((e) => e.status.type.state !== "post")
        .map((e): Match => {
          const comps = e.competitions[0]?.competitors ?? [];
          const home = comps.find((c) => c.homeAway === "home");
          const away = comps.find((c) => c.homeAway === "away");
          return {
            id: `${lg.slug}-${e.id}`,
            date: new Date(e.date),
            home: home?.team.shortDisplayName ?? "TBD",
            away: away?.team.shortDisplayName ?? "TBD",
            homeScore: home?.score,
            awayScore: away?.score,
            live: e.status.type.state === "in",
            league: lg.label,
          };
        });
    }),
  );

  const matches = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return a.date.getTime() - b.date.getTime();
    });

  // Live matches plus upcoming fixtures; the card pages through these.
  return matches.slice(0, 24);
}

/** Live and upcoming matches across the chosen leagues (refreshes every 2 min). */
export function useMatches(leagues: League[]) {
  return useFetched(
    () => loadMatches(leagues),
    [leagues.map((l) => l.slug).join(",")],
    2 * 60 * 1000,
  );
}

export function MatchRow({ match: m }: { match: Match }) {
  return (
    <div className="match">
      <span className="match__when">
        {m.live ? (
          <span className="pill pill--live">Live</span>
        ) : (
          <>
            <span className="d">
              {m.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <br />
            {m.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </>
        )}
      </span>
      <span className="match__teams">
        {m.home}
        {m.live ? (
          <span className="vs">
            {m.homeScore}–{m.awayScore}
          </span>
        ) : (
          <span className="vs">vs</span>
        )}
        {m.away}
      </span>
      <span className="match__league pill">{m.league}</span>
    </div>
  );
}

const PER_PAGE = 4;

export function Soccer() {
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(0);

  const state = useMatches(settings.soccerLeagues);

  const toggle = (league: League) => {
    const on = settings.soccerLeagues.some((l) => l.slug === league.slug);
    update({
      soccerLeagues: on
        ? settings.soccerLeagues.filter((l) => l.slug !== league.slug)
        : [...settings.soccerLeagues, league],
    });
  };

  return (
    <Card
      title="Football"
      icon={<BallIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {editing ? (
        <div className="leagues">
          {LEAGUE_CATALOG.map((lg) => {
            const on = settings.soccerLeagues.some((l) => l.slug === lg.slug);
            return (
              <label className="leagues__item" key={lg.slug}>
                <input type="checkbox" checked={on} onChange={() => toggle(lg)} />
                {lg.label}
              </label>
            );
          })}
        </div>
      ) : (
        <>
      {state.status === "loading" && <SkeletonRows rows={4} />}
      {state.status === "error" && <div className="empty">Couldn't load fixtures.</div>}
      {state.status === "ready" &&
        (() => {
          const pages = Math.max(1, Math.ceil(state.data.length / PER_PAGE));
          const cur = Math.min(page, pages - 1); // clamp if data shrank
          const visible = state.data.slice(cur * PER_PAGE, (cur + 1) * PER_PAGE);
          return (
            <div>
              {state.data.length === 0 && (
                <div className="empty">
                  {settings.soccerLeagues.length === 0
                    ? "Pick some competitions in Edit."
                    : "No upcoming matches in your competitions."}
                </div>
              )}
              {visible.length > 0 && (
                <div className="match-list">
                  {visible.map((m) => (
                    <MatchRow match={m} key={m.id} />
                  ))}
                </div>
              )}
              {pages > 1 && (
                <div className="pager">
                  <button
                    aria-label="Previous matches"
                    disabled={cur === 0}
                    onClick={() => setPage(cur - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    {cur + 1} / {pages}
                  </span>
                  <button
                    aria-label="More matches"
                    disabled={cur === pages - 1}
                    onClick={() => setPage(cur + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          );
        })()}
        </>
      )}
    </Card>
  );
}

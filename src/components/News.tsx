import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getJSON, timeAgo, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { NewsIcon } from "./icons";

type HNHit = {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  created_at: string;
};

type ESPNArticle = {
  headline: string;
  published: string;
  links: { web?: { href: string } };
};

export type Story = { id: string; title: string; url: string; meta: string };

export async function loadTopic(query: string): Promise<Story[]> {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  // Algolia matches all query words, so run each OR-term separately and merge.
  const terms = query.split(" OR ");
  const results = await Promise.allSettled(
    terms.map((term) =>
      getJSON<{ hits: HNHit[] }>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(term)}` +
          `&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=30`,
      ),
    ),
  );
  const seen = new Map<string, HNHit>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const h of r.value.hits) seen.set(h.objectID, h);
  }
  const ranked = [...seen.values()].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  return ranked.slice(0, 6).map((h) => {
    let domain = "news.ycombinator.com";
    try {
      if (h.url) domain = new URL(h.url).hostname.replace(/^www\./, "");
    } catch {
      /* keep default */
    }
    return {
      id: h.objectID,
      title: h.title,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      meta: `${domain} · ${h.points} points · ${timeAgo(h.created_at)}`,
    };
  });
}

async function loadTeamNews(espnId: string): Promise<Story[]> {
  const data = await getJSON<{ articles: ESPNArticle[] }>(
    `/api/espn/apis/site/v2/sports/basketball/nba/news?team=${espnId}&limit=6`,
  );
  return data.articles.slice(0, 6).map((a, i) => ({
    id: String(i),
    title: a.headline,
    url: a.links.web?.href ?? "https://www.espn.com/nba/",
    meta: `ESPN · ${timeAgo(a.published)}`,
  }));
}

type NBATeam = { id: string; name: string };

async function loadNBATeams(): Promise<NBATeam[]> {
  const data = await getJSON<{
    sports: { leagues: { teams: { team: { id: string; displayName: string } }[] }[] }[];
  }>(`/api/espn/apis/site/v2/sports/basketball/nba/teams`);
  return (data.sports[0]?.leagues[0]?.teams ?? [])
    .map((t) => ({ id: t.team.id, name: t.team.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function News() {
  const { settings, update } = useSettings();
  const tabs = [
    ...settings.topics.map((t) => ({ id: t.id, label: t.label, load: () => loadTopic(t.query) })),
    {
      id: "team",
      label: settings.nbaTeam.name,
      load: () => loadTeamNews(settings.nbaTeam.espnId),
    },
  ];

  const [active, setActive] = useState(tabs[0]?.id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [terms, setTerms] = useState("");
  const [teams, setTeams] = useState<NBATeam[] | null>(null);

  // Refresh the visible tab every 15 minutes.
  const state = useFetched(tab.load, [tab.id, settings.nbaTeam.espnId], 15 * 60 * 1000);

  // Only fetch the NBA team list once someone opens edit mode.
  useEffect(() => {
    if (editing && teams === null) {
      loadNBATeams().then(setTeams, () => setTeams([]));
    }
  }, [editing, teams]);

  const addTopic = (e: FormEvent) => {
    e.preventDefault();
    const l = label.trim();
    const q = terms.trim();
    if (!l || !q) return;
    update({
      topics: [
        ...settings.topics,
        { id: crypto.randomUUID(), label: l, query: q.split(/\s*,\s*/).join(" OR ") },
      ],
    });
    setLabel("");
    setTerms("");
  };

  const removeTopic = (id: string) => {
    update({ topics: settings.topics.filter((t) => t.id !== id) });
    if (active === id) setActive("team");
  };

  return (
    <Card
      title="News"
      icon={<NewsIcon />}
      actions={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {!editing && (
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={t.id === active}
                  onClick={() => setActive(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />
        </span>
      }
    >
      {editing ? (
        <div className="track" style={{ borderTop: "none", marginTop: 0, paddingTop: 4 }}>
          <div className="track__chips">
            {settings.topics.map((t) => (
              <span className="chip" key={t.id} title={t.query}>
                {t.label}
                <button
                  className="chip__x"
                  aria-label={`Remove ${t.label} tab`}
                  onClick={() => removeTopic(t.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form className="track__form" onSubmit={addTopic}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Tab name…"
              aria-label="Topic tab name"
            />
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Search terms, comma-separated"
              aria-label="Topic search terms"
            />
            <button type="submit" className="track__add">
              Add
            </button>
          </form>
          <label className="track__row">
            Team news
            <select
              value={settings.nbaTeam.espnId}
              onChange={(e) => {
                const team = teams?.find((t) => t.id === e.target.value);
                if (team) update({ nbaTeam: { espnId: team.id, name: team.name.split(" ").pop()! } });
              }}
            >
              {teams === null && <option>Loading teams…</option>}
              {teams?.length === 0 && <option>Couldn't load teams</option>}
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          {state.status === "loading" && <SkeletonRows rows={5} />}
          {state.status === "error" && <div className="empty">Couldn't load stories.</div>}
          {state.status === "ready" && (
            <div className="news__list">
              {state.data.length === 0 && (
                <div className="empty">Nothing new in the last few days.</div>
              )}
              {state.data.map((s) => (
                <a className="news__item" key={s.id} href={s.url} target="_blank" rel="noreferrer">
                  <span className="t">{s.title}</span>
                  <span className="m">{s.meta}</span>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

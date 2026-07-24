import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getJSON, timeAgo, useFetched } from "../lib/api";
import { Card, EditButton, SkeletonRows } from "./Card";
import { MicIcon } from "./icons";

// Podcasts a user follows, plus the newest episodes across them — all via the
// free iTunes Search API (JSON, no key). Follows are kept in localStorage like
// the Shows card's tracked performers.
export type Podcast = { id: number; name: string; artwork: string };
type Episode = { id: string; title: string; show: string; artwork: string; date: Date; url: string };

export const PODCASTS_KEY = "daybreak.podcasts";

type ITunesResult = {
  wrapperType?: string;
  collectionId?: number;
  collectionName?: string;
  artworkUrl100?: string;
  trackId?: number;
  trackName?: string;
  releaseDate?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  episodeGuid?: string;
};

function loadFollowed(): Podcast[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PODCASTS_KEY) ?? "[]") as Podcast[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function searchPodcasts(term: string): Promise<Podcast[]> {
  const data = await getJSON<{ results: ITunesResult[] }>(
    `/api/itunes/search?media=podcast&term=${encodeURIComponent(term)}&limit=6`,
  );
  return (data.results ?? [])
    .filter((r) => r.collectionId && r.collectionName)
    .map((r) => ({ id: r.collectionId!, name: r.collectionName!, artwork: r.artworkUrl100 ?? "" }));
}

async function loadEpisodes(followed: Podcast[]): Promise<Episode[]> {
  const results = await Promise.allSettled(
    followed.map(async (p) => {
      const data = await getJSON<{ results: ITunesResult[] }>(
        `/api/itunes/lookup?id=${p.id}&media=podcast&entity=podcastEpisode&limit=5`,
      );
      return (data.results ?? [])
        .filter((e) => e.wrapperType === "podcastEpisode" && e.trackName && e.releaseDate)
        .map(
          (e): Episode => ({
            id: String(e.trackId ?? e.episodeGuid),
            title: e.trackName!,
            show: p.name,
            artwork: p.artwork,
            date: new Date(e.releaseDate!),
            url: e.trackViewUrl ?? e.collectionViewUrl ?? "",
          }),
        );
    }),
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 6);
}

export function EpisodeRow({ episode: e }: { episode: Episode }) {
  return (
    <a className="pod" href={e.url} target="_blank" rel="noreferrer">
      {e.artwork ? (
        <img className="pod__art" src={e.artwork} alt="" loading="lazy" />
      ) : (
        <span className="pod__art pod__art--blank" aria-hidden="true" />
      )}
      <span className="pod__info">
        <span className="pod__title">{e.title}</span>
        <span className="pod__meta">
          {e.show} · {timeAgo(e.date.getTime())}
        </span>
      </span>
    </a>
  );
}

/** Newest episodes across followed podcasts (Flow layout). */
export function useLatestEpisodes() {
  const [followed] = useState<Podcast[]>(loadFollowed);
  const key = followed.map((p) => p.id).join(",");
  return useFetched(() => loadEpisodes(followed), [key], 60 * 60 * 1000);
}

export function Podcasts() {
  const [followed, setFollowed] = useState<Podcast[]>(loadFollowed);
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Podcast[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    localStorage.setItem(PODCASTS_KEY, JSON.stringify(followed));
  }, [followed]);

  const key = followed.map((p) => p.id).join(",");
  // Episodes refresh hourly — new drops aren't urgent.
  const state = useFetched(() => loadEpisodes(followed), [key], 60 * 60 * 1000);

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = term.trim();
    if (!q || searching) return;
    setSearching(true);
    try {
      setResults(await searchPodcasts(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const follow = (p: Podcast) => {
    setFollowed((all) => (all.some((x) => x.id === p.id) ? all : [...all, p]));
    setResults(null);
    setTerm("");
  };

  return (
    <Card
      title="Podcasts"
      icon={<MicIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {state.status === "loading" && <SkeletonRows rows={3} height={38} />}
      {state.status === "error" && <div className="empty">Couldn't reach the podcast directory.</div>}
      {state.status === "ready" && (
        <>
          {state.data.length === 0 ? (
            <div className="empty">
              {followed.length === 0
                ? "Not following any shows yet — hit Edit to find some."
                : "No recent episodes from your shows."}
            </div>
          ) : (
            <div className="pod-list">
              {state.data.map((e) => (
                <EpisodeRow episode={e} key={e.id} />
              ))}
            </div>
          )}

          {editing && (
            <div className="track">
              <div className="track__chips">
                {followed.map((p) => (
                  <span className="chip" key={p.id}>
                    {p.name}
                    <button
                      className="chip__x"
                      aria-label={`Unfollow ${p.name}`}
                      onClick={() => setFollowed((all) => all.filter((x) => x.id !== p.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form className="track__form" onSubmit={runSearch}>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search podcasts…"
                  aria-label="Search podcasts"
                />
                <button type="submit" className="track__add" disabled={searching}>
                  {searching ? "…" : "Search"}
                </button>
              </form>
              {results && (
                <div className="pod-results">
                  {results.length === 0 && <div className="empty">No matches.</div>}
                  {results.map((p) => (
                    <button className="pod-result" key={p.id} onClick={() => follow(p)}>
                      {p.artwork ? (
                        <img className="pod__art" src={p.artwork} alt="" loading="lazy" />
                      ) : (
                        <span className="pod__art pod__art--blank" aria-hidden="true" />
                      )}
                      <span className="pod-result__name">{p.name}</span>
                      <span className="pod-result__add" aria-hidden="true">
                        +
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { config } from "../config";
import { geocode as geocodeCity, getJSON, milesBetween, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { TicketIcon } from "./icons";

// A tracked performer — anyone on Bandsintown (musicians, comedians, …).
// `lat`/`lon` scope their shows to config.concertRadiusMiles around a place;
// null means "anywhere on tour". Exported so onboarding can seed the list.
export type Tracked = {
  id: string;
  name: string;
  locLabel: string | null;
  lat: number | null;
  lon: number | null;
};

export type Show = {
  id: string;
  performer: string;
  date: Date;
  venue: string;
  city: string;
  url: string;
};

type BITEvent = {
  id: string;
  datetime: string;
  url: string;
  venue: { name: string; city: string; region?: string; latitude: string; longitude: string };
};

export const TRACKED_KEY = "daybreak.tracked";

function seed(): Tracked[] {
  const { label, latitude, longitude } = config.location;
  return config.artists.map((name) => ({
    id: crypto.randomUUID(),
    name,
    locLabel: label,
    lat: latitude,
    lon: longitude,
  }));
}

function loadTracked(): Tracked[] {
  try {
    const raw = localStorage.getItem(TRACKED_KEY);
    return raw ? (JSON.parse(raw) as Tracked[]) : seed();
  } catch {
    return seed();
  }
}

async function geocode(city: string): Promise<{ label: string; lat: number; lon: number }> {
  const loc = await geocodeCity(city);
  return { label: loc.label, lat: loc.latitude, lon: loc.longitude };
}

async function loadShows(tracked: Tracked[], radiusMiles: number): Promise<Show[]> {
  const results = await Promise.allSettled(
    tracked.map(async (t) => {
      const events = await getJSON<BITEvent[] | { errorMessage?: string }>(
        `/api/bandsintown/artists/${encodeURIComponent(t.name)}/events?app_id=js_ticketmaster`,
      );
      if (!Array.isArray(events)) return [];
      return events
        .filter((e) => {
          if (new Date(e.datetime).getTime() <= Date.now()) return false;
          if (t.lat == null || t.lon == null) return true;
          const lat = parseFloat(e.venue.latitude);
          const lon = parseFloat(e.venue.longitude);
          return (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            milesBetween(t.lat, t.lon, lat, lon) <= radiusMiles
          );
        })
        .map(
          (e): Show => ({
            id: e.id,
            performer: t.name,
            date: new Date(e.datetime),
            venue: e.venue.name,
            city: e.venue.region ? `${e.venue.city}, ${e.venue.region}` : e.venue.city,
            url: e.url,
          }),
        );
    }),
  );

  return results
    // Cap each performer so one long tour can't crowd out everyone else.
    .flatMap((r) => (r.status === "fulfilled" ? r.value.slice(0, 3) : []))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);
}

export function ShowRow({ show: s }: { show: Show }) {
  return (
    <a className="concert" href={s.url} target="_blank" rel="noreferrer">
      <span className="concert__date">
        <span className="m">{s.date.toLocaleDateString("en-US", { month: "short" })}</span>
        <span className="d">{s.date.getDate()}</span>
      </span>
      <span className="concert__info">
        <span className="concert__artist">{s.performer}</span>
        <span className="concert__venue">
          {s.venue} · {s.city}
        </span>
      </span>
    </a>
  );
}

/** Read-only view of upcoming shows for the tracked performers (Flow layout). */
export function useUpcomingShows(radiusMiles: number) {
  const [tracked] = useState<Tracked[]>(loadTracked);
  const trackedKey = tracked.map((t) => `${t.name}@${t.lat},${t.lon}`).join("|");
  return useFetched(
    () => loadShows(tracked, radiusMiles),
    [trackedKey, radiusMiles],
    6 * 60 * 60 * 1000,
  );
}

export function Shows() {
  const { settings } = useSettings();
  const [tracked, setTracked] = useState<Tracked[]>(loadTracked);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem(TRACKED_KEY, JSON.stringify(tracked));
  }, [tracked]);

  const trackedKey = tracked.map((t) => `${t.name}@${t.lat},${t.lon}`).join("|");
  // Refresh every 6 hours — tour announcements aren't urgent.
  const state = useFetched(
    () => loadShows(tracked, settings.concertRadiusMiles),
    [trackedKey, settings.concertRadiusMiles],
    6 * 60 * 60 * 1000,
  );

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    setFormError(null);
    try {
      const loc = city.trim() ? await geocode(city.trim()) : null;
      setTracked((all) => [
        ...all,
        {
          id: crypto.randomUUID(),
          name: trimmed,
          locLabel: loc?.label ?? null,
          lat: loc?.lat ?? null,
          lon: loc?.lon ?? null,
        },
      ]);
      setName("");
      setCity("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card
      title="Shows"
      icon={<TicketIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {state.status === "loading" && <SkeletonRows rows={3} height={22} />}
      {state.status === "error" && <div className="empty">Couldn't reach Bandsintown.</div>}
      {state.status === "ready" && (
        <>
          {state.data.length === 0 ? (
            <div className="empty">
              {tracked.length === 0
                ? "Not tracking anyone yet — hit Edit to add someone."
                : "No upcoming shows for the people you track."}
            </div>
          ) : (
            <div className="concert-list">
              {state.data.map((s) => (
                <ShowRow show={s} key={s.id} />
              ))}
            </div>
          )}

          {editing && (
            <div className="track">
              <div className="track__chips">
                {tracked.map((t) => (
                  <span className="chip" key={t.id} title={t.locLabel ?? "Anywhere"}>
                    {t.name}
                    <span className="chip__loc">{t.locLabel ?? "Anywhere"}</span>
                    <button
                      className="chip__x"
                      aria-label={`Stop tracking ${t.name}`}
                      onClick={() => setTracked((all) => all.filter((x) => x.id !== t.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form className="track__form" onSubmit={add}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Artist or comedian…"
                  aria-label="Performer name"
                />
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City (blank = anywhere)"
                  aria-label="City to watch"
                />
                <button type="submit" className="track__add" disabled={adding}>
                  {adding ? "…" : "Add"}
                </button>
                {formError && <span className="track__error">{formError}</span>}
              </form>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

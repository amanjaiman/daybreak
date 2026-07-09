import { useEffect, useState } from "react";

export type Fetched<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Fetch data on mount (and again every `refreshMs`, if given), with a typed
 * loading/error/ready state. Background refreshes never flash the loading
 * state, and a failed refresh keeps the last good data.
 */
export function useFetched<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  refreshMs?: number,
): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    const run = (initial: boolean) =>
      load().then(
        (data) => !cancelled && setState({ status: "ready", data }),
        (err) => !cancelled && initial && setState({ status: "error", message: String(err) }),
      );

    run(true);
    const timer = refreshMs ? setInterval(() => run(false), refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Resolve a city name to coordinates via Open-Meteo's free geocoder. */
export async function geocode(
  city: string,
): Promise<{ label: string; latitude: number; longitude: number }> {
  const data = await getJSON<{
    results?: { name: string; admin1?: string; latitude: number; longitude: number }[];
  }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`,
  );
  const r = data.results?.[0];
  if (!r) throw new Error(`Couldn't find "${city}"`);
  return {
    label: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function timeAgo(iso: string | number): string {
  const then = typeof iso === "number" ? iso : new Date(iso).getTime();
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

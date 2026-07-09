import { useState } from "react";
import type { FormEvent } from "react";
import { geocode, getJSON, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { SunIcon } from "./icons";

export type WeatherData = {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    sunrise: string[];
    sunset: string[];
  };
};

const WMO: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mostly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌦️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "🌨️" },
  75: { label: "Heavy snow", icon: "❄️" },
  80: { label: "Showers", icon: "🌦️" },
  81: { label: "Showers", icon: "🌧️" },
  82: { label: "Heavy showers", icon: "🌧️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm", icon: "⛈️" },
  99: { label: "Thunderstorm", icon: "⛈️" },
};

export const wmo = (code: number) => WMO[code] ?? { label: "—", icon: "🌡️" };

/** Current conditions + 6-day forecast for a location (refreshes every 30 min). */
export function useWeather(latitude: number, longitude: number) {
  return useFetched(
    () =>
      getJSON<WeatherData>(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,apparent_temperature,weather_code` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
          `&temperature_unit=fahrenheit&timezone=auto&forecast_days=6`,
      ),
    [latitude, longitude],
    30 * 60 * 1000,
  );
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function ForecastDays({ daily }: { daily: WeatherData["daily"] }) {
  return (
    <div className="weather__days">
      {daily.time.slice(1, 6).map((day, i) => {
        const idx = i + 1;
        return (
          <div className="weather__day" key={day}>
            <span className="d">
              {new Date(day + "T12:00").toLocaleDateString("en-US", { weekday: "short" })}
            </span>
            <span className="i">{wmo(daily.weather_code[idx]).icon}</span>
            <span className="hi">{Math.round(daily.temperature_2m_max[idx])}°</span>
            <span className="lo">{Math.round(daily.temperature_2m_min[idx])}°</span>
          </div>
        );
      })}
    </div>
  );
}

export function Weather() {
  const { settings, update } = useSettings();
  const { latitude, longitude, label } = settings.location;
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const state = useWeather(latitude, longitude);

  const saveCity = async (e: FormEvent) => {
    e.preventDefault();
    if (!city.trim() || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const loc = await geocode(city.trim());
      update({ location: loc });
      setCity("");
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={label}
      icon={<SunIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {editing && (
        <form className="track__form" style={{ marginBottom: 10 }} onSubmit={saveCity}>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Change home city…"
            aria-label="Home city"
            autoFocus
          />
          <button type="submit" className="track__add" disabled={saving}>
            {saving ? "…" : "Save"}
          </button>
          {formError && <span className="track__error">{formError}</span>}
        </form>
      )}
      {state.status === "loading" && <SkeletonRows rows={3} height={24} />}
      {state.status === "error" && <div className="empty">Weather unavailable right now.</div>}
      {state.status === "ready" && (
        <>
          <div className="weather__now">
            <span className="weather__icon">{wmo(state.data.current.weather_code).icon}</span>
            <span className="weather__temp">{Math.round(state.data.current.temperature_2m)}°</span>
            <span className="weather__desc">
              <strong>{wmo(state.data.current.weather_code).label}</strong>
              Feels like {Math.round(state.data.current.apparent_temperature)}°
            </span>
            <span className="weather__sun">
              Sunrise <b>{fmtTime(state.data.daily.sunrise[0])}</b>
              <br />
              Sunset <b>{fmtTime(state.data.daily.sunset[0])}</b>
            </span>
          </div>
          <ForecastDays daily={state.data.daily} />
        </>
      )}
    </Card>
  );
}

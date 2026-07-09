import { useState } from "react";
import type { FormEvent } from "react";
import { getJSON, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { ChartIcon } from "./icons";

type SparkEntry = {
  symbol: string;
  previousClose: number | null;
  chartPreviousClose: number;
  close: (number | null)[];
};

type Quote = {
  symbol: string;
  price: number;
  changePct: number;
  series: number[];
};

async function loadQuotes(stocks: string[]): Promise<Quote[]> {
  if (stocks.length === 0) return [];
  const data = await getJSON<Record<string, SparkEntry>>(
    `/api/yahoo/v8/finance/spark?symbols=${encodeURIComponent(stocks.join(","))}&range=1d&interval=15m`,
  );
  return stocks.flatMap((symbol) => {
    const entry = data[symbol];
    if (!entry) return [];
    const series = (entry.close ?? []).filter((v): v is number => v != null);
    if (series.length === 0) return [];
    const price = series[series.length - 1];
    const prev = entry.previousClose ?? entry.chartPreviousClose;
    return [{ symbol, price, changePct: prev ? ((price - prev) / prev) * 100 : 0, series }];
  });
}

/** Latest quotes + intraday sparkline data for a watchlist (refreshes every 5 min). */
export function useQuotes(stocks: string[]) {
  return useFetched(() => loadQuotes(stocks), [stocks.join(",")], 5 * 60 * 1000);
}

function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  const w = 64;
  const h = 20;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points = series
    .map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const color = up ? "var(--positive)" : "var(--live)";
  return (
    <svg className="stock__spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={color} opacity="0.08" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Stocks() {
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const state = useQuotes(settings.stocks);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const symbol = draft.trim().toUpperCase();
    if (!symbol || settings.stocks.includes(symbol)) return;
    update({ stocks: [...settings.stocks, symbol] });
    setDraft("");
  };

  const remove = (symbol: string) =>
    update({ stocks: settings.stocks.filter((s) => s !== symbol) });

  return (
    <Card
      title="Stocks"
      icon={<ChartIcon />}
      actions={<EditButton editing={editing} onToggle={() => setEditing((v) => !v)} />}
    >
      {editing && (
        <div className="track" style={{ borderTop: "none", marginTop: 0, paddingTop: 4, paddingBottom: 8 }}>
          <div className="track__chips">
            {settings.stocks.map((s) => (
              <span className="chip" key={s}>
                {s}
                <button className="chip__x" aria-label={`Remove ${s}`} onClick={() => remove(s)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <form className="track__form" onSubmit={add}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add ticker (e.g. TSLA)…"
              aria-label="Add ticker"
            />
            <button type="submit" className="track__add">
              Add
            </button>
          </form>
        </div>
      )}
      {state.status === "loading" && <SkeletonRows rows={Math.max(settings.stocks.length, 2)} height={20} />}
      {state.status === "error" && <div className="empty">Couldn't load quotes.</div>}
      {state.status === "ready" && (
        <div>
          {state.data.length === 0 && (
            <div className="empty">
              {settings.stocks.length === 0 ? "Add a ticker to start a watchlist." : "No quotes for your watchlist."}
            </div>
          )}
          {state.data.map((q) => {
            const up = q.changePct >= 0;
            return (
              <a
                className="stock"
                key={q.symbol}
                href={`https://finance.yahoo.com/quote/${q.symbol}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="stock__symbol">{q.symbol}</span>
                <Sparkline series={q.series} up={up} />
                <span className="stock__price">
                  {q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`stock__change ${up ? "up" : "down"}`}>
                  {up ? "+" : ""}
                  {q.changePct.toFixed(2)}%
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { geocode } from "../lib/api";
import { useSettings } from "../lib/settings";
import type { League, Topic } from "../lib/settings";
import type { CardId } from "../lib/board";
import { LEAGUE_CATALOG } from "./Soccer";
import { CheckIcon } from "./icons";
import {
  DaybreakMark,
  PillPicker,
  STARTER_LEAGUES,
  STOCK_IDEAS,
  ThemeToggle,
  TOPIC_IDEAS,
  WIDGET_CATALOG,
  applySetup,
} from "./setup";

/**
 * First-run setup: a quiet full-screen flow that collects a name, a home
 * city, the optional cards for the board, and each picked card's essentials —
 * so a fresh visitor never sees someone else's defaults (see config.ts).
 * Search, Todos and Reading are always on and aren't asked about. Everything
 * here is editable later from each card or the Personalize panel.
 */

type StepId = "welcome" | "location" | "widgets" | "news" | "football" | "shows" | "stocks" | "done";

// Every stage the flow can pass through, in order. The progress bar measures
// against this fixed list so picking fewer widgets can't rewind it.
const STAGE_ORDER: StepId[] = [
  "welcome",
  "location",
  "widgets",
  "news",
  "football",
  "shows",
  "stocks",
  "done",
];

const OPTIONAL_IDS = WIDGET_CATALOG.map((w) => w.id);

export function Onboarding() {
  const { settings, update } = useSettings();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [loc, setLoc] = useState<{ label: string; latitude: number; longitude: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  const [picked, setPicked] = useState<Set<CardId>>(() => new Set(OPTIONAL_IDS));
  const [topics, setTopics] = useState<Topic[]>([]);
  const [leagues, setLeagues] = useState<League[]>(() =>
    LEAGUE_CATALOG.filter((l) => STARTER_LEAGUES.has(l.slug)),
  );
  const [stocks, setStocks] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);

  const steps = useMemo<StepId[]>(
    () => [
      "welcome",
      "location",
      "widgets",
      ...(["news", "football", "shows", "stocks"] as const).filter((id) => picked.has(id)),
      "done",
    ],
    [picked],
  );
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const step = steps[Math.min(index, steps.length - 1)];
  // Progress is measured against the fixed set of possible stages, not the
  // currently-active subset — so toggling widgets on the picker (which adds or
  // drops later steps) never makes the bar move. It only advances on Continue.
  const progress = STAGE_ORDER.indexOf(step) / (STAGE_ORDER.length - 1);

  const back = () => setIndex((i) => Math.max(0, i - 1));

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    if (step === "welcome" && !name.trim()) return;
    if (step === "location") {
      const typed = city.trim();
      if (!typed && !loc) {
        setLocError("Tell us a city so weather and shows know where to look.");
        return;
      }
      if (typed) {
        setLocBusy(true);
        setLocError(null);
        try {
          setLoc(await geocode(typed));
          setCity("");
        } catch (err) {
          setLocError(err instanceof Error ? err.message : String(err));
          return;
        } finally {
          setLocBusy(false);
        }
      }
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const finish = () => {
    applySetup(
      settings,
      update,
      {
        name,
        location: loc!,
        topics,
        nbaTeam: null,
        leagues,
        stocks,
        artists,
        hidden: OPTIONAL_IDS.filter((id) => !picked.has(id)),
      },
      { balance: true },
    );
  };

  const enter = () => {
    setLeaving(true);
    window.setTimeout(finish, 420);
  };

  const togglePick = (id: CardId) =>
    setPicked((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });

  // Topic pills: the suggestion list plus any custom additions, which render
  // exactly like the predefined ones (always on while present).
  const topicPills = [
    ...TOPIC_IDEAS.map((idea) => ({
      key: idea.label,
      label: idea.label,
      on: topics.some((t) => t.label.toLowerCase() === idea.label.toLowerCase()),
    })),
    ...topics
      .filter((t) => !TOPIC_IDEAS.some((i) => i.label.toLowerCase() === t.label.toLowerCase()))
      .map((t) => ({ key: t.label, label: t.label, on: true })),
  ];
  const toggleTopic = (key: string) => {
    const existing = topics.find((t) => t.label.toLowerCase() === key.toLowerCase());
    if (existing) {
      setTopics((prev) => prev.filter((t) => t !== existing));
    } else {
      const idea = TOPIC_IDEAS.find((i) => i.label === key);
      setTopics((prev) => [...prev, { id: crypto.randomUUID(), label: key, query: idea?.query ?? key }]);
    }
  };

  const stockPills = [
    ...STOCK_IDEAS.map((s) => ({ key: s, label: s, on: stocks.includes(s) })),
    ...stocks.filter((s) => !STOCK_IDEAS.includes(s)).map((s) => ({ key: s, label: s, on: true })),
  ];
  const toggleStock = (key: string) =>
    setStocks((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const nav = (opts?: { skip?: boolean; label?: string }) => (
    <div className="onboard__row">
      {index > 0 && (
        <button type="button" className="onboard__back" onClick={back}>
          Back
        </button>
      )}
      <span className="onboard__spacer" />
      {opts?.skip && (
        <button type="button" className="onboard__skip" onClick={() => next()}>
          Skip for now
        </button>
      )}
      <button
        type="submit"
        className="onboard__next"
        disabled={locBusy || (step === "welcome" && !name.trim())}
      >
        {locBusy ? "Finding…" : (opts?.label ?? "Continue")}
      </button>
    </div>
  );

  return (
    <div className={`onboard${leaving ? " is-leaving" : ""}`} role="dialog" aria-label="Set up Daybreak">
      <div className="onboard__inner">
        <DaybreakMark />
        <ThemeToggle />

        <form className="onboard__step" key={step} onSubmit={next}>
          {step === "welcome" && (
            <>
              <span className="onboard__overline">Welcome to Daybreak</span>
              <h1 className="onboard__title">A calm start to the day.</h1>
              <p className="onboard__sub">
                Use AI to make it yours. But first: what should we call you?
              </p>
              <input
                className="onboard__input onboard__input--lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                autoFocus
              />
              {nav({ label: "Begin" })}
            </>
          )}

          {step === "location" && (
            <>
              <span className="onboard__overline">Step {index + 1}</span>
              <h1 className="onboard__title">Where's home?</h1>
              <p className="onboard__sub">Sets your weather and where to look for shows.</p>
              <input
                className="onboard__input onboard__input--lg"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City, e.g. Seattle"
                aria-label="Home city"
                autoFocus
              />
              {locError && <p className="onboard__error">{locError}</p>}
              {nav()}
            </>
          )}

          {step === "widgets" && (
            <>
              <span className="onboard__overline">Step {index + 1}</span>
              <h1 className="onboard__title">What belongs on your board?</h1>
              <p className="onboard__sub">
                Search, todos, and a reading list are always there. The rest is up to you — and can
                change any time.
              </p>
              <div className="onboard__grid">
                {WIDGET_CATALOG.map((w) => {
                  const on = picked.has(w.id);
                  return (
                    <button
                      type="button"
                      key={w.id}
                      className={`wtile${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => togglePick(w.id)}
                    >
                      <span className="wtile__icon">{w.icon}</span>
                      <span className="wtile__text">
                        <span className="wtile__title">{w.title}</span>
                        <span className="wtile__desc">{w.desc}</span>
                      </span>
                      <span className="wtile__check" aria-hidden="true">
                        <CheckIcon />
                      </span>
                    </button>
                  );
                })}
              </div>
              {nav()}
            </>
          )}

          {step === "news" && (
            <>
              <span className="onboard__overline">Step {index + 1} · News</span>
              <h1 className="onboard__title">What do you follow?</h1>
              <p className="onboard__sub">Each topic becomes a tab of headlines.</p>
              <PillPicker
                pills={topicPills}
                onToggle={toggleTopic}
                addPlaceholder="Add your own topic…"
                onAdd={toggleTopic}
              />
              {nav({ skip: true })}
            </>
          )}

          {step === "football" && (
            <>
              <span className="onboard__overline">Step {index + 1} · Football</span>
              <h1 className="onboard__title">Which competitions?</h1>
              <p className="onboard__sub">Fixtures and live scores from everywhere you pick.</p>
              <PillPicker
                pills={LEAGUE_CATALOG.map((l) => ({
                  key: l.slug,
                  label: l.label,
                  on: leagues.some((x) => x.slug === l.slug),
                }))}
                onToggle={(slug) =>
                  setLeagues((prev) => {
                    const league = LEAGUE_CATALOG.find((l) => l.slug === slug)!;
                    return prev.some((l) => l.slug === slug)
                      ? prev.filter((l) => l.slug !== slug)
                      : [...prev, league];
                  })
                }
              />
              {nav()}
            </>
          )}

          {step === "shows" && (
            <>
              <span className="onboard__overline">Step {index + 1} · Shows</span>
              <h1 className="onboard__title">Anyone you'd go see live?</h1>
              <p className="onboard__sub">
                Musicians, comedians — anyone touring. We'll watch for dates near{" "}
                <b>{loc?.label}</b>.
              </p>
              <PillPicker
                pills={artists.map((a) => ({ key: a, label: a, on: true }))}
                onToggle={(a) => setArtists((prev) => prev.filter((x) => x !== a))}
                addPlaceholder="Artist or comedian…"
                onAdd={(a) => setArtists((prev) => (prev.includes(a) ? prev : [...prev, a]))}
              />
              {nav({ skip: true })}
            </>
          )}

          {step === "stocks" && (
            <>
              <span className="onboard__overline">Step {index + 1} · Stocks</span>
              <h1 className="onboard__title">What's on your watchlist?</h1>
              <p className="onboard__sub">Quotes and sparklines, refreshed through the day.</p>
              <PillPicker
                pills={stockPills}
                onToggle={toggleStock}
                addPlaceholder="Add a ticker, e.g. VTI…"
                onAdd={(s) => setStocks((prev) => (prev.includes(s) ? prev : [...prev, s]))}
                transform={(v) => v.toUpperCase()}
              />
              {nav({ skip: true })}
            </>
          )}

          {step === "done" && (
            <>
              <span className="onboard__overline">All set</span>
              <h1 className="onboard__title">Daybreak is ready.</h1>
              <p className="onboard__sub">
                Use the bubble to generate widgets and make it yours.
              </p>
              <div className="onboard__row">
                <button type="button" className="onboard__back" onClick={back}>
                  Back
                </button>
                <span className="onboard__spacer" />
                <button type="button" className="onboard__next" onClick={enter}>
                  Open Daybreak
                </button>
              </div>
            </>
          )}
        </form>

        <div
          className="onboard__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="onboard__progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

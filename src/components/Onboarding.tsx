import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { geocode } from "../lib/api";
import { storedCustomIds, useSettings } from "../lib/settings";
import type { League, Topic } from "../lib/settings";
import { CARD_IDS, balanceBoard, normalizeBoard, normalizeSpans } from "../lib/board";
import type { CardId } from "../lib/board";
import { LEAGUE_CATALOG } from "./Soccer";
import { loadNBATeams } from "./News";
import type { NBATeam } from "./News";
import { TRACKED_KEY } from "./Shows";
import type { Tracked } from "./Shows";
import {
  BallIcon,
  BookIcon,
  ChartIcon,
  CheckCircleIcon,
  CheckIcon,
  MagnifierIcon,
  NewsIcon,
  SunIcon,
  TicketIcon,
} from "./icons";

/**
 * First-run setup: a quiet full-screen flow that collects a name, a home
 * city, the set of cards for the board, and each picked card's essentials —
 * so a fresh visitor never sees someone else's defaults (see config.ts).
 * Re-runnable from the bubble menu ("Personalize"), prefilled with current
 * choices. Everything lands in useSettings plus the tracked-performer list.
 */

type StepId = "welcome" | "location" | "widgets" | "news" | "football" | "shows" | "stocks" | "done";

const WIDGETS: { id: CardId; icon: ReactNode; title: string; desc: string }[] = [
  { id: "search", icon: <MagnifierIcon />, title: "Search", desc: "One bar for Google, ChatGPT & more" },
  { id: "weather", icon: <SunIcon />, title: "Weather", desc: "Right now, plus the week ahead" },
  { id: "news", icon: <NewsIcon />, title: "News", desc: "Headlines for topics you follow" },
  { id: "todos", icon: <CheckCircleIcon />, title: "Todos", desc: "A simple list for the day" },
  { id: "reading", icon: <BookIcon />, title: "Reading", desc: "Links saved for later" },
  { id: "football", icon: <BallIcon />, title: "Football", desc: "Fixtures and live scores" },
  { id: "shows", icon: <TicketIcon />, title: "Shows", desc: "Concerts near your city" },
  { id: "stocks", icon: <ChartIcon />, title: "Stocks", desc: "Your watchlist at a glance" },
];

// Gentle starting points — tapping one adds it, nothing is preselected.
const TOPIC_IDEAS = [
  { label: "Tech", query: "technology OR software" },
  { label: "AI", query: "AI OR LLM" },
  { label: "Startups", query: "startup OR funding" },
  { label: "Science", query: "science OR research" },
  { label: "Climate", query: "climate OR energy" },
  { label: "Design", query: "design OR UX" },
];
const STOCK_IDEAS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "SPY"];
const STARTER_LEAGUES = new Set(["uefa.champions", "eng.1", "fifa.world"]);

// The dawn mark, mid-rise: the sun climbs (and its rays warm up) as steps
// complete, cresting the horizon on the final screen.
function SunriseMark({ progress }: { progress: number }) {
  return (
    <svg className="onboard__mark" viewBox="0 0 64 40" aria-hidden="true">
      <defs>
        <clipPath id="onboard-horizon">
          <rect x="0" y="0" width="64" height="31" />
        </clipPath>
      </defs>
      <g clipPath="url(#onboard-horizon)">
        <g className="onboard__sun" style={{ transform: `translateY(${(1 - progress) * 15}px)` }}>
          <circle cx="32" cy="22" r="7.5" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
          <g
            stroke="var(--accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            style={{ opacity: progress }}
          >
            <path d="M32 7.5v3.5" />
            <path d="M21.8 11.7l2.5 2.5" />
            <path d="M42.2 11.7l-2.5 2.5" />
            <path d="M17.5 22h3.5" />
            <path d="M43 22h3.5" />
          </g>
        </g>
      </g>
      <path d="M8 31h48" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A removable-chip list plus an input that adds on Enter (or the ⏎ button). */
function ChipField({
  items,
  onAdd,
  onRemove,
  placeholder,
  transform = (v: string) => v,
}: {
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
  transform?: (value: string) => string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = transform(draft.trim());
    if (!value) return;
    if (!items.includes(value)) onAdd(value);
    setDraft("");
  };
  return (
    <div className="onboard__chipfield">
      {items.length > 0 && (
        <div className="track__chips">
          {items.map((item) => (
            <span className="chip" key={item}>
              {item}
              <button
                type="button"
                className="chip__x"
                aria-label={`Remove ${item}`}
                onClick={() => onRemove(item)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="onboard__addrow">
        <input
          className="onboard__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="onboard__add" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

export function Onboarding({ rerun = false, onClose }: { rerun?: boolean; onClose?: () => void }) {
  const { settings, update } = useSettings();

  const [name, setName] = useState(rerun ? settings.name : "");
  const [city, setCity] = useState("");
  const [loc, setLoc] = useState(rerun ? settings.location : null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  const [picked, setPicked] = useState<Set<CardId>>(
    () => new Set(rerun ? CARD_IDS.filter((id) => !settings.hidden.includes(id)) : CARD_IDS),
  );

  const [topics, setTopics] = useState<Topic[]>(rerun ? settings.topics : []);
  const [team, setTeam] = useState(rerun ? settings.nbaTeam : null);
  const [teams, setTeams] = useState<NBATeam[] | null>(null);
  const [leagues, setLeagues] = useState<League[]>(() =>
    rerun ? settings.soccerLeagues : LEAGUE_CATALOG.filter((l) => STARTER_LEAGUES.has(l.slug)),
  );
  const [stocks, setStocks] = useState<string[]>(rerun ? settings.stocks : []);
  const [artists, setArtists] = useState<string[]>(() => {
    if (!rerun) return [];
    try {
      const raw = JSON.parse(localStorage.getItem(TRACKED_KEY) ?? "[]") as Tracked[];
      return Array.isArray(raw) ? raw.map((t) => t.name) : [];
    } catch {
      return [];
    }
  });

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
  const progress = steps.length > 1 ? index / (steps.length - 1) : 1;

  // Only fetch the NBA team list if the flow actually reaches the News step.
  useEffect(() => {
    if (step === "news" && teams === null) {
      loadNBATeams().then(setTeams, () => setTeams([]));
    }
  }, [step, teams]);

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
    const hidden = CARD_IDS.filter((id) => !picked.has(id));
    // If Search is joining the board now (fresh pick or re-enabled on a
    // re-run), it should arrive at its intended full width.
    const hadSearch = settings.board.some((col) => col.includes("search"));
    const board = balanceBoard(normalizeBoard(settings.board, storedCustomIds(), hidden));
    const spans =
      picked.has("search") && !hadSearch ? { ...settings.spans, search: 3 as const } : settings.spans;

    // Seed the Shows tracking list here (its card may never have mounted) —
    // always written, so config.ts's personal defaults can't leak in later.
    // On a re-run, entries that survived keep their original watch city.
    let prev: Tracked[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(TRACKED_KEY) ?? "[]") as Tracked[];
      prev = rerun && Array.isArray(raw) ? raw : [];
    } catch {
      prev = [];
    }
    const kept = prev.filter((t) => artists.includes(t.name));
    const have = new Set(kept.map((t) => t.name));
    const added = artists
      .filter((a) => !have.has(a))
      .map(
        (performer): Tracked => ({
          id: crypto.randomUUID(),
          name: performer,
          locLabel: loc!.label,
          lat: loc!.latitude,
          lon: loc!.longitude,
        }),
      );
    localStorage.setItem(TRACKED_KEY, JSON.stringify([...kept, ...added]));

    update({
      name: name.trim(),
      location: loc!,
      topics,
      nbaTeam: team,
      soccerLeagues: leagues,
      stocks,
      hidden,
      board,
      spans: normalizeSpans(spans, board),
      onboarded: true,
    });
    onClose?.();
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

  const toggleLeague = (league: League) =>
    setLeagues((prev) =>
      prev.some((l) => l.slug === league.slug)
        ? prev.filter((l) => l.slug !== league.slug)
        : [...prev, league],
    );

  const addTopic = (idea: { label: string; query: string }) =>
    setTopics((prev) =>
      prev.some((t) => t.label.toLowerCase() === idea.label.toLowerCase())
        ? prev
        : [...prev, { id: crypto.randomUUID(), ...idea }],
    );

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
        <SunriseMark progress={progress} />

        {rerun && (
          <button className="onboard__close" aria-label="Cancel setup" onClick={() => onClose?.()}>
            ×
          </button>
        )}

        <form className="onboard__step" key={step} onSubmit={next}>
          {step === "welcome" && (
            <>
              <span className="onboard__overline">Welcome to Daybreak</span>
              <h1 className="onboard__title">A calm start to the day.</h1>
              <p className="onboard__sub">
                Your morning at a glance — weather, headlines, matches, whatever you care about. A
                few quick questions and it's yours. First: what should we call you?
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
              <p className="onboard__sub">
                Sets your weather and where to look for shows.
                {loc && (
                  <>
                    {" "}
                    Currently <b>{loc.label}</b> — leave blank to keep it.
                  </>
                )}
              </p>
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
                Tap to leave anything off — you can bring it back later from the Daybreak bubble.
              </p>
              <div className="onboard__grid">
                {WIDGETS.map((w) => {
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
              <div className="onboard__ideas">
                {TOPIC_IDEAS.map((idea) => {
                  const on = topics.some((t) => t.label.toLowerCase() === idea.label.toLowerCase());
                  return (
                    <button
                      type="button"
                      key={idea.label}
                      className={`pick${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        on
                          ? setTopics((prev) =>
                              prev.filter(
                                (t) => t.label.toLowerCase() !== idea.label.toLowerCase(),
                              ),
                            )
                          : addTopic(idea)
                      }
                    >
                      {idea.label}
                    </button>
                  );
                })}
              </div>
              <ChipField
                items={topics
                  .filter((t) => !TOPIC_IDEAS.some((i) => i.label.toLowerCase() === t.label.toLowerCase()))
                  .map((t) => t.label)}
                onAdd={(label) => addTopic({ label, query: label })}
                onRemove={(label) => setTopics((prev) => prev.filter((t) => t.label !== label))}
                placeholder="Add your own topic…"
              />
              <label className="onboard__field">
                Follow an NBA team?
                <select
                  className="onboard__select"
                  value={team?.espnId ?? ""}
                  onChange={(e) => {
                    const t = teams?.find((x) => x.id === e.target.value);
                    setTeam(t ? { espnId: t.id, name: t.name.split(" ").pop()! } : null);
                  }}
                >
                  <option value="">No thanks</option>
                  {teams === null && team && <option value={team.espnId}>{team.name}</option>}
                  {teams?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {nav({ skip: true })}
            </>
          )}

          {step === "football" && (
            <>
              <span className="onboard__overline">Step {index + 1} · Football</span>
              <h1 className="onboard__title">Which competitions?</h1>
              <p className="onboard__sub">Fixtures and live scores from everywhere you pick.</p>
              <div className="onboard__ideas">
                {LEAGUE_CATALOG.map((league) => {
                  const on = leagues.some((l) => l.slug === league.slug);
                  return (
                    <button
                      type="button"
                      key={league.slug}
                      className={`pick${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleLeague(league)}
                    >
                      {league.label}
                    </button>
                  );
                })}
              </div>
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
              <ChipField
                items={artists}
                onAdd={(a) => setArtists((prev) => [...prev, a])}
                onRemove={(a) => setArtists((prev) => prev.filter((x) => x !== a))}
                placeholder="Artist or comedian…"
              />
              {nav({ skip: true })}
            </>
          )}

          {step === "stocks" && (
            <>
              <span className="onboard__overline">Step {index + 1} · Stocks</span>
              <h1 className="onboard__title">What's on your watchlist?</h1>
              <p className="onboard__sub">Quotes and sparklines, refreshed through the day.</p>
              <div className="onboard__ideas">
                {STOCK_IDEAS.map((symbol) => {
                  const on = stocks.includes(symbol);
                  return (
                    <button
                      type="button"
                      key={symbol}
                      className={`pick${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() =>
                        setStocks((prev) =>
                          on ? prev.filter((s) => s !== symbol) : [...prev, symbol],
                        )
                      }
                    >
                      {symbol}
                    </button>
                  );
                })}
              </div>
              <ChipField
                items={stocks.filter((s) => !STOCK_IDEAS.includes(s))}
                onAdd={(s) => setStocks((prev) => [...prev, s])}
                onRemove={(s) => setStocks((prev) => prev.filter((x) => x !== s))}
                placeholder="Add a ticker, e.g. VTI…"
                transform={(v) => v.toUpperCase()}
              />
              {nav({ skip: true })}
            </>
          )}

          {step === "done" && (
            <>
              <span className="onboard__overline">All set</span>
              <h1 className="onboard__title">Enjoy the view, {name.trim() || "friend"}.</h1>
              <p className="onboard__sub">
                Your board is ready. Every card can be rearranged, resized, and refined later — and
                the Daybreak bubble in the corner can even generate new widgets from a sentence.
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

        <div className="onboard__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={`onboard__dot${i === index ? " is-here" : i < index ? " is-done" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

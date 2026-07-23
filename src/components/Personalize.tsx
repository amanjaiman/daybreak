import { useState } from "react";
import type { FormEvent } from "react";
import { geocode } from "../lib/api";
import { useSettings } from "../lib/settings";
import type { Topic } from "../lib/settings";
import type { BoardId } from "../lib/board";
import { useCustomWidgets } from "../lib/customWidgets";
import { LEAGUE_CATALOG } from "./Soccer";
import { WidgetIcon } from "./widgetIcons";
import { CheckIcon } from "./icons";
import {
  DaybreakMark,
  PillPicker,
  STOCK_IDEAS,
  ThemeToggle,
  TOPIC_IDEAS,
  WIDGET_CATALOG,
  applySetup,
  readTracked,
} from "./setup";

/**
 * The Personalize panel (bubble menu): every onboarding choice on one quiet
 * screen — name, home, which cards are on the board (generated widgets
 * included, so hiding one isn't forever), and each card's essentials.
 * Nothing is saved until "Save changes".
 */
export function Personalize({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const { widgets, remove } = useCustomWidgets();

  const [name, setName] = useState(settings.name);
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [hidden, setHidden] = useState<Set<BoardId>>(() => new Set(settings.hidden));
  const [topics, setTopics] = useState<Topic[]>(settings.topics);
  const [leagues, setLeagues] = useState(settings.soccerLeagues);
  const [stocks, setStocks] = useState(settings.stocks);
  const [artists, setArtists] = useState<string[]>(() => readTracked().map((t) => t.name));

  const toggle = (id: BoardId) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const location = city.trim() ? await geocode(city.trim()) : settings.location;
      applySetup(settings, update, {
        name: name.trim() || settings.name,
        location,
        topics,
        nbaTeam: settings.nbaTeam,
        leagues,
        stocks,
        artists,
        hidden: [...hidden],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

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

  const generated = widgets.filter((w) => w.status === "ready");
  const showConfig = (id: BoardId) => !hidden.has(id);

  return (
    <div className="onboard pz" role="dialog" aria-modal="true" aria-label="Personalize Daybreak">
      <form className="onboard__inner pz__inner" onSubmit={save}>
        <header className="pz__head">
          <DaybreakMark size={34} />
          <h1 className="pz__title">Personalize</h1>
          <span className="onboard__spacer" />
          <ThemeToggle />
          <button type="button" className="pz__close" aria-label="Close without saving" onClick={onClose}>
            ×
          </button>
        </header>

        <section className="pz__section">
          <h2 className="onboard__overline">You</h2>
          <div className="pz__pair">
            <label className="pz__field">
              Name
              <input
                className="onboard__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Your name"
              />
            </label>
            <label className="pz__field">
              Home city
              <input
                className="onboard__input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={settings.location.label}
                aria-label="Home city"
              />
            </label>
          </div>
        </section>

        <section className="pz__section">
          <h2 className="onboard__overline">Cards</h2>
          <p className="pz__hint">
            Search, todos, and reading are always on your board. Generated widgets you switch off
            keep their data and can come back any time.
          </p>
          <div className="onboard__grid">
            {WIDGET_CATALOG.map((w) => {
              const on = !hidden.has(w.id);
              return (
                <button
                  type="button"
                  key={w.id}
                  className={`wtile${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggle(w.id)}
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
            {generated.map((w) => {
              const on = !hidden.has(w.id);
              return (
                <div key={w.id} className={`wtile wtile--generated${on ? " is-on" : ""}`}>
                  <button
                    type="button"
                    className="wtile__body"
                    aria-pressed={on}
                    onClick={() => toggle(w.id)}
                  >
                    <span className="wtile__icon">
                      <WidgetIcon name={w.icon} />
                    </span>
                    <span className="wtile__text">
                      <span className="wtile__title">{w.title}</span>
                      <span className="wtile__desc">Generated widget</span>
                    </span>
                    <span className="wtile__check" aria-hidden="true">
                      <CheckIcon />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="wtile__delete"
                    aria-label={`Delete ${w.title} forever`}
                    title="Delete forever"
                    onClick={() => {
                      if (window.confirm(`Delete the "${w.title}" widget forever? Its saved data goes too.`)) {
                        remove(w.id);
                        setHidden((prev) => {
                          const next = new Set(prev);
                          next.delete(w.id);
                          return next;
                        });
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {showConfig("news") && (
          <section className="pz__section">
            <h2 className="onboard__overline">News topics</h2>
            <PillPicker
              pills={topicPills}
              onToggle={toggleTopic}
              addPlaceholder="Add your own topic…"
              onAdd={toggleTopic}
            />
          </section>
        )}

        {showConfig("football") && (
          <section className="pz__section">
            <h2 className="onboard__overline">Football competitions</h2>
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
          </section>
        )}

        {showConfig("shows") && (
          <section className="pz__section">
            <h2 className="onboard__overline">Artists you track</h2>
            <PillPicker
              pills={artists.map((a) => ({ key: a, label: a, on: true }))}
              onToggle={(a) => setArtists((prev) => prev.filter((x) => x !== a))}
              addPlaceholder="Artist or comedian…"
              onAdd={(a) => setArtists((prev) => (prev.includes(a) ? prev : [...prev, a]))}
            />
          </section>
        )}

        {showConfig("stocks") && (
          <section className="pz__section">
            <h2 className="onboard__overline">Stock watchlist</h2>
            <PillPicker
              pills={stockPills}
              onToggle={(s) =>
                setStocks((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
              }
              addPlaceholder="Add a ticker, e.g. VTI…"
              onAdd={(s) => setStocks((prev) => (prev.includes(s) ? prev : [...prev, s]))}
              transform={(v) => v.toUpperCase()}
            />
          </section>
        )}

        {error && <p className="onboard__error">{error}</p>}

        <div className="onboard__row pz__row">
          <button type="button" className="onboard__back" onClick={onClose}>
            Cancel
          </button>
          <span className="onboard__spacer" />
          <button type="submit" className="onboard__next" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

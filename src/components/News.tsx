import { useState } from "react";
import type { FormEvent } from "react";
import { timeAgo, useFetched } from "../lib/api";
import { useSettings } from "../lib/settings";
import { Card, EditButton, SkeletonRows } from "./Card";
import { NewsIcon } from "./icons";

export type Story = { id: string; title: string; url: string; meta: string };

/**
 * Headlines for a topic via Google News RSS — general-interest coverage of
 * whatever the user follows (K-pop, cricket, gardening…), where our other
 * source (Hacker News) only surfaces tech. The `query` supports Google's OR
 * operator, matching how topic queries are stored (e.g. "AI OR LLM").
 */
export async function loadTopic(query: string): Promise<Story[]> {
  const res = await fetch(
    `/api/gnews/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
  );
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Couldn't read the news feed.");

  return [...xml.querySelectorAll("item")].slice(0, 6).map((item, i) => {
    const rawTitle = item.querySelector("title")?.textContent ?? "";
    const source = item.querySelector("source")?.textContent ?? "";
    // Google News titles read "Headline - Source"; drop the redundant suffix.
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle;
    const pubDate = item.querySelector("pubDate")?.textContent;
    return {
      id: item.querySelector("guid")?.textContent || String(i),
      title,
      url: item.querySelector("link")?.textContent ?? "",
      meta: [source, pubDate ? timeAgo(pubDate) : null].filter(Boolean).join(" · "),
    };
  });
}

export function News() {
  const { settings, update } = useSettings();
  // Every tab is a topic now. Following a team is just a topic like "Golden
  // State Warriors" — Google News (see loadTopic) covers team coverage too, so
  // there's no separate, sport-specific "team news" concept baked in.
  const tabs = settings.topics.map((t) => ({ id: t.id, label: t.label, query: t.query }));

  const [active, setActive] = useState<string | undefined>(tabs[0]?.id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [terms, setTerms] = useState("");

  // Refresh the visible tab every 15 minutes. `tab` is undefined once every
  // topic has been removed — nothing to fetch then.
  const state = useFetched(
    () => (tab ? loadTopic(tab.query) : Promise.resolve([])),
    [tab?.id],
    15 * 60 * 1000,
  );

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
    if (active === id) setActive(tabs.find((t) => t.id !== id)?.id);
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
          <p className="track__note">
            Follow anything — a subject, a team, a place. Each becomes a tab of headlines.
          </p>
        </div>
      ) : (
        <>
          {state.status === "loading" && <SkeletonRows rows={5} />}
          {state.status === "error" && <div className="empty">Couldn't load stories.</div>}
          {state.status === "ready" && (
            <div className="news__list">
              {tabs.length === 0 && (
                <div className="empty">Add topics to follow from the Edit button.</div>
              )}
              {tabs.length > 0 && state.data.length === 0 && (
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

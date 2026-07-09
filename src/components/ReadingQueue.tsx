import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Card } from "./Card";
import { BookIcon, CheckIcon } from "./icons";

type Item = {
  id: string;
  url: string;
  title: string;
  domain: string;
  favicon?: string;
  enriched?: boolean;
};

const STORAGE_KEY = "daybreak.reading";

function loadItems(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Item[];
  } catch {
    return [];
  }
}

/** Turn a pasted URL into something readable: the last path segment, humanized. */
function describe(raw: string): { url: string; title: string; domain: string } | null {
  let url: URL;
  try {
    url = new URL(raw.match(/^https?:\/\//) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const domain = url.hostname.replace(/^www\./, "");
  const segment = url.pathname
    .split("/")
    .filter(Boolean)
    .pop();
  const title = segment
    ? decodeURIComponent(segment)
        .replace(/\.(html?|php|aspx?)$/i, "")
        .replace(/[-_+]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : domain;
  return {
    url: url.href,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    domain,
  };
}

/** Best-effort fetch of a saved page's real title + favicon via the dev proxy. */
async function unfurl(url: string): Promise<{ title: string | null; favicon: string | null }> {
  try {
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { title: null, favicon: null };
    return (await res.json()) as { title: string | null; favicon: string | null };
  } catch {
    return { title: null, favicon: null };
  }
}

// Keep the card compact by default; long queues expand on demand.
const VISIBLE = 5;

export function ReadingQueue() {
  const [items, setItems] = useState<Item[]>(loadItems);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Backfill real titles/favicons one item at a time — covers freshly-added
  // items (which start with no `enriched` flag) and legacy items saved
  // before this existed, without bursting a dozen requests at once.
  useEffect(() => {
    const pending = items.find((i) => !i.enriched);
    if (!pending) return;
    let cancelled = false;
    unfurl(pending.url).then((meta) => {
      if (cancelled) return;
      setItems((all) =>
        all.map((i) =>
          i.id === pending.id
            ? { ...i, title: meta.title ?? i.title, favicon: meta.favicon ?? undefined, enriched: true }
            : i,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const parsed = describe(draft.trim());
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setItems((all) => [{ id: crypto.randomUUID(), ...parsed }, ...all]);
    setDraft("");
  };

  return (
    <Card
      title="Reading"
      icon={<BookIcon />}
      actions={items.length > 0 ? <span className="card__more">{items.length} saved</span> : undefined}
    >
      <form className="todo__input" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          placeholder="Paste a link to read later…"
          aria-label="Save a link"
          aria-invalid={invalid}
        />
      </form>
      {invalid && <div className="track__error">That doesn't look like a link.</div>}
      {items.length === 0 ? (
        <div className="empty">Links you save land here.</div>
      ) : (
        <ul className="todo__list">
          {(showAll ? items : items.slice(0, VISIBLE)).map((item) => (
            <li key={item.id} className="todo__item">
              <button
                className="todo__check"
                aria-label="Mark as read"
                title="Mark as read"
                onClick={() => setItems((all) => all.filter((i) => i.id !== item.id))}
              >
                <CheckIcon />
              </button>
              <a className="read__link" href={item.url} target="_blank" rel="noreferrer">
                <span className="read__icon">
                  {item.favicon ? (
                    <img
                      src={item.favicon}
                      alt=""
                      width={14}
                      height={14}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <BookIcon />
                  )}
                </span>
                <span className="read__title">{item.title}</span>
                <span className="read__domain">{item.domain}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {items.length > VISIBLE && (
        <button className="list__toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  );
}

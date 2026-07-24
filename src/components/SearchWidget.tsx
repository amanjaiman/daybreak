import type { FormEvent } from "react";
import { BiLogoBing } from "react-icons/bi";
import { BsOpenai } from "react-icons/bs";
import { FiSearch } from "react-icons/fi";
import { SiClaude, SiGoogle, SiPerplexity } from "react-icons/si";
import type { IconType } from "react-icons";
import { useSettings } from "../lib/settings";
import type { SearchProvider } from "../lib/settings";

type Provider = {
  id: SearchProvider;
  label: string;
  Icon: IconType;
  className: string;
  searchUrl: (query: string) => string;
};

const PROVIDERS: Provider[] = [
  {
    id: "google",
    label: "Google",
    Icon: SiGoogle,
    className: "is-google",
    searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    id: "bing",
    label: "Bing",
    Icon: BiLogoBing,
    className: "is-bing",
    searchUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  },
  {
    id: "perplexity",
    label: "Perplexity",
    Icon: SiPerplexity,
    className: "is-perplexity",
    searchUrl: (query) => `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    Icon: BsOpenai,
    className: "is-chatgpt",
    searchUrl: (query) => `https://chatgpt.com/?q=${encodeURIComponent(query)}&hints=search`,
  },
  {
    id: "claude",
    label: "Claude",
    Icon: SiClaude,
    className: "is-claude",
    searchUrl: (query) => `https://claude.ai/new?q=${encodeURIComponent(query)}`,
  },
];

export function SearchWidget() {
  const { settings, update } = useSettings();
  const provider = PROVIDERS.find((candidate) => candidate.id === settings.searchProvider) ?? PROVIDERS[0];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get("query") ?? "").trim();
    if (!query) return;

    window.open(provider.searchUrl(query), "_blank", "noopener,noreferrer");
  };

  // The active engine's logo is always shown; hovering or focusing the group
  // fans the rest out so another can be picked. Active-first ordering keeps the
  // visible logo in place as the others slide out beside it.
  const ordered = [provider, ...PROVIDERS.filter((p) => p.id !== provider.id)];

  return (
    <section className="search-widget" aria-label="Web search">
      <form className="search-widget__bar" role="search" onSubmit={submit}>
        <div className="search-widget__providers" role="group" aria-label="Search engine">
          {ordered.map(({ id, label, Icon, className }) => {
            const selected = id === provider.id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                aria-label={selected ? `Search engine: ${label}. Change it` : `Use ${label}`}
                title={label}
                className={
                  `search-widget__provider ${className}` + (selected ? " is-active" : " is-extra")
                }
                onClick={(e) => {
                  update({ searchProvider: id });
                  // Drop focus so the picker collapses back to just the pick
                  // (it reopens on the next hover or focus).
                  e.currentTarget.blur();
                }}
              >
                <Icon aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <label className="search-widget__field">
          <span className="visually-hidden">Search with {provider.label}</span>
          <input
            name="query"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder={`Search with ${provider.label}`}
          />
        </label>

        <button
          className="search-widget__submit"
          type="submit"
          aria-label={`Search with ${provider.label}`}
          title={`Search with ${provider.label}`}
        >
          <FiSearch aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

// Personal configuration — edit this file to make the dashboard yours.

export const config = {
  name: "Aman",

  location: {
    label: "San Francisco",
    latitude: 37.7749,
    longitude: -122.4194,
  },

  // News topics shown as tabs. `query` feeds the Hacker News search API.
  topics: [
    { id: "startups", label: "Startups", query: "startup OR YC OR funding" },
    { id: "ai", label: "AI", query: "AI OR LLM OR Anthropic OR OpenAI" },
  ],

  // NBA team for the sports card (ESPN team abbreviation).
  nbaTeam: { abbrev: "gs", name: "Warriors", espnId: "9" },

  // Initial performers for the Shows card (Bandsintown names). Only used to
  // seed the list on first run — after that, manage it from the card's Edit
  // button; changes are kept in localStorage.
  artists: ["Shreya Ghoshal", "Udit Narayan", "Arijit Singh", "Sonu Nigam"],

  // Max distance (miles) from a tracked city to count a show as "there".
  concertRadiusMiles: 150,

  // Stock watchlist (Yahoo Finance tickers).
  stocks: ["NVDA", "AAPL", "GOOGL", "MSFT"],

  // Soccer competitions to pull fixtures from (ESPN league slugs), in
  // priority order. The card shows upcoming matches across all of them.
  soccerLeagues: [
    { slug: "fifa.world", label: "World Cup" },
    { slug: "uefa.champions", label: "Champions League" },
    { slug: "conmebol.libertadores", label: "Copa Libertadores" },
    { slug: "eng.1", label: "Premier League" },
    { slug: "esp.1", label: "LaLiga" },
  ],
};

export type Config = typeof config;

// Netlify serverless equivalent of the Vite dev-server's /api/unfurl
// middleware (see vite.config.ts) — fetches a saved page's own HTML
// server-side to pull its real <title> and favicon for the Reading queue.
// No third-party unfurl service ever sees the saved URL. Kept standalone
// (no imports outside this directory) so Netlify's function bundler doesn't
// need to resolve paths beyond netlify/functions/.

type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractFavicon(html: string, pageUrl: string): string | null {
  const linkRe = /<link\b[^>]*>/gi;
  let best: { href: string; rank: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const rank = rel.includes("apple-touch") ? 1 : 2;
    if (!best || rank > best.rank) best = { href, rank };
  }
  try {
    return new URL(best?.href ?? "/favicon.ico", pageUrl).href;
  } catch {
    return null;
  }
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event: NetlifyEvent) => {
  const target = event.queryStringParameters?.url;
  let parsed: URL;
  try {
    if (!target) throw new Error("missing url");
    parsed = new URL(target);
  } catch {
    return json(400, {});
  }
  if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return json(400, {});
  }

  try {
    const upstream = await fetch(parsed.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; DaybreakBot/1.0)" },
    });
    const reader = upstream.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      while (html.length < 300_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? decodeEntities(titleMatch[1]).slice(0, 200) : null;
    const favicon = extractFavicon(html, upstream.url || parsed.href);
    return json(200, { title, favicon });
  } catch {
    return json(502, {});
  }
};

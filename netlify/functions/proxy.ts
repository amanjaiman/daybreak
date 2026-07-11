// General-purpose GET proxy for generated widgets: widget.getJSON(url)
// retries through here when a public API doesn't send CORS headers (the
// same reason Bandsintown/ESPN/Yahoo have dedicated rewrites). JSON only,
// capped response size, and the same private-host guard as unfurl.ts.
//
// Kept standalone (no imports outside this directory) so Netlify's function
// bundler doesn't need to resolve paths beyond netlify/functions/. The Vite
// dev server imports proxyJSON() from here for its /api/proxy middleware.

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

const MAX_BYTES = 1_000_000;

export type ProxyResult = { status: number; body: string };

/** Fetch `target` server-side and return its body (validated as JSON). */
export async function proxyJSON(target: string): Promise<ProxyResult> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { status: 400, body: JSON.stringify({ error: "Invalid url" }) };
  }
  if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return { status: 400, body: JSON.stringify({ error: "Blocked url" }) };
  }

  try {
    const upstream = await fetch(parsed.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; DaybreakBot/1.0)" },
    });
    const reader = upstream.body?.getReader();
    let text = "";
    if (reader) {
      const decoder = new TextDecoder();
      while (text.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }
    if (!upstream.ok) {
      return { status: 502, body: JSON.stringify({ error: `Upstream ${upstream.status}` }) };
    }
    JSON.parse(text); // only JSON passes through
    return { status: 200, body: text };
  } catch (err) {
    const message = err instanceof SyntaxError ? "Upstream response wasn't JSON" : "Upstream fetch failed";
    return { status: 502, body: JSON.stringify({ error: message }) };
  }
}

type NetlifyEvent = {
  queryStringParameters?: Record<string, string | undefined> | null;
};

export const handler = async (event: NetlifyEvent) => {
  const { status, body } = await proxyJSON(event.queryStringParameters?.url ?? "");
  return { statusCode: status, headers: { "content-type": "application/json" }, body };
};

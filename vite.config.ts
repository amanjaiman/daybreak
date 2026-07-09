import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  return false
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFavicon(html: string, pageUrl: string): string | null {
  const linkRe = /<link\b[^>]*>/gi
  let best: { href: string; rank: number } | null = null
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html))) {
    const tag = m[0]
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    if (!rel.includes('icon')) continue
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href) continue
    const rank = rel.includes('apple-touch') ? 1 : 2
    if (!best || rank > best.rank) best = { href, rank }
  }
  try {
    return new URL(best?.href ?? '/favicon.ico', pageUrl).href
  } catch {
    return null
  }
}

// Fetches a saved page's own HTML server-side (so no CORS issue) to pull its
// real <title> and favicon for the Reading queue. This talks directly to the
// site the user bookmarked — no third-party unfurl service sees the URL.
function unfurlPlugin(): Plugin {
  return {
    name: 'daybreak-unfurl',
    configureServer(server) {
      server.middlewares.use('/api/unfurl', async (req, res) => {
        const reqUrl = new URL(req.url ?? '', 'http://internal')
        const target = reqUrl.searchParams.get('url')
        let parsed: URL
        try {
          if (!target) throw new Error('missing url')
          parsed = new URL(target)
        } catch {
          res.statusCode = 400
          res.end('{}')
          return
        }
        if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
          res.statusCode = 400
          res.end('{}')
          return
        }
        try {
          const upstream = await fetch(parsed.href, {
            redirect: 'follow',
            signal: AbortSignal.timeout(6000),
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; DaybreakBot/1.0)' },
          })
          const reader = upstream.body?.getReader()
          let html = ''
          if (reader) {
            const decoder = new TextDecoder()
            while (html.length < 300_000) {
              const { done, value } = await reader.read()
              if (done) break
              html += decoder.decode(value, { stream: true })
            }
            reader.cancel().catch(() => {})
          }
          const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
          const title = titleMatch ? decodeEntities(titleMatch[1]).slice(0, 200) : null
          const favicon = extractFavicon(html, upstream.url || parsed.href)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ title, favicon }))
        } catch {
          res.statusCode = 502
          res.end('{}')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), unfurlPlugin()],
  server: {
    // Honor a PORT assigned by the environment (e.g. preview tooling).
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      // Bandsintown's REST API doesn't send CORS headers, so proxy it.
      '/api/bandsintown': {
        target: 'https://rest.bandsintown.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bandsintown/, ''),
      },
      // Some ESPN endpoints (e.g. /teams) lack CORS headers, so proxy them all.
      '/api/espn': {
        target: 'https://site.api.espn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/espn/, ''),
      },
      // Yahoo Finance has no CORS headers either.
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      },
    },
  },
})

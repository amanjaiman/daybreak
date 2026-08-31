import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  getWidgetGeneration,
  startWidgetGeneration,
  startWidgetReview,
} from './supabase/functions/_shared/generate.ts'
import type { GeneratedWidget } from './supabase/functions/_shared/generate.ts'
import { fetchWidgetData } from './supabase/functions/_shared/widget-data.ts'
import { proxyJSON } from './netlify/functions/proxy.ts'

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

// Dev-server twin of the Supabase generate-widget + widget-status edge
// functions: same background-generation core (so prompt/validation aren't
// duplicated), same async job shape (POST returns a job id; the client polls
// /api/widget-status), but backed by an in-memory job map instead of Postgres
// — so local dev needs only OPENAI_API_KEY, no Supabase. The key comes from
// .env (gitignored) or the shell environment.
type DevJob =
  | { status: 'pending'; responseId: string; prompt: string; stage: 'build' | 'review'; draft?: GeneratedWidget }
  | { status: 'done'; result: unknown }
  | { status: 'error'; error: string }

function generateWidgetPlugin(
  apiKey: string | undefined,
  opts: { model?: string; effort?: string },
  reviewOpts: { model?: string; effort?: string },
): Plugin {
  const jobs = new Map<string, DevJob>()
  return {
    name: 'daybreak-generate-widget',
    configureServer(server) {
      server.middlewares.use('/api/generate-widget', async (req, res) => {
        const respond = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return respond(405, { error: 'POST only' })
        if (!apiKey) {
          return respond(503, {
            error: "Widget generation isn't configured — set OPENAI_API_KEY in .env and restart the dev server.",
          })
        }
        let prompt: unknown
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          prompt = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { prompt?: unknown }).prompt
        } catch {
          return respond(400, { error: 'Invalid JSON body' })
        }
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) {
          return respond(400, { error: 'Describe the widget in 1-2000 characters.' })
        }
        let responseId: string
        try {
          responseId = await startWidgetGeneration(prompt.trim(), apiKey, opts)
        } catch (err) {
          return respond(502, {
            error: err instanceof Error ? err.message : 'Widget generation failed to start',
          })
        }
        const jobId = crypto.randomUUID()
        jobs.set(jobId, { status: 'pending', responseId, prompt: prompt.trim(), stage: 'build' })
        respond(202, { jobId })
      })

      server.middlewares.use('/api/widget-status', async (req, res) => {
        const respond = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (!apiKey) {
          return respond(503, { error: "Widget generation isn't configured (OPENAI_API_KEY is not set)." })
        }
        const id = new URL(req.url ?? '', 'http://internal').searchParams.get('id')
        if (!id) return respond(400, { error: 'Missing job id' })
        const job = jobs.get(id)
        if (!job) return respond(404, { error: 'Unknown job' })
        if (job.status === 'done') return respond(200, { status: 'done', widget: job.result })
        if (job.status === 'error') return respond(200, { status: 'error', error: job.error })
        let generation
        try {
          generation = await getWidgetGeneration(job.responseId, apiKey)
        } catch {
          return respond(503, { error: 'Generation status is temporarily unavailable.' })
        }
        if (generation.status === 'pending') return respond(200, { ...generation, stage: job.stage })
        if (generation.status === 'done' && job.stage === 'build') {
          try {
            const responseId = await startWidgetReview(job.prompt, generation.widget, apiKey, reviewOpts)
            jobs.set(id, {
              status: 'pending',
              responseId,
              prompt: job.prompt,
              stage: 'review',
              draft: generation.widget,
            })
            return respond(200, { status: 'pending', stage: 'review' })
          } catch {
            jobs.set(id, { status: 'done', result: generation.widget })
            return respond(200, { status: 'done', widget: generation.widget, reviewFallback: true })
          }
        }
        if (generation.status === 'done') {
          jobs.set(id, { status: 'done', result: generation.widget })
          return respond(200, { status: 'done', widget: generation.widget, reviewed: true })
        }
        if (job.stage === 'review' && job.draft) {
          jobs.set(id, { status: 'done', result: job.draft })
          return respond(200, { status: 'done', widget: job.draft, reviewFallback: true })
        }
        jobs.set(id, { status: 'error', error: generation.error })
        respond(200, generation)
      })
    },
  }
}

// Dev-server twins of the widget-data Supabase edge function and the Netlify
// proxy — runtime data plumbing for generated widgets (widget.ai and the CORS
// fallback inside widget.getJSON).
function widgetDataPlugin(apiKey: string | undefined, opts: { model?: string; effort?: string }): Plugin {
  return {
    name: 'daybreak-widget-data',
    configureServer(server) {
      server.middlewares.use('/api/widget-data', async (req, res) => {
        const respond = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return respond(405, { error: 'POST only' })
        if (!apiKey) return respond(503, { error: "Data lookups aren't configured (OPENAI_API_KEY is not set)." })
        let prompt: unknown
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          prompt = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { prompt?: unknown }).prompt
        } catch {
          return respond(400, { error: 'Invalid JSON body' })
        }
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {
          return respond(400, { error: 'Data request must be 1-4000 characters.' })
        }
        try {
          respond(200, { data: await fetchWidgetData(prompt.trim(), apiKey, opts) })
        } catch (err) {
          respond(502, { error: err instanceof Error ? err.message : 'Data lookup failed' })
        }
      })
      server.middlewares.use('/api/proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://internal').searchParams.get('url') ?? ''
        const { status, body } = await proxyJSON(target)
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.end(body)
      })
    },
  }
}

// The project's .env is authoritative for the OpenAI key in dev. loadEnv
// lets inherited shell variables win, and a stale OPENAI_API_KEY lingering
// in a terminal app's environment snapshot silently shadows the real key
// in .env (terminals only re-read the Windows environment when the app
// itself relaunches) — so read the file first and fall back to the shell.
function envFileValue(name: string): string | undefined {
  try {
    const text = readFileSync(new URL('./.env', import.meta.url), 'utf8')
    const m = text.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`, 'm'))
    const value = m?.[1].trim().replace(/^(["'])(.*)\1$/, '$2')
    return value || undefined
  } catch {
    return undefined
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openaiKey = envFileValue('OPENAI_API_KEY') ?? env.OPENAI_API_KEY
  const genOpts = { model: env.OPENAI_MODEL || undefined, effort: env.OPENAI_REASONING_EFFORT || undefined }
  const reviewOpts = {
    model: env.OPENAI_REVIEW_MODEL || env.OPENAI_MODEL || undefined,
    effort: env.OPENAI_REVIEW_REASONING_EFFORT || undefined,
  }
  const dataOpts = {
    model: env.OPENAI_DATA_MODEL || env.OPENAI_MODEL || undefined,
    effort: env.OPENAI_DATA_REASONING_EFFORT || undefined,
  }
  return {
    plugins: [
      react(),
      unfurlPlugin(),
      generateWidgetPlugin(openaiKey, genOpts, reviewOpts),
      widgetDataPlugin(openaiKey, dataOpts),
    ],
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
        // Google News RSS — general-interest topic headlines (XML, no CORS).
        '/api/gnews': {
          target: 'https://news.google.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gnews/, ''),
        },
        // iTunes Search API — podcast search + episodes (JSON, no CORS).
        '/api/itunes': {
          target: 'https://itunes.apple.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/itunes/, ''),
        },
      },
    },
  }
})

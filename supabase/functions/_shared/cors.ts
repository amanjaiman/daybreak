// Shared CORS headers for the widget edge functions. The Daybreak frontend
// (served from Netlify) calls these directly, so they must answer preflight
// and echo permissive CORS — the functions expose no user data of their own,
// only OpenAI-generated widgets keyed by an opaque job id.

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

/** JSON response with CORS headers attached. */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

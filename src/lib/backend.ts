// Where the widget backend lives. In production these are Supabase edge
// functions, called directly with the publishable key (public by design). In
// dev they're the Vite middleware twins at /api/* (see vite.config.ts), which
// run the same cores in-process — so local dev needs only OPENAI_API_KEY.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** URL for a backend function by name (dev: /api proxy, prod: Supabase). */
export function fnUrl(name: string): string {
  return import.meta.env.DEV ? `/api/${name}` : `${SUPABASE_URL}/functions/v1/${name}`;
}

/** Headers for a backend call — the publishable key in prod, nothing in dev. */
export function fnHeaders(): Record<string, string> {
  if (import.meta.env.DEV) return { "content-type": "application/json" };
  // The gateway routes on `apikey`; verify_jwt is off so no real JWT is needed.
  return { "content-type": "application/json", apikey: ANON_KEY ?? "", authorization: `Bearer ${ANON_KEY ?? ""}` };
}

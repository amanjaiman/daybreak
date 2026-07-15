/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxx.supabase.co (prod only). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable/anon key — public by design, used to call the widget functions. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

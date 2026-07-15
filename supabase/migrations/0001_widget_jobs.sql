-- Async "Generate Widget" jobs. The generate-widget edge function inserts a
-- pending row and fills it in (status done/error) from a background task; the
-- widget-status function reads it for the client's poll. Both use the service
-- role key, so RLS is left with NO policies: anon/authenticated callers get
-- nothing, and generation prompts + results never leak through the anon key.

create table if not exists public.widget_jobs (
  id         uuid primary key default gen_random_uuid(),
  prompt     text not null,
  status     text not null default 'pending' check (status in ('pending', 'done', 'error')),
  result     jsonb,
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists widget_jobs_created_at_idx on public.widget_jobs (created_at);

alter table public.widget_jobs enable row level security;

-- Optional housekeeping: finished jobs are only needed until the client has
-- polled them, so old rows are safe to prune. Run periodically (e.g. a
-- scheduled function or manual) — not required for correctness.
--   delete from public.widget_jobs where created_at < now() - interval '1 day';

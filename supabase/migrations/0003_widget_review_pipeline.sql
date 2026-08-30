-- Persist the multi-pass generation lifecycle. A validated build draft is
-- kept while a second background response reviews and improves it; if review
-- fails, widget-status can still publish the known-good draft.

alter table public.widget_jobs
  add column if not exists generation_stage text not null default 'build',
  add column if not exists stage_started_at timestamptz not null default now(),
  add column if not exists draft jsonb,
  add column if not exists review_error text;

alter table public.widget_jobs
  drop constraint if exists widget_jobs_generation_stage_check;

alter table public.widget_jobs
  add constraint widget_jobs_generation_stage_check
  check (generation_stage in ('build', 'review_starting', 'review'));

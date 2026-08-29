-- OpenAI owns long-running widget generation in background mode. Persist its
-- response id so any widget-status request can retrieve and finalize the job
-- without depending on one Edge Function worker staying alive.

alter table public.widget_jobs
  add column if not exists openai_response_id text;

create unique index if not exists widget_jobs_openai_response_id_idx
  on public.widget_jobs (openai_response_id)
  where openai_response_id is not null;

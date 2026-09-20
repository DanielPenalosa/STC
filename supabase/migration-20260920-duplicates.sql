-- =====================================================================
-- Migration: duplicate-report detection
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Adds:
--   1. report_photos.content_hash — hash of the uploaded photo so
--      identical re-uploads can be spotted across reports
--   2. reports.is_possible_duplicate — soft flag set by detection
--   3. report_duplicates — evidence rows linking a flagged report to
--      its suspected original, with per-signal scores
--   4. RLS for the new table (admins manage; staff/citizens read)
-- =====================================================================

-- 1. photo content hash ------------------------------------------------
alter table public.report_photos
  add column if not exists content_hash text;

create index if not exists report_photos_hash_idx
  on public.report_photos (content_hash)
  where content_hash is not null;

-- 2. flag on the report -------------------------------------------------
alter table public.reports
  add column if not exists is_possible_duplicate boolean not null default false;

create index if not exists reports_dup_flag_idx
  on public.reports (is_possible_duplicate)
  where is_possible_duplicate;

-- 3. evidence table -----------------------------------------------------
create table if not exists public.report_duplicates (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  similar_report_id uuid not null references public.reports(id) on delete cascade,
  signal text not null check (signal in ('photo', 'text', 'location', 'category')),
  score numeric not null check (score >= 0 and score <= 1),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (report_id, similar_report_id, signal)
);

create index if not exists report_duplicates_report_idx
  on public.report_duplicates (report_id);

-- 4. RLS ----------------------------------------------------------------
alter table public.report_duplicates enable row level security;

drop policy if exists "duplicates read" on public.report_duplicates;
create policy "duplicates read" on public.report_duplicates
  for select to authenticated using (true);

drop policy if exists "duplicates admin write" on public.report_duplicates;
create policy "duplicates admin write" on public.report_duplicates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- service role (used by the detection engine) bypasses RLS by design.

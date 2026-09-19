-- =====================================================================
-- Migration: duplicate-report detection
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Adds:
--   1. report_photos.content_hash — hash of the uploaded photo bytes
--      (SHA-256, computed client-side) so identical re-uploads can be
--      spotted across reports
--   2. reports.is_possible_duplicate — soft flag set by the detection
--      engine (never blocks submission; admins dismiss or merge)
--   3. report_duplicates — evidence rows explaining WHY two reports look
--      alike (photo match, text similarity, GPS proximity, category)
--   4. RLS: admins manage evidence; staff can read it for their reports
-- =====================================================================

-- 1. photo content hash ------------------------------------------------
alter table public.report_photos
  add column if not exists content_hash text;
create index if not exists report_photos_hash_idx
  on public.report_photos (content_hash)
  where content_hash is not null;

-- 2. soft flag on reports ----------------------------------------------
alter table public.reports
  add column if not exists is_possible_duplicate boolean not null default false;
create index if not exists reports_dup_idx
  on public.reports (is_possible_duplicate)
  where is_possible_duplicate;

-- 3. evidence table -----------------------------------------------------
create table if not exists public.report_duplicates (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  similar_report_id uuid not null references public.reports(id) on delete cascade,
  -- photo | text | location | category
  signal        text not null check (signal in ('photo','text','location','category')),
  score         double precision not null check (score between 0 and 1),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (report_id, similar_report_id, signal)
);
create index if not exists report_duplicates_report_idx
  on public.report_duplicates (report_id);

-- 4. RLS ----------------------------------------------------------------
alter table public.report_duplicates enable row level security;

drop policy if exists duplicates_admin_all on public.report_duplicates;
create policy duplicates_admin_all on public.report_duplicates for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- staff + citizens can read evidence for reports they can already see
drop policy if exists duplicates_read on public.report_duplicates;
create policy duplicates_read on public.report_duplicates for select
  to authenticated using (
    public.is_admin()
    or exists (select 1 from public.reports r where r.id = report_id)
  );

-- =====================================================================
-- Migration: ML image-similarity signal for duplicate detection
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- The pre-submission duplicate popup records an `ai_image` evidence row
-- (browser CLIP embedding similarity, computed on the citizen's device)
-- when a citizen is warned about a similar report and chooses to submit
-- anyway. This migration widens the report_duplicates.signal check
-- constraint to accept it. Nothing else changes.
-- =====================================================================

-- 1. drop the old constraint (named by the 20260920 migration or default)
alter table public.report_duplicates
  drop constraint if exists report_duplicates_signal_check;
alter table public.report_duplicates
  drop constraint if exists report_duplicates_signal_check1;

-- 2. re-create it with the new value
alter table public.report_duplicates
  add constraint report_duplicates_signal_check
  check (signal in ('photo', 'text', 'location', 'category', 'ai_image'));

-- 3. quick lookup for "show me the duplicates" queries
create index if not exists report_duplicates_similar_idx
  on public.report_duplicates (similar_report_id);

-- verify (should return the new value list):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.report_duplicates'::regclass
--     and contype = 'c';

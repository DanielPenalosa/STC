-- ============================================================
-- LIFECYCLE MIGRATION — BLOCK 1 of 3 (run this FIRST, alone)
-- Unblocks "Submit as Done" immediately.
-- Expected result: "Success. No rows returned"
-- ============================================================

alter table public.reports drop constraint if exists reports_status_check;

alter table public.reports add constraint reports_status_check
  check (status in (
    'submitted','under_review','verified','assigned',
    'in_progress','done','resolved','closed','rejected'
  ));

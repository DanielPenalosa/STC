-- =====================================================================
-- migration-20260925-resolved-at.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Adds:
--   1. reports.resolved_at (timestamptz) — stamped automatically when a
--      report transitions to 'resolved', cleared if it leaves that state
--   2. index on resolved_at desc (transparency feed + KPI ordering)
--   3. backfill for existing resolved reports from status_history
--      (falls back to updated_at when no history row exists)
--
-- Needed by the public transparency feed on the landing page and by the
-- staff "resolved last 7 days" KPI trend.
-- =====================================================================

-- 1. column + index ----------------------------------------------------
alter table public.reports add column if not exists resolved_at timestamptz;

create index if not exists reports_resolved_idx
  on public.reports (resolved_at desc);

-- 2. auto-stamp / auto-clear -------------------------------------------
create or replace function public.handle_report_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved' then
    new.resolved_at := coalesce(old.resolved_at, now());
  else
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_report_resolved on public.reports;
create trigger on_report_resolved
  before update of status on public.reports
  for each row execute function public.handle_report_resolved();

-- 3. backfill existing resolved reports --------------------------------
-- Only currently-resolved reports: duplicates are closed straight from
-- 'submitted' (never resolved), so 'closed' history must NOT count here.
update public.reports r
set resolved_at = coalesce(h.changed_at, r.updated_at)
from (
  select report_id, max(created_at) as changed_at
  from public.status_history
  where to_status = 'resolved'
  group by report_id
) h
where r.id = h.report_id
  and r.status = 'resolved'
  and r.resolved_at is null;

update public.reports r
set resolved_at = r.updated_at
where r.status = 'resolved'
  and r.resolved_at is null;

-- =====================================================================
-- END — verify with:
--   select count(*) from public.reports where status='resolved' and resolved_at is null;
--   -- expect 0
-- =====================================================================

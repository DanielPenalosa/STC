-- =====================================================================
-- Migration: AI-driven report leveling — photo decides, nothing else
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- The report's priority comes ONLY from the AI's analysis of the photo:
--   • reports.urgency_priority (new): the level the AI assigned
--     critical → 5 · high → 4 · medium → 3 · low → 2 · no verdict → NULL
--   • reports.priority = urgency_priority (defaults to 1 when none)
-- The old follower-count boost (2+ followers raise priority) is removed:
--   the recalc function now just re-applies the AI level, and its trigger
--   on report_follows is dropped. Community follows still send
--   notifications — they no longer touch urgency.
-- =====================================================================

-- 1. new column — NULL = no AI verdict yet
alter table public.reports add column if not exists urgency_priority smallint;

-- 2. priority = the AI's level, full stop
create or replace function public.recalc_report_priority(p_report uuid)
returns void language sql security definer set search_path = public as $$
  update public.reports
  set priority = coalesce(urgency_priority, 1)
  where id = p_report;
$$;

-- 3. remove the follower→priority boost
drop trigger if exists on_follow_change on public.report_follows;
drop function if exists public.handle_follow_change();

-- 4. backfill every existing report from its stored AI analysis
create or replace function public.backfill_urgency_priority()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reports r
  set urgency_priority = case a.urgency
        when 'critical' then 5
        when 'high'     then 4
        when 'medium'   then 3
        when 'low'      then 2
        else null end,
      priority = coalesce(
        case a.urgency
          when 'critical' then 5
          when 'high'     then 4
          when 'medium'   then 3
          when 'low'      then 2
          else null end,
        1)
  from public.ai_analysis a
  where a.report_id = r.id
    and a.urgency is not null;
end;
$$;
select public.backfill_urgency_priority();
drop function public.backfill_urgency_priority();

-- 5. make sure every report without an AI verdict sits at 1
create or replace function public.recalc_all_priorities()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_report_priority(id) from public.reports;
end;
$$;
select public.recalc_all_priorities();
drop function public.recalc_all_priorities();

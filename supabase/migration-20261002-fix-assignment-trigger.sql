-- =====================================================================
-- migration-20261002-fix-assignment-trigger.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- WHY THIS EXISTS — the auto-assignment bug:
--   migration-20260925-notifications-v3.sql installed
--   public.handle_report_assigned(), the AFTER INSERT trigger on
--   public.assignments that notifies the unit staff, admins and the
--   citizen. In the admins block it referenced `b.name`, but that query
--   only joins `d` (departments) and `br` (barangays) — alias `b` does
--   not exist there.
--
--   PL/pgSQL resolves aliases at first execution, so the migration ran
--   cleanly, but from then on EVERY insert into public.assignments raised
--     42P01: missing FROM-clause entry for table "b" — and Postgres rolled
--   the insert back. Result: the AI pipeline wrote its ai_analysis row,
--   then the assignment insert failed silently (console only), so no
--   report was ever auto-assigned and reports stayed "submitted".
--
-- THIS MIGRATION replaces the function with the corrected body (`br.name`)
-- and re-creates the trigger. No other behavior changes.
-- =====================================================================

create or replace function public.handle_report_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins int;
begin
  if new.report_id is null then
    return null;
  end if;

  -- how many admins exist? (skip the admin copy in empty-install demos)
  select count(*) into v_admins from public.users where role = 'admin';

  -- 2a. every staff account of the assigned unit
  if new.assigned_type = 'barangay' and new.barangay_id is not null then
    insert into public.notifications (user_id, report_id, title, body, type)
    select u.id, r.id,
           'New report assigned — ' || r.ref_code,
           '"' || r.title || '"' ||
             coalesce(' in Brgy. ' || b.name, '') ||
             ' was assigned to your barangay. Accept it to start working on it.',
           'assignment'
    from public.reports r
    join public.users u
      on u.role = 'barangay' and u.barangay_id = new.barangay_id
    left join public.barangays b on b.id = r.barangay_id
    where r.id = new.report_id
      and coalesce(u.is_active, true);
  elsif new.assigned_type = 'department' and new.department_id is not null then
    insert into public.notifications (user_id, report_id, title, body, type)
    select u.id, r.id,
           'New report assigned — ' || r.ref_code,
           '"' || r.title || '"' ||
             coalesce(' in Brgy. ' || b.name, '') ||
             ' was assigned to your department. Accept it to start working on it.',
           'assignment'
    from public.reports r
    join public.users u
      on u.role = 'department' and u.department_id = new.department_id
    left join public.barangays b on b.id = r.barangay_id
    where r.id = new.report_id
      and coalesce(u.is_active, true);
  end if;

  -- 2b. all admins: a report was routed
  --     the barangay alias in THIS query is `br` — this is the line that
  --     was wrong (`b.name`) and broke every assignment insert
  if v_admins > 0 then
    insert into public.notifications (user_id, report_id, title, body, type)
    select a.id, r.id,
           'Report auto-assigned — ' || r.ref_code,
           '"' || r.title || '"' ||
             coalesce(' in Brgy. ' || br.name, '') ||
             ' was routed to ' ||
             coalesce(d.name, br.name, 'a unit') || '.',
           'auto_assigned'
    from public.reports r
    cross join public.users a
    left join public.departments d on d.id = r.department_id
    left join public.barangays br on br.id = r.barangay_id
    where a.role = 'admin'
      and r.id = new.report_id;
  end if;

  -- 2c. the citizen: analyzed & routed confirmation
  insert into public.notifications (user_id, report_id, title, body, type)
  select c.id, r.id,
         'Report assigned — ' || r.ref_code,
         'Your report "' || r.title || '" was analyzed and routed to ' ||
           coalesce(d.name, br.name, 'the responsible unit') ||
           '. Track its progress from My Reports.',
         'status_change'
  from public.reports r
  join public.users c on c.id = r.user_id
  left join public.departments d on d.id = r.department_id
  left join public.barangays br on br.id = r.barangay_id
  where r.id = new.report_id;

  return null;
end;
$$;

drop trigger if exists on_assignment_created on public.assignments;
create trigger on_assignment_created
  after insert on public.assignments
  for each row execute function public.handle_report_assigned();

-- =====================================================================
-- END — verify with (the first SELECT must now return a row without
-- raising "missing FROM-clause entry for table b"):
--
--   -- 1. function body no longer references the wrong alias:
--   select prosrc like '%|| br.name%' as has_fixed_alias
--   from pg_proc where proname = 'handle_report_assigned';
--
--   -- 2. after re-routing a report (Admin → AI Assignments → Route now),
--   --    the assignment + its notifications appear:
--   select a.report_id, a.assigned_type, a.created_at
--   from public.assignments a order by a.created_at desc limit 5;
--
--   select type, title from public.notifications
--   where type in ('assignment','auto_assigned','status_change')
--   order by created_at desc limit 10;
-- =====================================================================

-- =====================================================================
-- migration-20260925-notifications-v3.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Completes realtime notification coverage for every role:
--   1. report created  → all admins (oversight) + the citizen
--                        (submission confirmation)
--   2. assignment (manual or AI) → all staff of the assigned unit, all
--      admins, and the citizen ("analyzed & routed" confirmation)
--   3. status change v3 → citizen, followers, verify-flow admins (as
--      before) PLUS all staff of the assigned unit for every transition
--      (accepted, in progress, done, resolved, rejected, sent back)
--
-- Existing flows already covered and kept: registration → admins,
-- completion → admin verification, revision → unit staff, followups and
-- feedback → admins.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. report created → admins + citizen confirmation
--    (replaces notify_admins_of_new_report which only covered admins)
-- ---------------------------------------------------------------------
create or replace function public.handle_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- all admins: new report needs oversight
  insert into public.notifications (user_id, report_id, title, body, type)
  select a.id, new.id,
         'New report submitted — ' || new.ref_code,
         '"' || new.title || '"' ||
           coalesce(' in Brgy. ' || b.name, '') ||
           ' was just submitted and is awaiting review.',
         'new_report'
  from public.users a
  left join public.barangays b on b.id = new.barangay_id
  where a.role = 'admin';

  -- the citizen: submission confirmation with the tracking ref
  insert into public.notifications (user_id, report_id, title, body, type)
  values (
    new.user_id, new.id,
    'Report submitted — ' || new.ref_code,
    'Your report "' || new.title || '" was received and is awaiting review. You will be notified as it progresses.',
    'status_change'
  );
  return new;
end;
$$;

drop trigger if exists on_report_created on public.reports;
create trigger on_report_created
  after insert on public.reports
  for each row execute function public.handle_report_created();

-- ---------------------------------------------------------------------
-- 2. assignment → unit staff + admins + citizen confirmation
--    Fires for AI auto-assignment (service role) AND manual admin
--    assignment alike — one source of truth for "work was routed".
-- ---------------------------------------------------------------------
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
  if v_admins > 0 then
    insert into public.notifications (user_id, report_id, title, body, type)
    select a.id, r.id,
           'Report auto-assigned — ' || r.ref_code,
           '"' || r.title || '"' ||
             coalesce(' in Brgy. ' || b.name, '') ||
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

-- ---------------------------------------------------------------------
-- 3. status change v3 — v2 behavior PLUS notifications to every staff
--    account of the assigned unit (department/barangay), so the unit
--    hears about in_progress, done, resolved, rejected and revision
--    requests on their reports. Citizen, followers and the admin
--    verification flow are unchanged.
-- ---------------------------------------------------------------------
create or replace function public.handle_report_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_unit  text;
begin
  if new.status is distinct from old.status then
    insert into public.status_history (report_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());

    v_label := case new.status
      when 'under_review' then 'Under Review'
      when 'verified'     then 'Verified'
      when 'assigned'     then 'Assigned'
      when 'in_progress'  then 'In Progress'
      when 'done'         then 'Pending Verification'
      when 'resolved'     then 'Resolved'
      when 'closed'       then 'Closed'
      when 'rejected'     then 'Rejected'
      else 'Submitted'
    end;

    v_unit := coalesce(
      (select name from public.departments where id = new.department_id),
      (select name from public.barangays  where id = new.barangay_id)
    );

    -- citizen is always told about their own report. The 'assigned'
    -- moment is owned by the assignment trigger (it sends a richer
    -- routing message) — skip here to avoid a duplicate notification.
    if new.status <> 'assigned' then
      insert into public.notifications (user_id, report_id, title, body, type)
      values (
        new.user_id, new.id,
        'Report ' || new.ref_code || ' — ' || v_label,
        case new.status
          when 'rejected' then 'Your report "' || new.title || '" was not accepted for action. Contact the municipal office for details.'
          when 'resolved' then 'Your report "' || new.title || '" has been resolved. Rate your experience!'
          when 'done'     then 'Work on "' || new.title || '" is complete and awaiting admin verification.'
          else 'Your report "' || new.title || '" status changed to ' || v_label || '.'
        end,
        'status_change'
      );
    end if;

    -- every staff account of the assigned unit follows all transitions
    -- (same 'assigned' guard — the assignment trigger announced routing)
    if (new.department_id is not null or new.barangay_id is not null)
       and new.status <> 'assigned' then
      insert into public.notifications (user_id, report_id, title, body, type)
      select u.id, new.id,
             'Report ' || new.ref_code || ' — ' || v_label,
             '"' || new.title || '" (' || coalesce(v_unit, 'your unit') || ') is now ' || v_label || '.',
             'status_change'
      from public.users u
      where coalesce(u.is_active, true)
        and (
          (new.department_id is not null
            and u.role = 'department' and u.department_id = new.department_id)
          or
          (new.barangay_id is not null
            and u.role = 'barangay' and u.barangay_id = new.barangay_id)
        );
    end if;

    -- dept submitted completion → admins must verify
    if new.status = 'done' then
      insert into public.notifications (user_id, report_id, title, body, type)
      select u.id, new.id,
             'Verification needed — ' || new.ref_code,
             'The department submitted a completion photo for "' || new.title || '". Review and approve or send back.',
             'verify'
      from public.users u where u.role = 'admin';
    end if;

    -- admin approved → notify followers too
    if new.status = 'resolved' then
      insert into public.notifications (user_id, report_id, title, body, type)
      select f.user_id, new.id,
             'Resolved — ' || new.ref_code,
             '"' || new.title || '" in your followed reports has been resolved.',
             'status_change'
      from public.report_follows f
      where f.report_id = new.id and f.user_id <> new.user_id;
    end if;

    -- admin sent it back → notify the assigned department's accounts
    if old.status = 'done' and new.status = 'in_progress'
       and new.department_id is not null then
      insert into public.notifications (user_id, report_id, title, body, type)
      select u.id, new.id,
             'Revision requested — ' || new.ref_code,
             'Admin sent "' || new.title || '" back for revision. Please review the remarks and resubmit.',
             'revision'
      from public.users u
      where u.role = 'department' and u.department_id = new.department_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. realtime publication (idempotent — the tables are usually already
--    members, in which case the ALTER would raise duplicate_object)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reports;
exception
  when duplicate_object then null;
end $$;

-- =====================================================================
-- END — sanity check (each should return its function name):
--   select proname from pg_proc where proname in
--     ('handle_report_created','handle_report_assigned',
--      'handle_report_status_change');
-- =====================================================================

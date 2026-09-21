-- ============================================================
-- LIFECYCLE MIGRATION — BLOCK 3 of 3 (run AFTER block 2 succeeds)
-- New tables + priority trigger + notification triggers.
-- Expected result: "Success. No rows returned"
-- ============================================================

-- ---------- report_follows ----------
create table if not exists public.report_follows (
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
alter table public.report_follows enable row level security;
drop policy if exists follows_select on public.report_follows;
create policy follows_select on public.report_follows for select to authenticated
  using (true);
drop policy if exists follows_insert on public.report_follows;
create policy follows_insert on public.report_follows for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists follows_delete on public.report_follows;
create policy follows_delete on public.report_follows for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- report_followups ----------
create table if not exists public.report_followups (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now()
);
alter table public.report_followups enable row level security;
drop policy if exists followups_select on public.report_followups;
create policy followups_select on public.report_followups for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );
drop policy if exists followups_insert on public.report_followups;
create policy followups_insert on public.report_followups for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- report_feedback ----------
create table if not exists public.report_feedback (
  report_id  uuid primary key references public.reports(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);
alter table public.report_feedback enable row level security;
drop policy if exists feedback_select on public.report_feedback;
create policy feedback_select on public.report_feedback for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );
drop policy if exists feedback_insert on public.report_feedback;
create policy feedback_insert on public.report_feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r
                where r.id = report_id and r.user_id = auth.uid()
                  and r.status = 'resolved')
  );

-- ---------- priority from follower count ----------
create or replace function public.recalc_report_priority(p_report uuid)
returns void language sql security definer set search_path = public as $$
  update public.reports set priority = coalesce((
    select case
      when count(*) >= 20 then 5
      when count(*) >= 10 then 4
      when count(*) >= 5  then 3
      when count(*) >= 2  then 2
      else 1
    end
    from public.report_follows where report_id = p_report
  ), 1)
  where id = p_report;
$$;

drop trigger if exists on_follow_change on public.report_follows;
create or replace function public.handle_follow_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_report_priority(coalesce(new.report_id, old.report_id));
  return null;
end;
$$;
create trigger on_follow_change
  after insert or delete on public.report_follows
  for each row execute function public.handle_follow_change();

-- ---------- status change → history + smart notifications ----------
create or replace function public.handle_report_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
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

    if new.status = 'done' then
      insert into public.notifications (user_id, report_id, title, body, type)
      select u.id, new.id,
             'Verification needed — ' || new.ref_code,
             'The department submitted a completion photo for "' || new.title || '". Review and approve or send back.',
             'verify'
      from public.users u where u.role = 'admin';
    end if;

    if new.status = 'resolved' then
      insert into public.notifications (user_id, report_id, title, body, type)
      select f.user_id, new.id,
             'Resolved — ' || new.ref_code,
             '"' || new.title || '" in your followed reports has been resolved.',
             'status_change'
      from public.report_follows f
      where f.report_id = new.id and f.user_id <> new.user_id;
    end if;

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

-- ---------- new report → notify all admins ----------
create or replace function public.notify_admins_of_new_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, report_id, title, body, type)
  select u.id, new.id,
         'New report — ' || new.ref_code,
         '"' || new.title || '" was just submitted and needs review.',
         'new_report'
  from public.users u where u.role = 'admin';
  return new;
end;
$$;
drop trigger if exists on_report_created on public.reports;
create trigger on_report_created
  after insert on public.reports
  for each row execute function public.notify_admins_of_new_report();

-- ---------- follow-up → notify all admins ----------
create or replace function public.notify_admins_of_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = new.report_id;
  insert into public.notifications (user_id, report_id, title, body, type)
  select u.id, v_report.id,
         'Follow-up — ' || v_report.ref_code,
         'The reporter added a follow-up on "' || v_report.title || '".',
         'followup'
  from public.users u where u.role = 'admin';
  return new;
end;
$$;
drop trigger if exists on_followup_created on public.report_followups;
create trigger on_followup_created
  after insert on public.report_followups
  for each row execute function public.notify_admins_of_followup();

-- ---------- feedback → notify all admins ----------
create or replace function public.notify_admins_of_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = new.report_id;
  insert into public.notifications (user_id, report_id, title, body, type)
  select u.id, v_report.id,
         'Feedback received — ' || v_report.ref_code,
         'The reporter rated "' || v_report.title || '" ' || new.rating || '/5.',
         'feedback'
  from public.users u where u.role = 'admin';
  return new;
end;
$$;
drop trigger if exists on_feedback_created on public.report_feedback;
create trigger on_feedback_created
  after insert on public.report_feedback
  for each row execute function public.notify_admins_of_feedback();

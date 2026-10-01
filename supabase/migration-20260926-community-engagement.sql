-- =============================================================================
-- migration-20260926-community-engagement.sql
-- Community engagement on RESOLVED reports:
--   1. report_likes      — one like per user per report (toggle)
--   2. report_comments   — open comment thread on resolved reports
--   3. report_feedback   — relax "reporter only" → any signed-in user
--   4. triggers          — reporter is notified of new likes/comments
--
-- Engagement is only possible on reports with status = 'resolved' (the same
-- set the Community feed shows). Reads mirror the parent report's visibility,
-- so anonymous reports stay protected everywhere.
--
-- Idempotent — safe to run again.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. report_likes — unique (report_id, user_id) so a user can't double-like
-- -----------------------------------------------------------------------------
create table if not exists public.report_likes (
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index if not exists report_likes_report_idx on public.report_likes (report_id);

alter table public.report_likes enable row level security;

-- likes are visible to everyone who can see the parent report
drop policy if exists likes_select on public.report_likes;
create policy likes_select on public.report_likes for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );

-- only on resolved reports, one's own like only
drop policy if exists likes_insert on public.report_likes;
create policy likes_insert on public.report_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r
                where r.id = report_id and r.status = 'resolved')
  );

drop policy if exists likes_delete on public.report_likes;
create policy likes_delete on public.report_likes for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. report_comments — open thread on resolved reports
-- -----------------------------------------------------------------------------
create table if not exists public.report_comments (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  message    text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists report_comments_report_idx
  on public.report_comments (report_id, created_at);

alter table public.report_comments enable row level security;

drop policy if exists comments_select on public.report_comments;
create policy comments_select on public.report_comments for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );

-- comment on resolved reports only; author matches the signed-in user
drop policy if exists comments_insert on public.report_comments;
create policy comments_insert on public.report_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r
                where r.id = report_id and r.status = 'resolved')
  );

-- users may delete their own comments; admins moderate
drop policy if exists comments_delete on public.report_comments;
create policy comments_delete on public.report_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. report_feedback — open rating to ANY signed-in user on resolved reports.
--    The old schema made report_id the primary key (one rating per report,
--    reporter-only). Now each user rates once per report, so the key becomes
--    (report_id, user_id). Existing rows are preserved.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'report_feedback_report_user_pkey'
      and conrelid = 'public.report_feedback'::regclass
  ) then
    -- drops the old single-column PK (and any FKs depending on it are none —
    -- nothing references report_feedback) then adds the composite key
    execute 'alter table public.report_feedback drop constraint if exists report_feedback_pkey';
    execute 'alter table public.report_feedback add constraint report_feedback_report_user_pkey primary key (report_id, user_id)';
  end if;
end;
$$;

-- reads: same visibility as the parent report (staff + admins now see ratings)
drop policy if exists feedback_select on public.report_feedback;
create policy feedback_select on public.report_feedback for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );

-- writes: any signed-in user, once per report, resolved only
-- (was: reporter-only with the same resolved gate)
drop policy if exists feedback_insert on public.report_feedback;
create policy feedback_insert on public.report_feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r
                where r.id = report_id and r.status = 'resolved')
  );

-- -----------------------------------------------------------------------------
-- 4. triggers — the reporter hears about likes / comments on their report
-- -----------------------------------------------------------------------------

-- like → notify the reporter (skip self-likes)
create or replace function public.notify_reporter_of_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = new.report_id;
  if v_report.user_id = new.user_id then
    return new; -- liking your own report isn't news
  end if;
  insert into public.notifications (user_id, report_id, title, body, type)
  values (
    v_report.user_id, v_report.id,
    'New like — ' || v_report.ref_code,
    'Someone liked your resolved report "' || v_report.title || '".',
    'like'
  );
  return new;
end;
$$;
drop trigger if exists on_like_created on public.report_likes;
create trigger on_like_created
  after insert on public.report_likes
  for each row execute function public.notify_reporter_of_like();

-- comment → notify the reporter (skip self-comments)
create or replace function public.notify_reporter_of_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id = new.report_id;
  if v_report.user_id <> new.user_id then
    insert into public.notifications (user_id, report_id, title, body, type)
    values (
      v_report.user_id, v_report.id,
      'New comment — ' || v_report.ref_code,
      'Someone commented on your resolved report "' || v_report.title || '".',
      'comment'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists on_comment_created on public.report_comments;
create trigger on_comment_created
  after insert on public.report_comments
  for each row execute function public.notify_reporter_of_comment();

-- feedback body text: no longer always "the reporter" — anyone can rate now.
-- (The existing on_feedback_created trigger keeps working; it just re-points
-- to this refreshed function.)
create or replace function public.notify_admins_of_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
  v_rater  text;
begin
  select * into v_report from public.reports where id = new.report_id;
  select coalesce(u.full_name, 'A community member') into v_rater
    from public.users u where u.id = new.user_id;
  insert into public.notifications (user_id, report_id, title, body, type)
  select u.id, v_report.id,
         'Feedback received — ' || v_report.ref_code,
         v_rater || ' rated "' || v_report.title || '" ' || new.rating || '/5.',
         'feedback'
  from public.users u where u.role = 'admin';
  return new;
end;
$$;
drop trigger if exists on_feedback_created on public.report_feedback;
create trigger on_feedback_created
  after insert on public.report_feedback
  for each row execute function public.notify_admins_of_feedback();

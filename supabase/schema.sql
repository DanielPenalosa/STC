-- =====================================================================
-- Smart Community Reporting System — Supabase schema
-- [CLIENT NAME] · [CITY/MUNICIPALITY]
--
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- Roles: citizen | admin | department | barangay
-- Status flow: submitted → under_review → verified → assigned →
--              in_progress → resolved → closed
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- roles (lookup; role also stored directly on users.role for RLS speed)
create table if not exists public.roles (
  id            text primary key,          -- 'citizen' | 'admin' | 'department' | 'barangay'
  label         text not null,
  description   text
);

insert into public.roles (id, label, description) values
  ('citizen',   'Citizen',     'Submits and tracks reports'),
  ('admin',     'Administrator','Full system oversight, AI review, configuration'),
  ('department','Department',  'Processes reports assigned to the department'),
  ('barangay',  'Barangay',    'Processes reports assigned to the barangay')
on conflict (id) do nothing;

-- barangays
create table if not exists public.barangays (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  description    text,
  captain_name   text,
  contact_number text,
  center_lat     double precision,
  center_lng     double precision,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- departments
create table if not exists public.departments (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  slug           text not null unique,
  description    text,
  head_name      text,
  contact_number text,
  color          text not null default '#2333A0',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- users (profile; extends auth.users)
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  phone         text,
  address       text,
  role          text not null default 'citizen'
                  references public.roles(id),
  department_id uuid references public.departments(id),
  barangay_id   uuid references public.barangays(id),
  -- citizen identity verification (valid government / local ID)
  id_photo_path    text,             -- storage: verification-ids bucket
  verification_status text not null default 'pending'
                    check (verification_status in ('pending','verified','rejected')),
  verified_at      timestamptz,
  verified_by      uuid references public.users(id),
  rejection_reason text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- categories
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  description text,
  color       text not null default '#64748b',
  icon        text not null default '📋',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- reports
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  ref_code      text unique not null default
                  'RPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  user_id       uuid not null references public.users(id) on delete cascade,
  category_id   uuid references public.categories(id),
  title         text not null,
  description   text not null default '',
  status        text not null default 'submitted'
                  check (status in ('submitted','under_review','verified','assigned','in_progress','resolved','closed')),
  priority      text not null default 'medium' check (priority in ('low','medium','high')),
  is_anonymous  boolean not null default false,
  barangay_id   uuid references public.barangays(id),
  department_id uuid references public.departments(id),
  latitude      double precision,
  longitude     double precision,
  address_text  text,
  is_possible_duplicate boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists reports_status_idx   on public.reports (status);
create index if not exists reports_user_idx     on public.reports (user_id);
create index if not exists reports_created_idx  on public.reports (created_at desc);
create index if not exists reports_category_idx on public.reports (category_id);
create index if not exists reports_brgy_idx     on public.reports (barangay_id);
create index if not exists reports_dept_idx     on public.reports (department_id);

-- report_photos (storage bucket: report-photos, path: <report_id>/<file>)
create table if not exists public.report_photos (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  kind         text not null default 'citizen' check (kind in ('citizen','resolution')),
  caption      text,
  content_hash text,
  created_at   timestamptz not null default now()
);
create index if not exists report_photos_hash_idx
  on public.report_photos (content_hash)
  where content_hash is not null;

-- assignments (to department or barangay; keep latest per report)
create table if not exists public.assignments (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  assigned_type text not null check (assigned_type in ('department','barangay')),
  department_id uuid references public.departments(id),
  barangay_id   uuid references public.barangays(id),
  assigned_by   uuid references public.users(id),
  note          text,
  accepted_at   timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint assignment_target check (
    (assigned_type = 'department' and department_id is not null) or
    (assigned_type = 'barangay'   and barangay_id   is not null)
  )
);
create index if not exists assignments_report_idx on public.assignments (report_id);

-- notifications
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  report_id  uuid references public.reports(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  type       text not null default 'status_change',
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- status_history
create table if not exists public.status_history (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references public.users(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists status_history_report_idx on public.status_history (report_id, created_at);

-- ai_analysis
create table if not exists public.ai_analysis (
  id                      uuid primary key default gen_random_uuid(),
  report_id               uuid references public.reports(id) on delete cascade,
  suggested_category_id   uuid references public.categories(id),
  suggested_department_id uuid references public.departments(id),
  suggested_barangay_id   uuid references public.barangays(id),
  detected_issue          text,
  confidence              double precision check (confidence between 0 and 1),
  model_used              text not null default 'vision-1',
  raw_response            jsonb not null default '{}'::jsonb,
  status                  text not null default 'pending'
                            check (status in ('pending','completed','low_confidence','reviewed','failed')),
  created_at              timestamptz not null default now()
);

-- report_duplicates (duplicate-report detection evidence)
create table if not exists public.report_duplicates (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  similar_report_id uuid not null references public.reports(id) on delete cascade,
  signal        text not null check (signal in ('photo','text','location','category')),
  score         double precision not null check (score between 0 and 1),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (report_id, similar_report_id, signal)
);
create index if not exists report_duplicates_report_idx
  on public.report_duplicates (report_id);

-- locations (reverse-geocoded place metadata per report)
create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  latitude     double precision not null,
  longitude    double precision not null,
  address_text text,
  place_id     text,
  created_at   timestamptz not null default now()
);

-- audit_logs
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- app_settings (client name, city, etc. — editable from admin Settings)
create table if not exists public.app_settings (
  key   text primary key,
  value text
);

insert into public.app_settings (key, value) values
  ('client_name', '[CLIENT NAME]'),
  ('city_name',   '[CITY/MUNICIPALITY]'),
  ('tagline',     'Smart Community Reporting System')
on conflict (key) do nothing;

-- =====================================================================
-- 2. HELPERS
-- =====================================================================

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','department','barangay') from public.users where id = auth.uid()), false);
$$;

-- staff member belongs to a report's assigned department
create or replace function public.in_assigned_department(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.role = 'department' and u.department_id = r.department_id
    from public.reports r join public.users u on u.id = auth.uid()
    where r.id = p_report
  ), false);
$$;

-- staff member belongs to a report's assigned barangay
create or replace function public.in_assigned_barangay(p_report uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.role = 'barangay' and u.barangay_id = r.barangay_id
    from public.reports r join public.users u on u.id = auth.uid()
    where r.id = p_report
  ), false);
$$;

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

alter table public.users          enable row level security;
alter table public.roles          enable row level security;
alter table public.categories     enable row level security;
alter table public.barangays      enable row level security;
alter table public.departments    enable row level security;
alter table public.reports        enable row level security;
alter table public.report_photos  enable row level security;
alter table public.assignments    enable row level security;
alter table public.notifications  enable row level security;
alter table public.status_history enable row level security;
alter table public.ai_analysis    enable row level security;
alter table public.locations      enable row level security;
alter table public.audit_logs     enable row level security;
alter table public.app_settings   enable row level security;

-- roles: any authenticated user can read; admin writes
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- users: read own; admin reads all; staff read users in their jurisdiction
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (role = 'citizen' and public.is_staff())
  );
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users for insert to authenticated
  with check (id = auth.uid() and role in ('citizen','department','barangay'));
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- categories: everyone reads, admin writes
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- barangays: everyone reads, admin writes
drop policy if exists barangays_read on public.barangays;
create policy barangays_read on public.barangays for select to authenticated using (true);
drop policy if exists barangays_admin on public.barangays;
create policy barangays_admin on public.barangays for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- departments: everyone reads, admin writes
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (true);
drop policy if exists departments_admin on public.departments;
create policy departments_admin on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- reports:
--   citizens: own reports only
--   admin: all
--   department: reports assigned to their department
--   barangay: reports assigned to their barangay
--   community view: citizens see non-anonymous public reports (Community Reports feed)
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.in_assigned_department(id)
    or public.in_assigned_barangay(id)
    or (not is_anonymous)          -- community feed
  );
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (
    user_id = auth.uid()           -- citizen may edit while still just submitted
    or public.is_admin()
    or public.in_assigned_department(id)
    or public.in_assigned_barangay(id)
  )
  with check (
    user_id = auth.uid()
    or public.is_admin()
    or public.in_assigned_department(id)
    or public.in_assigned_barangay(id)
  );
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'submitted'));

-- report_photos: follow the parent report's visibility
drop policy if exists photos_select on public.report_photos;
create policy photos_select on public.report_photos for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or not r.is_anonymous))
  );
drop policy if exists photos_insert on public.report_photos;
create policy photos_insert on public.report_photos for insert to authenticated
  with check (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)))
  );
drop policy if exists photos_delete on public.report_photos;
create policy photos_delete on public.report_photos for delete to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)))
  );

-- assignments: admin full; staff read/write for their assigned reports; citizen reads own
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)))
  );
drop policy if exists assignments_admin on public.assignments;
create policy assignments_admin on public.assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists assignments_staff_update on public.assignments;
create policy assignments_staff_update on public.assignments for update to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      public.in_assigned_department(r.id) or public.in_assigned_barangay(r.id)))
  )
  with check (
    exists (select 1 from public.reports r where r.id = report_id and (
      public.in_assigned_department(r.id) or public.in_assigned_barangay(r.id)))
  );

-- notifications: strictly per-user; citizens/staff delete their own
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- status_history: read follows report; writes by admin/staff
drop policy if exists history_select on public.status_history;
create policy history_select on public.status_history for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or not r.is_anonymous))
  );
drop policy if exists history_insert on public.status_history;
create policy history_insert on public.status_history for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.reports r where r.id = report_id and (
      public.in_assigned_department(r.id) or public.in_assigned_barangay(r.id)))
  );

-- ai_analysis: admin full; staff read when report assigned to them; citizen reads own report's analysis
drop policy if exists ai_select on public.ai_analysis;
create policy ai_select on public.ai_analysis for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)))
  );
drop policy if exists ai_admin on public.ai_analysis;
create policy ai_admin on public.ai_analysis for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- locations: follow report visibility; insert by owner/admin
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or not r.is_anonymous))
  );
drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations for insert to authenticated
  with check (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()))
  );

-- audit_logs: admin only
drop policy if exists audit_admin on public.audit_logs;
create policy audit_admin on public.audit_logs for select to authenticated
  using (public.is_admin());

-- app_settings: everyone reads, admin writes
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- 4. TRIGGERS: new user → profile, status changes → history + notifications
-- =====================================================================

-- auto-create profile on signup. Default role is 'citizen'.
-- The ADMIN PANEL creates staff accounts through the service-role API and
-- passes the intended role in user_metadata; public signup cannot set
-- metadata roles (Supabase strips/ignores them server-side), so this is safe.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  v_role := new.raw_user_meta_data->>'role';
  if v_role not in ('citizen','admin','department','barangay') then
    v_role := 'citizen';
  end if;

  insert into public.users (id, email, full_name, phone, role, department_id, barangay_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    nullif(new.raw_user_meta_data->>'phone', ''),
    v_role,
    (new.raw_user_meta_data->>'department_id')::uuid,
    (new.raw_user_meta_data->>'barangay_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- new citizen registration → notify every admin for approval
create or replace function public.notify_admins_of_registration() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'citizen' then
    insert into public.notifications (user_id, report_id, title, body, type)
    select a.id, null,
           'New registration awaiting approval',
           coalesce(new.full_name, 'A new citizen') || ' registered and submitted an ID for verification.',
           'registration'
    from public.users a
    where a.role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists on_user_registered on public.users;
create trigger on_user_registered
  after insert on public.users
  for each row execute function public.notify_admins_of_registration();

-- =====================================================================
-- 4b. ID VERIFICATION PROTECTION
-- =====================================================================

-- citizens cannot self-verify, self-reject or edit their submitted ID data;
-- only admins may change verification columns
create or replace function public.protect_verification_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    new.verification_status := old.verification_status;
    new.verified_at         := old.verified_at;
    new.verified_by         := old.verified_by;
    new.rejection_reason    := old.rejection_reason;
  end if;
  -- citizens may replace their ID photo only while not yet verified
  if not public.is_admin() and old.verification_status = 'verified' then
    new.id_photo_path := old.id_photo_path;
  end if;
  return new;
end;
$$;

drop trigger if exists on_users_protect_verification on public.users;
drop trigger if exists on_users_verification_guard on public.users;
create trigger on_users_verification_guard
  before update on public.users
  for each row execute function public.protect_verification_columns();

-- status change → status_history + notification to the citizen
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
      when 'resolved'     then 'Resolved'
      when 'closed'       then 'Closed'
      else 'Submitted'
    end;

    insert into public.notifications (user_id, report_id, title, body, type)
    values (
      new.user_id,
      new.id,
      'Report ' || new.ref_code || ' — ' || v_label,
      'Your report "' || new.title || '" status changed to ' || v_label || '.',
      'status_change'
    );
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_report_status_change on public.reports;
create trigger on_report_status_change
  before update on public.reports
  for each row execute function public.handle_report_status_change();

-- =====================================================================
-- 6b. STORAGE — private bucket for verification ID photos (admin-only read)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('verification-ids', 'verification-ids', false)
on conflict (id) do update set public = false;

drop policy if exists "verification-ids admin read" on storage.objects;
create policy "verification-ids admin read" on storage.objects for select to authenticated
  using (bucket_id = 'verification-ids' and public.is_admin());

drop policy if exists "verification-ids owner insert" on storage.objects;
create policy "verification-ids owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-ids' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "verification-ids owner delete" on storage.objects;
create policy "verification-ids owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'verification-ids' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 7. SEED DATA — placeholder barangays & departments (rename later)
-- =====================================================================

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.reports;

-- =====================================================================
-- 6. STORAGE — bucket "report-photos" with RLS mirroring table rules
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "report-photos read" on storage.objects;
create policy "report-photos read" on storage.objects for select to authenticated
  using (bucket_id = 'report-photos');

drop policy if exists "report-photos insert" on storage.objects;
create policy "report-photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos');

drop policy if exists "report-photos delete" on storage.objects;
create policy "report-photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos');

-- =====================================================================
-- 7. SEED DATA — placeholder barangays & departments (rename later)
-- =====================================================================

insert into public.categories (name, slug, description, color, icon) values
  ('Infrastructure',            'infrastructure',      'Roads, bridges, drainage, sidewalks', '#F5E606', '🚧'),
  ('Water & Sanitation',        'water-sanitation',    'Leaks, flooding, sewage, garbage drainage', '#06ABEA', '💧'),
  ('Electricity & Utilities',   'electricity-utilities','Streetlights, power lines, outages', '#2333A0', '💡'),
  ('Environment',               'environment',         'Trees, pollution, illegal dumping', '#2E8254', '🌿'),
  ('Public Safety',             'public-safety',       'Hazards, unsafe structures, emergencies', '#DF1B2C', '🛡️'),
  ('Public Facilities',         'public-facilities',   'Parks, courts, community centers', '#5c6cc9', '🏛️'),
  ('Other',                     'other',               'Anything that does not fit above', '#64748b', '📋')
on conflict (slug) do nothing;

insert into public.departments (name, slug, description, color) values
  ('[DEPARTMENT] Engineering Office',      'engineering',      'Roads, infrastructure and public works', '#F5E606'),
  ('[DEPARTMENT] Water & Sanitation Office','water-sanitation', 'Water systems and sanitation services',  '#06ABEA'),
  ('[DEPARTMENT] Utilities Office',        'utilities',        'Electricity and utility coordination',   '#2333A0'),
  ('[DEPARTMENT] Environment Office',      'environment',      'Environmental protection and cleanliness','#2E8254'),
  ('[DEPARTMENT] Public Safety Office',    'public-safety',    'Safety, hazards and emergency response', '#DF1B2C')
on conflict (slug) do nothing;

insert into public.barangays (name) values
  ('[BARANGAY 1]'), ('[BARANGAY 2]'), ('[BARANGAY 3]'),
  ('[BARANGAY 4]'), ('[BARANGAY 5]')
on conflict (name) do nothing;

-- Seed barangay centers so GPS detection works out of the box.
-- ADMIN ACTION after go-live: set the real lat/lng of every barangay in
-- Admin → Barangays (Center latitude / Center longitude), then delete this
-- block's rows or simply update them.
update public.barangays b
set center_lat = s.center_lat,
    center_lng = s.center_lng
from (
  select name,
         14.428 + (row_number() over (order by name)) * 0.004 as center_lat,
        121.410 + (row_number() over (order by name)) * 0.004 as center_lng
  from public.barangays
  where center_lat is null and name like '[BARANGAY%'
) s
where b.name = s.name;

-- =====================================================================
-- Done. Sign up the first user, then promote them:
--   update public.users set role = 'admin' where id = '<uuid>';
--   update public.users set verification_status = 'verified', verified_at = now()
--     where role <> 'citizen';
-- =====================================================================

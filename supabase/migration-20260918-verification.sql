-- =====================================================================
-- Migration: citizen ID verification + GPS barangay detection support
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- For FRESH installs, just run supabase/schema.sql (already includes all
-- of this). Use this file only for databases created before this feature.
-- =====================================================================

-- 1. users: verification columns --------------------------------------
alter table public.users add column if not exists email text;
alter table public.users add column if not exists id_photo_path text;
alter table public.users add column if not exists verification_status text
  not null default 'pending'
  check (verification_status in ('pending','verified','rejected'));
alter table public.users add column if not exists verified_at timestamptz;
alter table public.users add column if not exists verified_by uuid references public.users(id);
alter table public.users add column if not exists rejection_reason text;

-- drop the old ID-type/number columns if this migration replaces them
alter table public.users drop column if exists id_type;
alter table public.users drop column if exists id_number;

-- backfill emails for existing accounts
update public.users u
set email = a.email
from auth.users a
where u.id = a.id and u.email is null;

-- 2. lock verification columns against self-service edits --------------
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

-- 3. private storage bucket for ID photos ------------------------------
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

-- 4. seed placeholder barangay centers (so GPS detection works) --------
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

-- staff & admin accounts are trusted by default
update public.users set verification_status = 'verified', verified_at = now()
where role <> 'citizen' and verification_status = 'pending';

-- 5. new citizen registration → notify every admin for approval ---------
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

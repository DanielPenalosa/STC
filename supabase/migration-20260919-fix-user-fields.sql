-- =====================================================================
-- Migration: fix user registration field mapping (email / phone / name)
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Problem: databases created before the current schema ran an older
-- handle_new_user trigger that did not copy email, phone and full_name
-- from the auth signup metadata. Symptoms:
--   * users.email NULL even though the citizen entered an email
--   * users.phone NULL
--   * full_name fell back to the email address
--
-- This migration:
--   1. Replaces the trigger with the correct metadata-reading version
--   2. Backfills existing rows FROM auth.users (never overwrites valid data)
-- =====================================================================

-- 1. correct trigger (identical to schema.sql) --------------------------
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

-- 2. backfill email from the auth account -------------------------------
update public.users u
set email = a.email
from auth.users a
where u.id = a.id
  and a.email is not null
  and (u.email is null or u.email = '');

-- 3. backfill phone from the signup metadata ----------------------------
-- Only fills NULL/empty phones — never touches a real stored number.
update public.users u
set phone = nullif(a.raw_user_meta_data->>'phone', '')
from auth.users a
where u.id = a.id
  and nullif(a.raw_user_meta_data->>'phone', '') is not null
  and (u.phone is null or u.phone = '');

-- 4. repair full_name where it is clearly a fallback --------------------
-- Overwrites ONLY when the stored "name" is the email itself or the email
-- prefix (e.g. "danpnlsa013@gmail.com" or "danpnlsa013") AND a real name
-- exists in the signup metadata. Real names are left untouched.
update public.users u
set full_name = a.raw_user_meta_data->>'full_name'
from auth.users a
where u.id = a.id
  and nullif(a.raw_user_meta_data->>'full_name', '') is not null
  and (
    lower(u.full_name) = lower(a.email)
    or lower(u.full_name) = lower(split_part(a.email, '@', 1))
  );

-- 5. last resort: name never captured anywhere — use the email prefix
-- so the admin list never shows a blank name (email fallback is better
-- than an empty string, and still not a valid-data overwrite)
update public.users u
set full_name = split_part(a.email, '@', 1)
from auth.users a
where u.id = a.id
  and u.email is not null
  and (u.full_name is null or u.full_name = '');

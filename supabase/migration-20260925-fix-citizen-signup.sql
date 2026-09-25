-- =====================================================================
-- migration-20260925-fix-citizen-signup.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Fixes public citizen registration failing with
-- "Database error saving new user" (HTTP 500 on /auth/v1/signup).
--
-- Root cause: handle_new_user read the role with
--     v_role := new.raw_user_meta_data->>'role';
--     if v_role not in ('citizen',...) then v_role := 'citizen';
-- Public signup metadata contains NO role key, so v_role was NULL, and
-- "NULL not in (...)" evaluates to NULL — the fallback never fired. The
-- insert then wrote NULL into the NOT NULL users.role column, the trigger
-- threw, and Supabase surfaced the generic 500. Staff accounts worked
-- because admin-created metadata always includes a role.
--
-- Fix: coalesce the metadata role to 'citizen' BEFORE the validity check.
-- =====================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  -- coalesce first: public signup sends NO role key, and
  -- "null not in (...)" evaluates to null, which would skip the fallback
  -- and crash the insert on the NOT NULL role column
  v_role := coalesce(new.raw_user_meta_data->>'role', 'citizen');
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
    -- nullif is essential: admin-created staff accounts carry "" for the
    -- id that doesn't apply, and ''::uuid throws (breaking account creation)
    nullif(new.raw_user_meta_data->>'department_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'barangay_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- END — verify by registering a citizen through the app; the profile row
-- should appear immediately:
--   select email, role from public.users order by created_at desc limit 1;
-- =====================================================================

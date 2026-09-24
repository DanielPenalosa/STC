-- =====================================================================
-- Migration: fix staff-account creation ("Database error creating new user")
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Root cause: the handle_new_user trigger cast the metadata ids directly:
--     (raw_user_meta_data->>'barangay_id')::uuid
-- Admin-created staff accounts carry "" (empty string) for the id that
-- doesn't apply, and ''::uuid throws → the whole auth signup fails.
-- Citizens never hit it because their metadata omits the keys entirely.
-- Fix: nullif(...) — empty strings become NULL before the cast.
-- =====================================================================

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
    -- nullif is essential: admin-created staff accounts carry "" for the
    -- id that doesn't apply, and ''::uuid throws (breaking account creation)
    nullif(new.raw_user_meta_data->>'department_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'barangay_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

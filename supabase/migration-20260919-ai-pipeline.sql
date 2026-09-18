-- =====================================================================
-- Migration: AI pipeline support (photo classification + ID verification)
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Adds:
--   1. categories.default_department_id  — configurable category →
--      department mapping used by the AI auto-assignment
--   2. users.id_verification_status / id_verification — AI ID-check
--      results (extracted fields, confidence, reasons)
--   3. service-role escape in the verification guard trigger so the
--      server-side AI pipeline can auto-approve verified IDs
-- =====================================================================

-- 1. category → department mapping (admin-editable) --------------------
alter table public.categories
  add column if not exists default_department_id uuid references public.departments(id);

-- 2. AI ID verification columns ----------------------------------------
alter table public.users add column if not exists id_verification_status text
  default 'not_run'
  check (id_verification_status in ('not_run','processing','passed','needs_review','failed'));
alter table public.users add column if not exists id_verification jsonb;
alter table public.users add column if not exists id_verified_at timestamptz;

-- 3. guard trigger: allow the service role (AI pipeline) through --------
-- The existing trigger blocks any non-admin edit of verification columns;
-- the AI pipeline runs with the service-role key (auth.uid() is null),
-- so recognize Supabase's service-role JWT claim and let it pass.
create or replace function public.protect_verification_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'role', ''
  );
  if jwt_role = 'service_role' then
    return new; -- AI pipeline / trusted server jobs
  end if;

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

-- 4. keep existing schema.sql in sync hint (fresh installs use schema.sql)
-- No further changes needed here for storage/RLS — the verification-ids
-- bucket policies from migration-20260918 already apply.

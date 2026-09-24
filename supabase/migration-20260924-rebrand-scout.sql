-- =====================================================================
-- Migration: rebrand to SCOUT
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Updates the app_settings branding rows so the whole UI shows:
--   SCOUT — Sta. Cruz Community Observation and Unified Triage
-- Only overwrites rows that still contain the old [PLACEHOLDER] values,
-- so custom branding entered by an admin is never clobbered.
-- =====================================================================

insert into public.app_settings (key, value) values
  ('client_name', 'SCOUT'),
  ('city_name',   'Sta. Cruz, Laguna'),
  ('tagline',     'Sta. Cruz Community Observation and Unified Triage')
on conflict (key) do update set value = excluded.value
  where public.app_settings.value like '[%]';

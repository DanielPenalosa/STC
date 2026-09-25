-- =====================================================================
-- migration-20260925-department-names.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Strips the leftover "[DEPARTMENT] " template prefix from seeded
-- department names (shows on the public transparency feed and across
-- the dashboard). Slugs and colors are untouched.
-- =====================================================================

update public.departments
set name = trim(replace(name, '[DEPARTMENT] ', ''))
where name like '[DEPARTMENT] %';

-- =====================================================================
-- END — verify with:
--   select name from public.departments order by name;
--   -- expect no names starting with "[DEPARTMENT]"
-- =====================================================================

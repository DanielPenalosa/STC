-- =====================================================================
-- verify-ai-pipeline.sql — pre-flight check for the AI submit flow
-- Paste the WHOLE file into the Supabase SQL editor and press Run.
-- READ-ONLY — changes nothing.
--
-- One query, ONE result grid:
--   • 0 rows returned  → database is ready, run nothing
--   • any row printed  → run the migration named in that row
-- =====================================================================

with missing as (

  -- 1. ai_analysis columns (migration-20260921-local-ai.sql)
  select 'MISSING ai_analysis column "' || name || '" — run supabase/migration-20260921-local-ai.sql' as action
  from (values
    ('urgency'), ('reason'), ('handling_level'), ('auto_assigned'),
    ('admin_decision'), ('decided_by'), ('decided_at')
  ) as c(name)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_analysis'
      and column_name = c.name
  )

  union all

  -- 2. categories routing columns (20260919-ai-pipeline + 20260921-local-ai)
  select 'MISSING categories column "' || name || '" — run supabase/migration-20260919-ai-pipeline.sql' as action
  from (values ('default_department_id'), ('handling_level')) as c(name)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categories'
      and column_name = c.name
  )

  union all

  -- 3. duplicate-detection schema (migration-20260920-duplicates.sql)
  select 'MISSING reports.is_possible_duplicate — run supabase/migration-20260920-duplicates.sql' as action
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports'
      and column_name = 'is_possible_duplicate'
  )

  union all

  select 'MISSING report_photos.content_hash — run supabase/migration-20260920-duplicates.sql' as action
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_photos'
      and column_name = 'content_hash'
  )

  union all

  select 'MISSING TABLE report_duplicates — run supabase/migration-20260920-duplicates.sql' as action
  where to_regclass('public.report_duplicates') is null

  union all

  -- 4. base tables (supabase/schema.sql)
  select 'MISSING TABLE "' || name || '" — run supabase/schema.sql' as action
  from (values
    ('ai_analysis'), ('assignments'), ('notifications'), ('status_history')
  ) as t(name)
  where to_regclass('public.' || name) is null

  union all

  -- 5. lifecycle v2 — reports.status values (migration-20260921-lifecycle.sql)
  select 'reports.status check is missing ''done''/''rejected'' — run supabase/migration-20260921-lifecycle.sql' as action
  where exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.reports')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) not ilike '%done%'
  )

  union all

  -- 6. staff visibility policies (migration-20260921-staff-scope.sql)
  select 'MISSING POLICY "' || policy || '" on ' || tbl || ' — run supabase/migration-20260921-staff-scope.sql' as action
  from (values
    ('reports', 'reports_select'),
    ('report_photos', 'photos_select'),
    ('status_history', 'history_select')
  ) as r(tbl, policy)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = r.tbl and policyname = r.policy
  )

)
select action as "run this to fix"
from missing
order by action;

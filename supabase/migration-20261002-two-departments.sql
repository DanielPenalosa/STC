-- =====================================================================
-- migration-20261002-two-departments.sql
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- The system supports exactly TWO departments:
--   1. Engineering Office  (slug: engineering) — roads & infrastructure
--   2. Municipal Environment and Natural Resources Officer (MENRO)
--      (slug: menro) — the DEFAULT department: everything that is not
--      Engineering's domain routes here.
--
-- What this does:
--   1. renames the old "Environment Office" row into MENRO (keeps its id,
--      so existing references survive)
--   2. makes sure both departments exist (fresh/partial databases)
--   3. repoints categories / reports / assignments / users / ai_analysis
--      rows that referenced ANY other department to MENRO
--   4. sets the AI-routing default per category:
--        infrastructure        → Engineering Office
--        every other category  → MENRO (the default department)
--   5. deletes every other department
-- =====================================================================

-- 1. rename "Environment Office" into MENRO (keeps id + color) ----------
update public.departments
set name  = 'Municipal Environment and Natural Resources Officer (MENRO)',
    slug  = 'menro',
    description = 'Environmental protection, sanitation, waste management and natural resources'
where slug = 'environment';

-- 2. make sure both keepers exist ---------------------------------------
insert into public.departments (name, slug, description, color)
select 'Engineering Office', 'engineering',
       'Roads, infrastructure and public works', '#F5E606'
where not exists (select 1 from public.departments where slug = 'engineering');

insert into public.departments (name, slug, description, color)
select 'Municipal Environment and Natural Resources Officer (MENRO)', 'menro',
       'Environmental protection, sanitation, waste management and natural resources',
       '#2E8254'
where not exists (select 1 from public.departments where slug = 'menro');

-- 3. repoint references from removed departments to MENRO ----------------
--    (MENRO is the default department — anything that pointed at a
--     removed office now belongs to it)

update public.categories c
set default_department_id = (select id from public.departments where slug = 'menro')
where c.default_department_id in (
  select id from public.departments where slug not in ('engineering', 'menro')
);

update public.reports r
set department_id = (select id from public.departments where slug = 'menro')
where r.department_id in (
  select id from public.departments where slug not in ('engineering', 'menro')
);

update public.assignments a
set department_id = (select id from public.departments where slug = 'menro')
where a.department_id in (
  select id from public.departments where slug not in ('engineering', 'menro')
);

update public.users u
set department_id = (select id from public.departments where slug = 'menro')
where u.department_id in (
  select id from public.departments where slug not in ('engineering', 'menro')
);

update public.ai_analysis ai
set suggested_department_id = (select id from public.departments where slug = 'menro')
where ai.suggested_department_id in (
  select id from public.departments where slug not in ('engineering', 'menro')
);

-- 4. category → department routing defaults ------------------------------
--    infrastructure → Engineering Office; everything else → MENRO
update public.categories c
set default_department_id = (select id from public.departments where slug = 'engineering')
where c.slug = 'infrastructure';

update public.categories c
set default_department_id = (select id from public.departments where slug = 'menro')
where c.slug <> 'infrastructure'
  and (c.default_department_id is null
       or c.default_department_id not in (
         select id from public.departments where slug in ('engineering', 'menro')
       ));

-- 5. delete every other department (references are already repointed) ----
delete from public.departments
where slug not in ('engineering', 'menro');

-- =====================================================================
-- END — verify with:
--   select name, slug from public.departments order by name;
--   -- expect exactly:
--   --   Engineering Office                                        | engineering
--   --   Municipal Environment and Natural Resources Officer (MENRO) | menro
--
--   select slug, (select name from public.departments d where d.id = c.default_department_id)
--   from public.categories c order by slug;
--   -- expect infrastructure → Engineering Office, all others → MENRO
-- =====================================================================

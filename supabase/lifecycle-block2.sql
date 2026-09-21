-- ============================================================
-- LIFECYCLE MIGRATION — BLOCK 2 of 3 (run AFTER block 1 succeeds)
-- Priority → numeric 1..5. Handles both fresh and half-migrated states.
-- Expected result: "Success. No rows returned"
-- ============================================================

-- drop the OLD text-values constraint (whatever name it has)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%priority%'
      and pg_get_constraintdef(oid) ilike $q$%'low'%$q$
  loop
    execute format('alter table public.reports drop constraint %I', c);
  end loop;
end $$;

alter table public.reports alter column priority drop default;

-- convert ONLY if still text (safe on re-run)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports'
      and column_name = 'priority' and data_type = 'text'
  ) then
    execute $sql$
      alter table public.reports alter column priority type smallint
      using case priority
        when 'low'::text then 2
        when 'medium'::text then 3
        when 'high'::text then 4
        else 5
      end
    $sql$;
  end if;
end $$;

alter table public.reports alter column priority set default 1;

alter table public.reports drop constraint if exists reports_priority_check;
alter table public.reports add constraint reports_priority_check
  check (priority between 1 and 5);

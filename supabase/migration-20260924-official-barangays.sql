-- =====================================================================
-- Migration: seed the 26 official barangays of Sta. Cruz, Laguna
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- The GPS → barangay engine (resolveBarangay: OSM boundary reverse-geocode,
-- nearest-center fallback) needs these rows to exist with real coordinates.
-- Centers are the OpenStreetMap administrative-boundary centroids for each
-- barangay (fetched 2026-09-24). Re-running refreshes centers; admin-tuned
-- adjustments should be made in Admin → Barangays and noted for re-runs.
--
-- Names follow the official roster: Alipit … Santo Angel Sur, with the
-- five poblacion barangays as Poblacion I–V (OSM calls them Barangay I–V —
-- the app's name matcher aliases the two spellings).
-- =====================================================================

insert into public.barangays (name, description, center_lat, center_lng, is_active) values
  ('Alipit',             'Official barangay of Sta. Cruz, Laguna', 14.2239907, 121.4051150, true),
  ('Bagumbayan',         'Official barangay of Sta. Cruz, Laguna', 14.2686089, 121.3985825, true),
  ('Bubukal',            'Official barangay of Sta. Cruz, Laguna', 14.2566665, 121.3992795, true),
  ('Calios',             'Official barangay of Sta. Cruz, Laguna', 14.2747526, 121.4048705, true),
  ('Duhat',              'Official barangay of Sta. Cruz, Laguna', 14.2532985, 121.3827166, true),
  ('Gatid',              'Official barangay of Sta. Cruz, Laguna', 14.2604341, 121.3835914, true),
  ('Jasaan',             'Official barangay of Sta. Cruz, Laguna', 14.2236530, 121.3946862, true),
  ('Labuin',             'Official barangay of Sta. Cruz, Laguna', 14.2503574, 121.4007365, true),
  ('Malinao',            'Official barangay of Sta. Cruz, Laguna', 14.2328929, 121.3968810, true),
  ('Oogong',             'Official barangay of Sta. Cruz, Laguna', 14.2263504, 121.4004829, true),
  ('Pagsawitan',         'Official barangay of Sta. Cruz, Laguna', 14.2657906, 121.4265403, true),
  ('Palasan',            'Official barangay of Sta. Cruz, Laguna', 14.2575625, 121.4189780, true),
  ('Patimbao',           'Official barangay of Sta. Cruz, Laguna', 14.2701853, 121.4182901, true),
  ('Poblacion I',        'Official barangay of Sta. Cruz, Laguna', 14.2771152, 121.4178920, true),
  ('Poblacion II',       'Official barangay of Sta. Cruz, Laguna', 14.2798998, 121.4163868, true),
  ('Poblacion III',      'Official barangay of Sta. Cruz, Laguna', 14.2824529, 121.4151018, true),
  ('Poblacion IV',       'Official barangay of Sta. Cruz, Laguna', 14.2850061, 121.4151012, true),
  ('Poblacion V',        'Official barangay of Sta. Cruz, Laguna', 14.2857996, 121.4128725, true),
  ('San Jose',           'Official barangay of Sta. Cruz, Laguna', 14.2373329, 121.4037511, true),
  ('San Juan',           'Official barangay of Sta. Cruz, Laguna', 14.2438713, 121.4069612, true),
  ('San Pablo Norte',    'Official barangay of Sta. Cruz, Laguna', 14.2903531, 121.4130607, true),
  ('San Pablo Sur',      'Official barangay of Sta. Cruz, Laguna', 14.2828568, 121.4169772, true),
  ('Santisima Cruz',     'Official barangay of Sta. Cruz, Laguna', 14.2907196, 121.4093518, true),
  ('Santo Angel Central','Official barangay of Sta. Cruz, Laguna', 14.2852811, 121.4089991, true),
  ('Santo Angel Norte',  'Official barangay of Sta. Cruz, Laguna', 14.2884953, 121.4062354, true),
  ('Santo Angel Sur',    'Official barangay of Sta. Cruz, Laguna', 14.2824262, 121.4108895, true)
on conflict (name) do update
  set center_lat  = excluded.center_lat,
      center_lng  = excluded.center_lng,
      is_active   = true;

-- retire the old [BARANGAY N] placeholder rows: delete when nothing
-- references them, otherwise deactivate so they stop participating in GPS
-- matching (reports keep their FK)
delete from public.barangays
where name like '[BARANGAY %'
  and id not in (select barangay_id from public.reports where barangay_id is not null);

update public.barangays
set is_active = false
where name like '[BARANGAY %';

-- ---------------------------------------------------------------------
-- Merge auto-created duplicates ("Barangay Bubukal", "Brgy. San Jose")
-- into the canonical seeded rows. Earlier reverse-geocodes may have
-- created these before the official list was seeded; left alone they
-- would compete with the canonical rows during GPS matching.
-- ---------------------------------------------------------------------
create or replace function public.merge_duplicate_barangays()
returns void language plpgsql security definer set search_path = public as $$
declare
  dup record;
  canonical uuid;
begin
  for dup in
    select b.id, b.name,
           regexp_replace(b.name, '^(Barangay|Brgy\.?)\s+', '') as bare
    from public.barangays b
    where b.name ~* '^(Barangay|Brgy\.?)\s+'
  loop
    select c.id into canonical
    from public.barangays c
    where lower(c.name) = lower(dup.bare)
      and c.id <> dup.id
    limit 1;

    if canonical is not null then
      update public.reports        set barangay_id = canonical where barangay_id = dup.id;
      update public.assignments    set barangay_id = canonical where barangay_id = dup.id;
      update public.ai_analysis    set suggested_barangay_id = canonical where suggested_barangay_id = dup.id;
      delete from public.barangays where id = dup.id;
    end if;
  end loop;
end;
$$;
select public.merge_duplicate_barangays();
drop function public.merge_duplicate_barangays();

-- =====================================================================
-- Migration: staff sees ONLY reports assigned to their unit
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Before: the community-feed clause `or not is_anonymous` inside
-- reports_select / photos_select / history_select allowed ANY
-- authenticated account — including department and barangay staff —
-- to read every public report, even ones never assigned to them.
--
-- After:
--   citizens  → own reports + public reports (community feed unchanged)
--   admin     → everything (unchanged)
--   department → only reports whose department_id = their department
--   barangay   → only reports whose barangay_id = their barangay
-- =====================================================================

-- ---------- reports: read ----------
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.in_assigned_department(id)
    or public.in_assigned_barangay(id)
    -- community feed: public reports, but NEVER a blanket grant for staff —
    -- staff visibility comes exclusively from the assigned-unit clauses above
    or (not is_anonymous and not public.is_staff())
  );

-- ---------- report_photos: follow the parent report ----------
drop policy if exists photos_select on public.report_photos;
create policy photos_select on public.report_photos for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );

-- ---------- status_history: read follows the parent report ----------
drop policy if exists history_select on public.status_history;
create policy history_select on public.status_history for select to authenticated
  using (
    exists (select 1 from public.reports r where r.id = report_id and (
      r.user_id = auth.uid() or public.is_admin()
      or public.in_assigned_department(r.id)
      or public.in_assigned_barangay(r.id)
      or (not r.is_anonymous and not public.is_staff())))
  );

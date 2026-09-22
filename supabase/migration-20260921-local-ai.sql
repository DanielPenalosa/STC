-- =====================================================================
-- Migration: 100% free/local AI analysis (CLIP zero-shot) — urgency,
-- barangay-vs-municipal routing, department routing, admin decisions.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- The AI is fully LOCAL (Transformers.js CLIP in the Next.js server) and
-- FREE — no external API. All results are RECOMMENDATIONS: admins review
-- and either accept or override; every decision is recorded here.
-- =====================================================================

-- 1. ai_analysis — urgency, routing decision, explanation, final admin call
alter table public.ai_analysis
  add column if not exists urgency text
    check (urgency in ('low','medium','high','critical'));

alter table public.ai_analysis
  add column if not exists reason text;                -- short explanation

alter table public.ai_analysis
  add column if not exists handling_level text
    check (handling_level in ('barangay','municipal')); -- routing decision

alter table public.ai_analysis
  add column if not exists auto_assigned boolean default false; -- an assignment row was created automatically

alter table public.ai_analysis
  add column if not exists admin_decision text
    check (admin_decision in ('pending','accepted','overridden','manual'));

alter table public.ai_analysis
  add column if not exists decided_by uuid references public.users(id);

alter table public.ai_analysis
  add column if not exists decided_at timestamptz;

-- 2. categories — municipal-level categories route to their department;
--    everything else defaults to the barangay. Admin-editable in Categories.
alter table public.categories
  add column if not exists handling_level text
    default 'municipal'
    check (handling_level in ('barangay','municipal'));

-- 3. Backfill: legacy rows get sensible defaults
update public.ai_analysis
   set admin_decision = 'pending'
 where admin_decision is null;

update public.categories
   set handling_level = 'municipal'
 where handling_level is null;

-- 4. Helpful index for the AI review queue
create index if not exists ai_analysis_decision_idx
  on public.ai_analysis (admin_decision, created_at desc);

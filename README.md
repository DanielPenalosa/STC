# Smart Community Reporting System

AI-assisted citizen issue reporting for local government.

**Client:** [CLIENT NAME] — **Location:** [CITY/MUNICIPALITY]
**Logo:** [LOGO] (`app/brand.ts` → `LOGO_COMPONENT`)

## Stack
- **Next.js 14 (App Router, TS) + Tailwind** — mobile-first UI, one codebase for citizen (mobile) & staff (desktop) portals
- **Supabase** — Auth, Postgres + **RLS**, Storage (report/evidence photos), Realtime (notifications & live status), Edge Function (AI vision)
- **Recharts** — admin analytics

## Setup
1. Create a Supabase project → copy URL + keys into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
   NEXT_PUBLIC_AI_VISION_ENDPOINT=   # optional custom CV endpoint
   AI_VISION_API_KEY=                # optional custom CV endpoint key
   ```
2. Run `supabase/schema.sql` in the SQL editor (creates tables, RLS, triggers, realtime, storage, seed data).
3. Deploy `supabase/functions/analyze-report` edge function (holds your CV provider key — see header notes).
4. `npm install && npm run dev`

## Roles (RLS-enforced)
| Role | Portal | Nav |
|---|---|---|
| citizen | mobile | Home / Community / My Reports / Notifications / Profile |
| admin | desktop | Dashboard / Reports / AI Analysis / Categories / Barangays / Departments / Users / Analytics / Settings |
| department | desktop | Dashboard / Assigned / In Progress / Resolved |
| barangay | desktop | Dashboard / Assigned / In Progress / Resolved |

## AI flow
Citizen photo → `POST /api/analyze` → Supabase Edge Function (vision model) → suggested category, department, barangay, priority, confidence → stored in `ai_analysis` → **admin review** (accept / override). Low-confidence (< 0.6) requires manual review. AI is advisory only.

## Configurable
Client name, city, logo, brand text: `app/brand.ts` + `app_settings` table (Settings page, admin-editable).

# Setup Guide — Smart Community Reporting System

From zero to running locally in ~15 minutes.

---

## 0. Prerequisites

- **Node.js 18+** — already installed on this machine (`node -v` to verify)
- A free **[Supabase](https://supabase.com)** account

---

## 1. Create the Supabase project

1. Go to **supabase.com → Sign in → New project**
2. Name: `community-reporting` (anything works)
3. Set a **database password** (save it somewhere)
4. Region: pick the one closest to [CITY/MUNICIPALITY]
5. Wait ~2 minutes for provisioning

---

## 2. Run the database schema

1. In the Supabase dashboard, open **SQL Editor → New query**
2. Open `supabase/schema.sql` from this project, copy **the entire file**, paste it in
3. Click **Run** — this creates in one shot:
   - All 14 tables (`users, roles, reports, report_photos, categories, barangays, departments, assignments, notifications, status_history, ai_analysis, locations, audit_logs, app_settings`)
   - **Row Level Security** policies for all 4 roles
   - Triggers: auto-profile on signup + status-change → history & citizen notification
   - Realtime publications for `notifications` and `reports`
   - The `report-photos` storage bucket
   - Seed data: 7 categories, 5 placeholder `[DEPARTMENT]`s, 5 `[BARANGAY N]`s

---

## 3. Get your API keys

1. Go to **Project Settings (⚙️) → API**
2. Copy these three values:

| Key | Where |
|---|---|
| Project URL | `Project Settings → API → Project URL` |
| `anon` public key | `Project Settings → API → Project API Keys → anon` |
| `service_role` key | same page — keep this secret |

3. Create `.env.local` in the project root (copy from `.env.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
NEXT_PUBLIC_LOGO_URL=
```

---

## 4. Run the app

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. Done — everything except AI analysis works now.

---

## 5. Create your first admin account

1. On the site: click **Get started** → register (this creates a *citizen*)
2. In Supabase: **SQL Editor → New query**, run:

```sql
update public.users
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR-EMAIL');
```

3. Sign out and back in — you'll land on the **Admin** portal (sidebar with Dashboard / Reports / AI Analysis / Categories / Barangays / Departments / Users / Analytics / Settings)

**To create department/barangay/admin staff accounts:** use **Admin → Users & Accounts → Create staff account**. Staff accounts can *only* be created there — public registration always creates citizens. The panel sets the password and email-confirms the account automatically; just share the credentials with the staff member. You can still adjust roles later with **Edit role**.

> Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (already part of step 3) — account creation runs through the service-role API and re-runs `supabase/schema.sql` if your database was created before this feature (the signup trigger now reads the role metadata).

---

## 6. Enable AI photo analysis (optional — needs the CLI)

Without this the app still works; the submit form just skips the "AI is analyzing…" pre-check.

```bash
# one-time
npm i -g supabase
supabase login

# from the project root
supabase functions deploy analyze-report --project-ref YOUR-PROJECT-REF
```

(`YOUR-PROJECT-REF` is the `xyz.supabase.co` → the `xyz` part, also shown in Project Settings → General.)

### Give the function a vision provider

Pick **one**:

**Option A — OpenAI**
```bash
supabase secrets set AI_VISION_PROVIDER=openai OPENAI_API_KEY=sk-... --project-ref YOUR-PROJECT-REF
```

**Option B — your own CV service**
```bash
supabase secrets set AI_VISION_PROVIDER=custom AI_VISION_ENDPOINT=https://your-service/analyze AI_VISION_API_KEY=... --project-ref YOUR-PROJECT-REF
```
Your endpoint receives `{ photoUrl, report }` and returns `{ detected_issue, confidence, suggested_category_slug, suggested_department_slug?, suggested_barangay_name? }`.

**Neither configured?** The function falls back to a keyword heuristic so the pipeline still runs end-to-end.

Test it: submit a report with a photo as a citizen → the report page shows the 🤖 AI Analysis card → as admin, accept or override it in **AI Analysis** or on the report itself.

---

## 7. Replace the placeholders when the client is finalized

| What | Where |
|---|---|
| Client name / city / tagline | **Admin → Settings** (writes `app_settings`, no redeploy) and/or `app/brand.tsx` |
| Support email / contact number | **Admin → Settings → Branding & contact** (shown on every profile) |
| Facebook auto-post on/off | **Admin → Settings → Facebook card** (`facebook_autopost` kill switch; keys stay in env) |
| Config health (DB, keys, storage) | **Admin → Settings → System status** (read-only checks) |
| Logo `[LOGO]` | set `NEXT_PUBLIC_LOGO_URL` in `.env.local`, or edit `app/brand.tsx` |
| Real barangays | **Admin → Barangays** — rename the 5 placeholders or add new |
| Real departments | **Admin → Departments** — same |
| Map default center | `components/report-map.tsx` (currently set to Manila coords) |

---

## 8. Status-update emails + password-reset emails via Gmail

Every status change (Submitted → … → Resolved/Closed, including admin
rejections, revision requests, and duplicate closures) emails the citizen.
Delivery uses your Google (Gmail) account through a **Gmail App Password** —
the same mechanism Supabase uses for its password-reset emails once you point
its SMTP settings at the same credentials.

### 8a. Create the Gmail App Password (one-time)

> Requires 2-Step Verification ON — App Passwords don't exist without it.

1. Open <https://myaccount.google.com/security>.
2. Under "How you sign in to Google", turn on **2-Step Verification** if it's
   off (any second factor works).
3. Visit <https://myaccount.google.com/apppasswords> directly (or: Security →
   2-Step Verification → scroll to **App passwords**).
4. Name it `scout-app` → **Create**.
5. Google shows a 16-character password like `abcd efgh ijkl mnop` — copy it
   **now** (it's shown once). This is the only password you'll paste; your
   normal Google password is never used.

### 8b. Send status-update emails from the app

Add two vars to `.env.local` (placeholders are already there, commented) and
restart `npm run dev` / redeploy:

```
SMTP_USER=your.city.reports@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

- Works with any Gmail address (a dedicated `...@gmail.com` is recommended).
- Missing vars → emails silently skip; the app behaves exactly as before.
- Failures never break the status action — they log to the server console.
- Admin kill switch: **Admin → Settings** writes `app_settings.email_updates`
  (`off` pauses all status emails).

### 8c. Send Supabase's password-reset / auth emails through the same Gmail

1. Supabase Dashboard → your project → **Authentication → Emails**.
2. Under **SMTP Settings**, toggle it on and fill:
   | Field | Value |
   |---|---|
   | Sender email | `your.city.reports@gmail.com` |
   | Sender name | `Smart Community Reporting` |
   | Host | `smtp.gmail.com` |
   | Port number | `587` |
   | User name | `your.city.reports@gmail.com` |
   | Password | the 16-char App Password (spaces are fine) |
   | Minimum interval between emails | `60` |
3. **Authentication → URL Configuration**:
   - Site URL: your deployed URL (e.g. `https://your-app.vercel.app`)
   - Redirect URLs: add `<origin>/reset-password` (and
     `<origin>/reset-password` for localhost while developing).
4. **Save**. The existing **Forgot password?** page now delivers through your
   Google account; the email's link lands on `/reset-password` where the user
   sets a new password. No app code changes needed.

### 8d. Verify

- Status email: change any report's status → the citizen receives
  "Report RPT-XXXXXXXX — <status>" within seconds (check spam; Gmail sends as
  your address).
- Reset email: **Login → Forgot password?** → enter the account email → the
  mail arrives with a working reset link.
- Gmail limits: ~500 sends/day per account — ample for a barangay-scale app.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid API key` in browser console | `.env.local` values wrong — re-copy from Project Settings → API, restart `npm run dev` |
| New signups don't appear in `users` table | The `on_auth_user_created` trigger is missing → re-run `supabase/schema.sql` |
| "new row violates row-level security policy" when submitting | You're testing with an account created *before* the schema ran — delete the auth user and re-register |
| No notifications appear live | Run `alter publication supabase_realtime add table public.notifications;` (it's in the schema; re-run if needed) |
| Email signups require confirmation | Auth → Providers → Email → turn **off** "Confirm email" for local testing (or use the OTP link it sends) |
| Photos 404 | Storage bucket missing → re-run section 6 of the schema (bucket creation) |

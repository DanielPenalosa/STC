# Deploy to Vercel — Step by Step

From zero to a live public URL for your Smart Community Reporting System.
Total time: ~15 minutes. Everything is on free tiers.

---

## Part 0 — Prepare the code (on your computer)

Your project folder is **not yet a git repository**, so first put it under version control and push it to GitHub (Vercel deploys from GitHub).

### 1. Create a GitHub account (if you don't have one)

Go to **github.com → Sign up**. Verify your email.

### 2. Create an empty repository on GitHub

1. Click the **+** (top-right) → **New repository**
2. Name: `community-reporting` (anything works)
3. Keep it **Private** (recommended — this is a government system)
4. Do **NOT** check "Add a README" (you want it empty)
5. Click **Create repository** — leave the page open, you'll need the URL

### 3. Push this project to GitHub

Open **Command Prompt / PowerShell** (or ask me to do it) and run, one line at a time:

```bash
cd C:\path\to\your\project          # your project folder

git init
git add .
git commit -m "Initial commit — Smart Community Reporting System"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/community-reporting.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. When prompted, sign in with your browser (GitHub will pop up a login window).

**Note:** your `.gitignore` already excludes `node_modules/`, `.next/`, and `.env*.local` — your secrets will NOT be uploaded. That's correct; you'll add them in Vercel later.

---

## Part 1 — Verify Supabase settings (5 min)

Your database is already running against Supabase — the same project will serve production. Just check three settings:

1. Go to **supabase.com** → your project
2. **Authentication → Sign In / Providers → Email**:
   - **"Confirm email" = OFF** (you already did this — keeps registration working)
3. **Authentication → URL Configuration**:
   - **Site URL**: your future Vercel URL (you'll get it in Part 2 — come back and set it after the first deploy; use a placeholder guess for now)
   - **Redirect URLs**: add the same URL (plus `http://localhost:3000` for local dev)
4. **Project Settings → API** — copy these three values, you'll paste them into Vercel:
   - **Project URL** (`https://xxx.supabase.co`)
   - **anon public** key
   - **service_role** key (⚠️ secret — never commit this)

> If you haven't run the SQL schema yet (tables, RLS, triggers), run `supabase/schema.sql` in the SQL editor first — then `supabase/migration-20260918-verification.sql`. Your local dev already did this, so skip if that's the case.

---

## Part 2 — Deploy on Vercel (5 min)

### 1. Create a Vercel account

Go to **vercel.com → Sign Up → Continue with GitHub** (use the same GitHub account — this connects your repos automatically).

### 2. Import the project

1. Dashboard → **Add New… → Project**
2. Find `community-reporting` in the list → **Import**
   (If it's not listed: click **Adjust GitHub App Permissions** and grant access to the repo)

### 3. Configure the build (usually auto-detected)

- **Framework Preset**: Next.js (auto)
- **Build Command**: (leave default)
- **Root Directory**: (leave default)

### 4. Add environment variables — THE IMPORTANT PART

Expand **Environment Variables** and add these (same values as your local `.env.local`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` (your Project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | your **service_role** key |
| `NEXT_PUBLIC_LOGO_URL` | *(leave empty / skip — the app defaults to `/logo.png`)* |

Copy them straight from your local `.env.local` file to avoid typos.

### 5. Deploy

Click **Deploy** and wait ~2 minutes. You'll get a live URL like:

```
https://community-reporting.vercel.app
```

---

## Part 3 — Post-deploy checklist

1. **Open your live URL** → landing page loads with your logo
2. **Register a test citizen** → ID upload → approve from Admin → Users & Accounts
3. **Supabase → Authentication → URL Configuration**:
   - Set **Site URL** to your real Vercel URL now that you know it
   - Make sure the URL is also in **Redirect URLs**
4. **Sign in as admin on the live site** and submit a test report with GPS — barangay detection should work (it calls OpenStreetMap server-side; no extra setup needed)
5. **Test on your phone** — open the URL, "Add to Home Screen" — the PWA installs with your logo

---

## Part 4 — Every future update (30 seconds)

After the first deploy, shipping changes is just:

```bash
git add .
git commit -m "describe your change"
git push
```

Vercel **automatically rebuilds and redeploys** on every push to `main`. No manual steps, ever.

You also get **preview URLs** for every branch/PR — great for testing changes before they go live.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Invalid API key" / blank data** | Env var typo — check Vercel → Settings → Environment Variables, then **Redeploy** (Deployments → ⋯ → Redeploy) |
| **Login works locally but not live** | Supabase URL Configuration doesn't include the Vercel URL — add it to Site URL + Redirect URLs |
| **Photos fail to upload live** | Confirm you copied `NEXT_PUBLIC_SUPABASE_URL` **without** a trailing `/` |
| **Build fails on Vercel** | Check the build log — usually a missing env var or a TypeScript error. Run `npm run build` locally first to catch it |
| **Changed env vars but nothing changed** | You must **Redeploy** — env vars only apply to new builds |
| **AI photo analysis not working** | That runs in Supabase Edge Functions, not Vercel — set the AI keys in Supabase → Edge Functions → Secrets |

---

## Cost summary (free tier)

- **Vercel Hobby**: free — 100 GB bandwidth/month, unlimited deploys (fine for a community pilot; Pro $20/mo removes limits if the municipality needs SLA/custom domain)
- **Supabase Free**: 500 MB database, 1 GB storage, 50k monthly active users — generous for a barangay/municipality pilot
- **Custom domain** (e.g. `reports.yourmunicipality.gov.ph`): Vercel → Settings → Domains → add + point DNS. Free on any plan.

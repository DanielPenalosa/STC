# Vercel Environment Variables Setup

This guide shows you how to add the required environment variables to your Vercel deployment so that **password reset emails** and **status update notifications** work correctly.

---

## The Problem

Your app works on `localhost` because you have `.env.local` with all the credentials. But Vercel doesn't have access to that file (it's gitignored for security). You need to manually add these environment variables in Vercel's dashboard.

---

## Step-by-Step: Add Environment Variables to Vercel

### 1. Go to your Vercel project

1. Log in to **vercel.com**
2. Click on your project (e.g., `community-reporting`)
3. Go to **Settings** (top menu)
4. Click **Environment Variables** (left sidebar)

### 2. Add these variables one by one

For each variable below, click **Add New**, enter the **Name** and **Value**, then click **Save**.

#### ✅ Required for Supabase (you probably already have these)

```
NEXT_PUBLIC_SUPABASE_URL=https://hrxnetwkmurmaaxvprle.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### ✅ Required for Email (Password Reset & Status Updates) — **THIS IS WHAT'S MISSING**

```
SMTP_USER=your-email@gmail.com
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-client-secret
GMAIL_REFRESH_TOKEN=1//your-refresh-token
```

> **⚠️ Copy these from your `.env.local` file** — Replace the placeholders above with your actual credentials.

#### ✅ Optional: Cloudinary (for photo storage)

```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

#### ✅ Optional: App Origin (for Facebook posting & email links)

```
NEXT_PUBLIC_APP_ORIGIN=https://stc-tau.vercel.app
```

Replace with your actual Vercel URL.

### 3. Redeploy

After adding the environment variables:

1. Go to **Deployments** (top menu)
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy** → **Redeploy**

This rebuilds your app with the new environment variables.

---

## How to Test

1. Open your deployed website (e.g., `https://stc-tau.vercel.app`)
2. Go to **Forgot Password**
3. Enter an email that's registered in your system
4. Click **Send code**
5. ✅ You should receive an email with a 6-digit code

If you still see "Failed to send code", check:

- All four Gmail variables are set correctly in Vercel
- You've redeployed after adding them
- Check the deployment logs (Deployments → click the latest → View Function Logs) for errors

---

## Environment Variable Reference

| Variable | Purpose | Required? |
|----------|---------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public API key | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server-side only) | ✅ Yes |
| `SMTP_USER` | Gmail address for sending emails | ✅ Yes (for email) |
| `GMAIL_CLIENT_ID` | OAuth2 client ID | ✅ Yes (for email) |
| `GMAIL_CLIENT_SECRET` | OAuth2 client secret | ✅ Yes (for email) |
| `GMAIL_REFRESH_TOKEN` | OAuth2 refresh token | ✅ Yes (for email) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | ⚪ Optional |
| `CLOUDINARY_API_KEY` | Cloudinary API key | ⚪ Optional |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | ⚪ Optional |
| `FACEBOOK_PAGE_ID` | Facebook Page ID | ⚪ Optional |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook page token | ⚪ Optional |
| `NEXT_PUBLIC_APP_ORIGIN` | Your public URL | ⚪ Optional |
| `NEXT_PUBLIC_LOGO_URL` | Custom logo URL | ⚪ Optional |

---

## Troubleshooting

### "Failed to send code" on deployed site but works on localhost

**Cause:** Missing Gmail OAuth2 environment variables in Vercel.

**Fix:** Add all four Gmail variables (`SMTP_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) in Vercel → Settings → Environment Variables, then redeploy.

### Status update emails not working

**Cause:** Same as above — missing email configuration.

**Fix:** Same as above.

### "Invalid refresh token" error in logs

**Cause:** The `GMAIL_REFRESH_TOKEN` has expired or is incorrect.

**Fix:** Generate a new refresh token following the Gmail OAuth2 setup guide (see `SETUP.md` or `SETUP-GMAIL.md`), then update it in Vercel.

### Changed environment variables but nothing changed

**Cause:** Environment variables only apply to new deployments.

**Fix:** You must redeploy after changing environment variables. Go to Deployments → ⋯ → Redeploy.

---

## Security Notes

- ⚠️ **Never commit** `.env.local` or `.env` files to git — they contain secrets
- ⚠️ The `SUPABASE_SERVICE_ROLE_KEY` and `GMAIL_REFRESH_TOKEN` are highly sensitive — treat them like passwords
- ✅ Vercel environment variables are encrypted and only accessible to your project
- ✅ Variables starting with `NEXT_PUBLIC_` are safe to expose to the browser (e.g., Supabase URL)

---

## Quick Copy-Paste Checklist

Use this to quickly verify you have everything in Vercel:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SMTP_USER`
- [ ] `GMAIL_CLIENT_ID`
- [ ] `GMAIL_CLIENT_SECRET`
- [ ] `GMAIL_REFRESH_TOKEN`
- [ ] `CLOUDINARY_CLOUD_NAME` (if using Cloudinary)
- [ ] `CLOUDINARY_API_KEY` (if using Cloudinary)
- [ ] `CLOUDINARY_API_SECRET` (if using Cloudinary)
- [ ] `NEXT_PUBLIC_APP_ORIGIN` (your Vercel URL)
- [ ] Redeployed after adding variables

---

Done! Your password reset and email notifications should now work on your deployed site.

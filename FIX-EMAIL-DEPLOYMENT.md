# 🔧 Quick Fix: Email Not Working on Deployed Site

## The Problem

Password reset and status update emails work on `localhost` but fail on your deployed Vercel site with "Failed to send code. Try again."

## The Solution (5 minutes)

Your Gmail OAuth2 credentials are in `.env.local` (which works locally) but **not in Vercel** (which makes the deployed site fail).

### Steps to Fix:

1. **Go to Vercel**
   - Log in to vercel.com
   - Click your project (e.g., `stc-tau`)
   - Go to **Settings** → **Environment Variables**

2. **Add these 4 variables** (copy from your `.env.local` file):

   ```
   SMTP_USER=your-email@gmail.com
   GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-your-client-secret
   GMAIL_REFRESH_TOKEN=1//your-refresh-token
   ```

   **⚠️ Replace the placeholder values above with your actual credentials from `.env.local`**

3. **Redeploy**
   - Go to **Deployments**
   - Click **⋯** on the latest deployment
   - Click **Redeploy**

4. **Test**
   - Open your deployed site
   - Try "Forgot Password"
   - ✅ Should receive email with code

---

## What This Fixes

✅ Password reset emails  
✅ Status update notifications to citizens  
✅ Any email functionality in the app

---

## Why This Happens

- `.env.local` is **gitignored** (correct — keeps secrets safe)
- Vercel **doesn't have access** to files that aren't in git
- You must **manually add** environment variables in Vercel's dashboard
- After adding them, you must **redeploy** for changes to take effect

---

## Need More Help?

- Full guide: `VERCEL-ENV-SETUP.md`
- Deployment guide: `DEPLOY-VERCEL.md`
- Gmail setup: `SETUP.md`

---

That's it! Your emails should now work on the deployed site.

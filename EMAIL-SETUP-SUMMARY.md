# Email Configuration Summary

## Current Status

Your email system uses **Gmail OAuth2** to send:
- Password reset codes (6-digit verification)
- Status update notifications to citizens

## What Works

✅ **Localhost** — Emails send successfully because `.env.local` has all credentials  
❌ **Deployed site (Vercel)** — Emails fail because Vercel doesn't have the credentials

## Required Environment Variables

These 4 variables must be in **both** places:

### 1. `.env.local` (for localhost) ✅ Already configured

```env
SMTP_USER=your-email@gmail.com
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-client-secret
GMAIL_REFRESH_TOKEN=1//your-refresh-token
```

> **Note:** These are placeholder values. Your actual credentials are in `.env.local`

### 2. Vercel Environment Variables ❌ Needs to be added

Go to: **vercel.com → Your Project → Settings → Environment Variables**

Add each of the 4 variables above, then **Redeploy**.

## How Email Works

### Password Reset Flow
1. User enters email on "Forgot Password" page
2. Server generates 6-digit code
3. Code saved to `password_reset_codes` table (expires in 10 min)
4. Server calls `sendPasswordResetCode()` in `lib/email.ts`
5. Nodemailer sends email via Gmail OAuth2
6. User receives email with code
7. User enters code to reset password

### Status Update Flow
1. Admin/staff changes report status
2. Server calls `sendStatusUpdateEmail()` in `lib/email.ts`
3. Nodemailer sends email via Gmail OAuth2
4. Citizen receives notification

### Error Handling
- If email config is missing → Function throws "Email not configured"
- Error caught in `app/actions/password-reset.ts`
- User sees: "Email service is not configured. Contact support."
- Console logs detailed error for debugging

## Files Modified

### 1. `lib/email.ts`
- Added better error logging in `getTransporter()`
- Added check for missing config before creating transporter
- Improved error message in `sendPasswordResetCode()`

### 2. `app/actions/password-reset.ts`
- Added try/catch around email sending
- Better error messages when email config is missing
- Distinguishes between "email not configured" vs "email failed to send"

### 3. Documentation
- `DEPLOY-VERCEL.md` — Updated to include Gmail OAuth2 variables in setup
- `VERCEL-ENV-SETUP.md` — New comprehensive guide for Vercel environment variables
- `FIX-EMAIL-DEPLOYMENT.md` — Quick fix guide for email issues
- `EMAIL-SETUP-SUMMARY.md` — This file, technical overview
- `README.md` — Added note about email setup

## Testing Checklist

### On Localhost (Should already work)
- [ ] Go to Forgot Password
- [ ] Enter a registered email
- [ ] Receive 6-digit code via email
- [ ] Enter code and reset password
- [ ] Submit a report, change its status
- [ ] Citizen receives status update email

### On Deployed Site (After adding env vars to Vercel)
- [ ] Add 4 Gmail OAuth2 variables to Vercel
- [ ] Redeploy
- [ ] Go to Forgot Password
- [ ] Enter a registered email
- [ ] Receive 6-digit code via email
- [ ] Enter code and reset password
- [ ] Submit a report, change its status
- [ ] Citizen receives status update email

## Troubleshooting

### "Failed to send code. Try again."
- Check Vercel has all 4 Gmail OAuth2 variables
- Check for typos in the variable values
- Redeploy after adding variables
- Check deployment logs for detailed errors

### "Email service is not configured. Contact support."
- Means the check in `emailConfigured()` failed
- One or more of the 4 variables is missing
- Double-check Vercel environment variables

### Emails work on localhost but not on Vercel
- Vercel doesn't have access to `.env.local`
- Must manually add variables in Vercel dashboard
- Must redeploy after adding them

### "Invalid refresh token" in logs
- Refresh token has expired
- Generate a new one following Gmail OAuth2 setup
- Update both `.env.local` and Vercel

### Changed variables but nothing changed
- Environment variables only apply to new builds
- Must redeploy from Deployments tab
- Click ⋯ → Redeploy on latest deployment

## Security Notes

⚠️ **Secrets** — These are sensitive:
- `GMAIL_REFRESH_TOKEN` — Allows sending email from your Gmail account
- `GMAIL_CLIENT_SECRET` — OAuth2 client secret
- `SUPABASE_SERVICE_ROLE_KEY` — Full database access

✅ **Safe to commit:**
- `SMTP_USER` — Just an email address
- `GMAIL_CLIENT_ID` — OAuth2 client ID (public)

✅ **Already protected:**
- `.env.local` is in `.gitignore` — secrets never committed
- Vercel variables are encrypted and environment-isolated
- Server-only (not prefixed with `NEXT_PUBLIC_`) so browser can't see them

## Next Steps

1. Copy the 4 Gmail OAuth2 variables from `.env.local`
2. Add them to Vercel → Settings → Environment Variables
3. Redeploy
4. Test password reset on deployed site
5. ✅ Done!

---

For questions or issues, see the full guides:
- Quick fix: `FIX-EMAIL-DEPLOYMENT.md`
- Complete setup: `VERCEL-ENV-SETUP.md`
- Deployment: `DEPLOY-VERCEL.md`

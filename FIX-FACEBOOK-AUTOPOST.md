# 🔧 Fix: Facebook Auto-Post Not Working

## The Problem

When you mark a report as "Resolved" in the admin dashboard, it should automatically post a BEFORE/AFTER comparison to your Facebook Page, but it's failing with an error.

## Why It's Failing

The Facebook auto-posting feature requires two environment variables that are **missing** from both your `.env.local` (localhost) and your Vercel deployment:

```
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

Without these, the system can't connect to Facebook's Graph API to post.

---

## Solution: Get Facebook Credentials

You need to set up a Facebook App and get a Page Access Token. Follow the detailed guide in `SETUP-FACEBOOK.md` for the complete setup process.

### Quick Overview:

1. **Create a Facebook App** (at developers.facebook.com)
2. **Add the Pages API** permission
3. **Get a Page Access Token** with these permissions:
   - `pages_manage_posts` (to publish posts)
   - `pages_read_engagement` (to read page info)
4. **Make the token long-lived** (doesn't expire)
5. **Get your Page ID**

---

## Where to Add the Credentials

### 1. For Localhost (`.env.local`)

Add these lines to your `.env.local` file:

```
FACEBOOK_PAGE_ID=your-page-id-here
FACEBOOK_PAGE_ACCESS_TOKEN=your-long-lived-page-access-token-here
```

### 2. For Vercel (Deployed Site)

1. Go to **vercel.com** → Your Project → **Settings** → **Environment Variables**
2. Add both variables:
   - `FACEBOOK_PAGE_ID`
   - `FACEBOOK_PAGE_ACCESS_TOKEN`
3. **Redeploy** (Deployments → ⋯ → Redeploy)

---

## How It Works

When you mark a report as "Resolved":

1. The system automatically triggers `postResolvedReportToFacebook()`
2. It fetches the BEFORE photo (citizen's original photo)
3. It fetches the AFTER photo (resolution photo uploaded by staff)
4. It creates a side-by-side labeled image
5. It posts to your Facebook Page with a formal advisory caption including:
   - Report title and location
   - Report reference code
   - Dates reported and resolved
   - Category
   - Public advisory message

**Format:**
```
📢 PUBLIC ADVISORY — REPORT RESOLVED

The Municipal Government of Sta. Cruz, Laguna, through the SCOUT
response system, informs the public that the following concern has
been verified and acted upon:

📌 [Report Title]
📍 Brgy. [Barangay Name], Sta. Cruz, Laguna
🗂️ Concern: [Category]

🗓️ Date Reported: [Date and Time]
✅ Date Resolved: [Date and Time]

🔖 Reference No.: [REF-CODE]

Maraming salamat po sa patuloy na pakikilahok ng ating mga mamamayan...

#SCOUT #StaCruzLaguna #SerbisyongPubliko #Transparency
```

---

## Fallback Behavior

The Facebook posting is **best-effort** and will never block the admin's action:

- ✅ If Facebook is down → Report still gets marked as "Resolved"
- ✅ If photos can't be composited → Falls back to album-style post
- ✅ If labeling fails → Posts unlabeled photos
- ✅ If uploads fail → Retries 3 times per photo
- ✅ All errors are logged to the server console

---

## Testing the Connection

Once you've added the credentials, test the connection in Admin → Settings:

1. Go to your deployed site (or localhost)
2. Log in as admin
3. Go to **Settings**
4. Under "Facebook Page auto-posting", click **Test connection**
5. You should see: ✅ Connected: [Your Page Name]

If you see an error, check:
- Token is valid and not expired
- Token has `pages_manage_posts` permission
- Page ID is correct
- Both variables are set in Vercel (and redeployed)

---

## Disable Auto-Posting (Temporary)

If you want to disable Facebook auto-posting while keeping the app running:

**Option 1: Kill Switch in Settings**
- Admin Dashboard → Settings → Facebook Page auto-posting → Toggle OFF

**Option 2: Remove Environment Variables**
- Simply don't set `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`
- The app will work normally, just won't post to Facebook

---

## Need Help?

- **Full Facebook setup guide:** `SETUP-FACEBOOK.md`
- **Environment variable guide:** `VERCEL-ENV-SETUP.md`
- **Deployment guide:** `DEPLOY-VERCEL.md`

---

## Summary Checklist

- [ ] Read `SETUP-FACEBOOK.md` for detailed Facebook App setup
- [ ] Get Facebook Page ID
- [ ] Get Facebook Page Access Token (long-lived)
- [ ] Add both to `.env.local` for localhost testing
- [ ] Add both to Vercel environment variables
- [ ] Redeploy Vercel
- [ ] Test connection in Admin → Settings
- [ ] Mark a test report as "Resolved" with before/after photos
- [ ] Check your Facebook Page for the auto-posted update
- [ ] ✅ Done!

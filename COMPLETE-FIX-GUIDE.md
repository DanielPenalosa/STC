# Complete Fix Guide - Email & Facebook Not Working

This guide fixes both issues:
1. ❌ Password reset emails fail on deployed site
2. ❌ Facebook auto-posting fails when marking reports as "Resolved"

Both work on localhost but fail on your deployed Vercel site because environment variables are missing.

---

## Part 1: Fix Email (Password Reset & Status Updates)

### Step 1: Go to Vercel Dashboard

1. Open your browser and go to **vercel.com**
2. Log in with your account
3. Click on your project name (e.g., **stc-tau**)

### Step 2: Open Environment Variables

1. Click **Settings** in the top menu
2. Click **Environment Variables** in the left sidebar

### Step 3: Add Gmail OAuth2 Variables

You need to add these 4 variables. Copy the values from your `.env.local` file:

**Variable 1:**
- Name: `SMTP_USER`
- Value: Copy from your `.env.local` file

**Variable 2:**
- Name: `GMAIL_CLIENT_ID`
- Value: Copy from your `.env.local` file

**Variable 3:**
- Name: `GMAIL_CLIENT_SECRET`
- Value: Copy from your `.env.local` file

**Variable 4:**
- Name: `GMAIL_REFRESH_TOKEN`
- Value: Copy from your `.env.local` file

> **💡 Tip:** Open your `.env.local` file and copy each value exactly as shown - these are already working on localhost.

For each variable:
1. Click **Add New**
2. Enter the **Name**
3. Paste the **Value**
4. Click **Save**

### Step 4: Redeploy

1. Click **Deployments** in the top menu
2. Find the latest deployment (top of the list)
3. Click the **⋯** (three dots) button on the right
4. Click **Redeploy**
5. Wait for the deployment to complete (~2 minutes)

### Step 5: Test Email

1. Go to your deployed website: `https://stc-tau.vercel.app`
2. Click **Login** → **Forgot your password?**
3. Enter an email that's registered in your system
4. Click **Send code**
5. ✅ You should receive an email with a 6-digit code

**Email is now fixed!** ✅

---

## Part 2: Fix Facebook Auto-Posting

### Why It's Not Working

You need 2 Facebook credentials that are currently missing:
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`

### Step 1: Get Your Facebook Page ID

#### Option A: From Facebook Page Settings (Easiest)

1. Go to your Facebook Page
2. Click **Settings** (left sidebar)
3. Click **Page Info** or **About**
4. Scroll down to find **Page ID**
5. Copy the number (e.g., `123456789012345`)

#### Option B: From Page URL

If your page URL is `facebook.com/YourPageName`, you can get the ID:
1. Go to **facebook.com/YourPageName/about**
2. Look for "Page ID" in the Page Info section

### Step 2: Create a Facebook App

1. Go to **developers.facebook.com**
2. Click **My Apps** (top right)
3. Click **Create App**
4. Choose **Business** type
5. Fill in:
   - **App Name**: SCOUT Sta Cruz (or any name)
   - **App Contact Email**: Your email
6. Click **Create App**
7. Complete the security check

### Step 3: Add Facebook Login Product

1. In your new app dashboard, scroll down to **Add Products**
2. Find **Facebook Login** → Click **Set Up**
3. Choose **Web** platform
4. For Site URL, enter: `https://stc-tau.vercel.app`
5. Click **Save** → **Continue**

### Step 4: Get User Access Token with Required Permissions

1. In the left menu, click **Tools** → **Graph API Explorer**
2. In the top bar:
   - **Application**: Select your app (SCOUT Sta Cruz)
   - **User or Page**: Select "User Token" (should be default)
3. **IMPORTANT - Add Permissions First:**
   - Click **Permissions** dropdown (next to "Get User Access Token" button)
   - In the search box, type "pages"
   - Check these 3 permissions:
     - ✅ `pages_show_list` (to list your pages)
     - ✅ `pages_read_engagement` (to read page info)
     - ✅ `pages_manage_posts` (to publish posts)
   - You might also see `business_management` - that's fine to include
   - Click outside the dropdown to close it
4. Click **Generate Access Token**
5. A popup will ask you to authorize these permissions:
   - Review the permissions
   - Click **Continue as [Your Name]**
   - Click **OK** or **Done**
6. You now have a **Short-Lived User Access Token** (valid for 1-2 hours)
7. **Copy this token** - we'll extend it in the next step

**Screenshot reference:** You should see "business_management", "pages_show_list", etc. listed under your app permissions.

### Step 5: Get Long-Lived User Token

1. Open this URL in your browser (replace the values):

```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_TOKEN
```

**Where to find the values:**
- `YOUR_APP_ID`: Go to your app → **Settings** → **Basic** → **App ID**
- `YOUR_APP_SECRET`: Same page → **App Secret** (click **Show**)
- `YOUR_SHORT_LIVED_TOKEN`: The token you copied in Step 4

2. Press Enter
3. You'll see a response like:
```json
{
  "access_token": "EAAxxxxxxxxxxxxx...",
  "token_type": "bearer",
  "expires_in": 5183999
}
```

4. **Copy the new `access_token`** - this is your Long-Lived User Token (valid for ~60 days)

### Step 6: Get Page Access Token

1. Go back to **Graph API Explorer**
2. Replace the token in the "Access Token" field with your **Long-Lived User Token** (from Step 5)
3. In the query field, type: `me/accounts`
4. Click **Submit**
5. You'll see a list of pages you manage:
```json
{
  "data": [
    {
      "access_token": "EAABwzLixxxxxYourPageTokenHerexxxxx",
      "category": "Government Organization",
      "name": "Your Page Name",
      "id": "123456789012345",
      "tasks": ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MESSAGING"]
    }
  ]
}
```

6. **Copy the `access_token` under your page** - this is your Page Access Token
7. **Copy the `id`** - this is your Page ID (if you didn't get it in Step 1)

**Important:** Page Access Tokens don't expire as long as your app stays installed!

### Step 7: Verify Token Permissions

Let's make sure your Page Token has the right permissions:

1. Go to: https://developers.facebook.com/tools/debug/accesstoken/
2. Paste your **Page Access Token**
3. Click **Debug**
4. Check that it shows:
   - **Type**: Page
   - **Permissions**: Should include:
     - ✅ `pages_show_list`
     - ✅ `pages_read_engagement`
     - ✅ `pages_manage_posts`
   - **Expires**: Never

**If permissions are missing**, you need to start over from Step 4:
1. Go back to Graph API Explorer
2. Click the **Permissions** dropdown
3. Make sure you check all 3 permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
4. Generate new User Access Token
5. Repeat Steps 5-6 to get new Page Access Token

### Step 8: Add Facebook Variables to .env.local (For Localhost Testing)

1. Open your `.env.local` file
2. Find these lines:
```
# Facebook auto-posting (optional - for posting resolved reports to FB Page)
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

3. Fill in your values:
```
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAABwzLixxxxxYourPageTokenHerexxxxx
```

4. Save the file

### Step 9: Test on Localhost (Optional but Recommended)

1. Open terminal/command prompt
2. Go to your project folder: `cd C:\Users\ASUS\Documents\FOD`
3. Stop your dev server if it's running (Ctrl+C)
4. Start it again: `npm run dev`
5. Go to `http://localhost:3000`
6. Log in as admin
7. Go to **Settings**
8. Under "Facebook Page auto-posting", click **Test connection**
9. You should see: ✅ **Connected: [Your Page Name]**

### Step 10: Add Facebook Variables to Vercel

1. Go back to **vercel.com** → Your Project → **Settings** → **Environment Variables**
2. Add these 2 variables:

**Variable 1:**
- Name: `FACEBOOK_PAGE_ID`
- Value: Your Page ID (e.g., `123456789012345`)

**Variable 2:**
- Name: `FACEBOOK_PAGE_ACCESS_TOKEN`  
- Value: Your Page Access Token (e.g., `EAABwzLixxxxxYourPageTokenHerexxxxx`)

3. Click **Save** for each

### Step 11: Add APP_ORIGIN Variable (Important!)

This tells Facebook where to fetch the photos from.

1. Still in Environment Variables
2. Add one more variable:

**Variable 3:**
- Name: `NEXT_PUBLIC_APP_ORIGIN`
- Value: `https://stc-tau.vercel.app` (your Vercel URL)

### Step 12: Redeploy Again

1. Click **Deployments** in the top menu
2. Click **⋯** on the latest deployment
3. Click **Redeploy**
4. Wait for completion

### Step 13: Test Facebook Auto-Post

1. Go to your deployed site: `https://stc-tau.vercel.app`
2. Log in as **admin**
3. Go to **Settings** → Test Facebook connection (should show ✅ Connected)
4. Go to **Reports**
5. Find a test report that has:
   - A BEFORE photo (citizen's original photo)
   - An AFTER photo (resolution photo from staff)
6. Mark it as **Resolved**
7. Go check your Facebook Page
8. ✅ You should see a new post with BEFORE/AFTER photos!

**Facebook auto-posting is now fixed!** ✅

---

## Complete Environment Variables Checklist

Make sure you have all these in Vercel:

### Required (Supabase - you probably already have these)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### Required for Email
- [ ] `SMTP_USER`
- [ ] `GMAIL_CLIENT_ID`
- [ ] `GMAIL_CLIENT_SECRET`
- [ ] `GMAIL_REFRESH_TOKEN`

### Required for Facebook Auto-Posting
- [ ] `FACEBOOK_PAGE_ID`
- [ ] `FACEBOOK_PAGE_ACCESS_TOKEN`
- [ ] `NEXT_PUBLIC_APP_ORIGIN`

### Optional (Cloudinary)
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`

---

## Troubleshooting

### Email still not working after following steps
- Check you copied all 4 Gmail variables correctly (no extra spaces)
- Make sure you redeployed after adding variables
- Check Vercel deployment logs for errors
- Variables are case-sensitive - check spelling

### Facebook test connection fails
- Token might be expired - generate a new one
- Check token has required permissions (Step 7)
- Make sure App ID and Page ID are correct
- Check your Facebook App is not in Development Mode restricting access

### Facebook post appears but without photos
- Check `NEXT_PUBLIC_APP_ORIGIN` is set correctly
- Make sure report has both BEFORE and AFTER photos
- Check Vercel deployment logs for photo download errors

### "Invalid token" error
- Page Access Token might have expired - regenerate following Steps 4-6
- Make sure you're using the PAGE token, not the USER token

### Can't find Page in Graph API Explorer
- Make sure you're an admin of the Facebook Page
- Your user account must have a role on the page
- Try logging out of Graph API Explorer and back in

---

## Quick Summary

### To Fix Email:
1. Add 4 Gmail variables to Vercel
2. Redeploy
3. Test password reset

### To Fix Facebook:
1. Get Page ID from Facebook
2. Create Facebook App
3. Get Long-Lived User Token
4. Get Page Access Token from that token
5. Add Page ID + Token to `.env.local`
6. Test on localhost
7. Add Page ID + Token to Vercel
8. Add `NEXT_PUBLIC_APP_ORIGIN`
9. Redeploy
10. Test by marking a report as Resolved

---

## Need More Help?

- Facebook setup details: `SETUP-FACEBOOK.md`
- Email setup details: `FIX-EMAIL-DEPLOYMENT.md`
- All environment variables: `VERCEL-ENV-SETUP.md`

Both features should now work on your deployed site! 🎉

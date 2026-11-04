# Simple Facebook Setup - Easy Steps

Follow these steps exactly. Don't skip any step.

---

## Part 1: Get Your Facebook Page ID (5 minutes)

### Step 1: Open Your Facebook Page
1. Go to facebook.com
2. Log in if needed
3. Go to your Facebook Page (the page for your government office)

### Step 2: Get the Page ID
1. On your page, click **"Settings"** in the left menu
2. Click **"Page info"** (also in left menu)
3. Scroll down - you'll see **"Page ID"**
4. Copy that number (example: 123456789012345)
5. **Save it in a notepad** - you'll need it later

✅ Done! You have your Page ID.

---

## Part 2: Get Facebook Page Access Token (20 minutes)

### Step 1: Open Graph API Explorer
1. Open this link in a new tab: https://developers.facebook.com/tools/explorer/
2. You should see a page with tools and dropdowns

### Step 2: Select Your App
1. Look at the top of the page
2. Find the dropdown that says "Meta App" or shows an app name
3. Click it and select **"SCOUT"** (your app)

### Step 3: Get User Access Token (THE IMPORTANT PART)

Look for a button that says **"Get User Access Token"** or **"Generate Access Token"**

**Click that button** (not the dropdown, the actual button)

A **popup window** should appear with permission checkboxes.

### Step 4: Select Permissions in the Popup

In the popup that appeared:

1. You'll see a search box or a list of permissions
2. Look for these 3 permissions and **check the boxes**:
   - ☑️ `pages_show_list`
   - ☑️ `pages_read_engagement`
   - ☑️ `pages_manage_posts`

**How to find them:**
- If you see a search box: type "pages" and they'll appear
- If you see a list: scroll down to find them
- They might be under "Pages" or "Business" section

3. After checking all 3 boxes, click **"Generate Access Token"** button in the popup
4. Another popup might ask you to log in or confirm - click **"Continue"** or **"OK"**

### Step 5: Copy the Short Token

After the popup closes:
1. You'll see a long text in the "Access Token" field (starts with "EAA...")
2. **Copy this entire token**
3. **Save it in notepad** - label it "Short Token"

✅ You now have a Short-Lived User Access Token (expires in 1-2 hours)

---

## Part 3: Convert to Long-Lived Token (5 minutes)

### Step 1: Get Your App Credentials

1. Go to: https://developers.facebook.com/apps/
2. Click your **SCOUT** app
3. Click **"App settings"** → **"Basic"** in the left menu
4. You'll see:
   - **App ID** - copy this number
   - **App Secret** - click "Show" button, copy this
5. **Save both in notepad**

### Step 2: Build the URL

Open a new notepad and create this URL by replacing the parts:

```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_TOKEN
```

**Replace:**
- `YOUR_APP_ID` = the App ID you copied
- `YOUR_APP_SECRET` = the App Secret you copied  
- `YOUR_SHORT_TOKEN` = the Short Token from Part 2, Step 5

**Example (don't use this, use yours):**
```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=123456789&client_secret=abc123def456&fb_exchange_token=EAABwzLix...
```

### Step 3: Visit the URL

1. Copy your complete URL
2. Paste it in your browser address bar
3. Press Enter
4. You'll see a response like this:

```json
{
  "access_token": "EAABwzLixnjgBO7XN...",
  "token_type": "bearer",
  "expires_in": 5183999
}
```

5. **Copy the `access_token` value** (the long text after "access_token":)
6. **Save in notepad** - label it "Long-Lived User Token"

✅ You now have a Long-Lived User Access Token (lasts 60 days)

---

## Part 4: Get Page Access Token (5 minutes)

### Step 1: Go Back to Graph API Explorer

1. Go back to: https://developers.facebook.com/tools/explorer/
2. Make sure **SCOUT** app is selected

### Step 2: Replace the Token

1. Find the "Access Token" field (has the old token)
2. Delete the old token
3. Paste your **Long-Lived User Token** (from Part 3, Step 3)

### Step 3: Query Your Pages

1. Find the query box (might say "GET" or have a path like "/me")
2. Clear it and type: `me/accounts`
3. Click **"Submit"** button

### Step 4: Get Your Page Token

You'll see a response with your pages:

```json
{
  "data": [
    {
      "access_token": "EAABwzLix...THIS_IS_YOUR_PAGE_TOKEN",
      "category": "Government Organization",
      "name": "Your Page Name",
      "id": "123456789012345"
    }
  ]
}
```

**Copy the `access_token` under your page** (not the id, the access_token)

**Also verify the `id` matches your Page ID from Part 1**

**Save in notepad** - label it "**PAGE ACCESS TOKEN**" ← THIS IS THE FINAL ONE YOU NEED!

✅ You now have your Page Access Token! This doesn't expire!

---

## Part 5: Add to Your Project (10 minutes)

### Step 1: Add to .env.local (For Testing on Localhost)

1. Open your project folder: `C:\Users\ASUS\Documents\FOD`
2. Open the file `.env.local`
3. Find these lines:

```
# Facebook auto-posting (optional - for posting resolved reports to FB Page)
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

4. Fill them in:

```
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAABwzLix...YOUR_PAGE_TOKEN_HERE
```

5. **Save the file**

### Step 2: Test on Localhost (Optional but Recommended)

1. Open Command Prompt or Terminal
2. Go to your project: `cd C:\Users\ASUS\Documents\FOD`
3. If dev server is running, stop it (Ctrl+C)
4. Start it: `npm run dev`
5. Go to: http://localhost:3000
6. Log in as admin
7. Go to **Settings**
8. Find "Facebook Page auto-posting"
9. Click **"Test connection"**
10. You should see: ✅ **Connected: [Your Page Name]**

If you see that, it works! If not, double-check your tokens.

### Step 3: Add to Vercel (For Your Live Website)

1. Go to: https://vercel.com
2. Log in
3. Click your project (stc-tau or whatever it's called)
4. Click **"Settings"** (top menu)
5. Click **"Environment Variables"** (left menu)
6. Click **"Add New"**

**Add Variable 1:**
- Key: `FACEBOOK_PAGE_ID`
- Value: Your Page ID (the number from Part 1)
- Click **"Save"**

**Add Variable 2:**
- Key: `FACEBOOK_PAGE_ACCESS_TOKEN`
- Value: Your Page Access Token (the long token from Part 4, Step 4)
- Click **"Save"**

**Add Variable 3:**
- Key: `NEXT_PUBLIC_APP_ORIGIN`
- Value: `https://stc-tau.vercel.app` (your actual Vercel URL)
- Click **"Save"**

### Step 4: Redeploy

1. Still in Vercel, click **"Deployments"** (top menu)
2. Find the latest deployment (first one in the list)
3. Click the **⋯** (three dots) on the right
4. Click **"Redeploy"**
5. Wait 2-3 minutes for it to finish

✅ Done!

---

## Part 6: Test It! (5 minutes)

### Step 1: Test on Your Live Website

1. Go to your website: https://stc-tau.vercel.app
2. Log in as **admin**
3. Go to **Settings**
4. Find "Facebook Page auto-posting"
5. Click **"Test connection"**
6. Should show: ✅ Connected: [Your Page Name]

### Step 2: Test Auto-Posting

1. Go to **Reports**
2. Find a test report that has:
   - A BEFORE photo (original report photo)
   - An AFTER photo (resolution photo)
3. Change its status to **"Resolved"**
4. Wait 10 seconds
5. Go check your Facebook Page
6. You should see a new post with BEFORE/AFTER photos!

✅ **Success!** Facebook auto-posting is working!

---

## Quick Checklist

- [ ] Got Page ID from Facebook Page settings
- [ ] Got Short-Lived User Token from Graph API Explorer
- [ ] Converted to Long-Lived User Token using URL
- [ ] Got Page Access Token using me/accounts query
- [ ] Added both to .env.local
- [ ] Tested on localhost (optional)
- [ ] Added both to Vercel environment variables
- [ ] Added NEXT_PUBLIC_APP_ORIGIN to Vercel
- [ ] Redeployed Vercel
- [ ] Tested connection in Settings
- [ ] Tested by marking a report as Resolved
- [ ] Saw post on Facebook Page

---

## Common Issues

### "Can't find permissions in popup"

You need to type "pages" in the search box in the popup, or scroll down to find them.

### "No popup appears"

Make sure you clicked the **button** "Get User Access Token", not the dropdown. The button should be blue or highlighted.

### "Token appears but then disappears"

You closed the permission popup too early. Click "Continue" in the Facebook permission popup when it asks.

### "Test connection fails"

- Check you copied the Page Access Token correctly (no extra spaces)
- Check it's the PAGE token, not the USER token
- Try generating a new token following all steps again

### "Photos don't appear in Facebook post"

- Check NEXT_PUBLIC_APP_ORIGIN is set correctly in Vercel
- Check the report has both BEFORE and AFTER photos
- Check Vercel deployment logs for errors

---

## Summary

**What you need in the end:**
1. `FACEBOOK_PAGE_ID` = A number like 123456789012345
2. `FACEBOOK_PAGE_ACCESS_TOKEN` = A long string starting with EAA...
3. Both added to `.env.local` and Vercel

**Where to get them:**
1. Page ID → From your Facebook Page settings
2. Page Token → From Graph API Explorer using the process above

That's it! Follow each part in order and you'll have Facebook auto-posting working.

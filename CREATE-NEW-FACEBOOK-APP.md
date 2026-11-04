# Create a New Facebook App - Step by Step

Starting fresh with a new app. This is often easier than fixing an existing one.

---

## Part 1: Create the App (5 minutes)

### Step 1: Go to Facebook Developers

1. Open your browser
2. Go to: https://developers.facebook.com/apps/
3. Log in with your Facebook account (use the account that's an admin of your Facebook Page)

### Step 2: Create New App

1. Click the green **"Create App"** button (top right)
2. A screen appears asking "What do you want your app to do?"

### Step 3: Select App Type

**Choose: "Other"**
- Click on the **"Other"** option
- Click **"Next"**

### Step 4: Select Use Case

**Choose: "Business"**
- Click on **"Business"** 
- Click **"Next"**

### Step 5: Fill in App Details

You'll see a form:

**App name:**
- Enter: `SCOUT Sta Cruz Reports` (or any name you want)

**App contact email:**
- Enter your email address (example: admin@stacruz.gov.ph or your personal email)

**Business account (optional):**
- Leave blank or select if you have one

Click **"Create app"**

### Step 6: Complete Security Check

- You might see a security check (CAPTCHA)
- Complete it
- Click **"Submit"**

✅ Your app is created!

---

## Part 2: Set Up the App (10 minutes)

### Step 1: You're Now on the App Dashboard

You should see:
- Your app name at the top
- A sidebar with options
- The main area might show "Add products to your app"

### Step 2: Add Facebook Login Product

1. Look for **"Add products to your app"** section
2. Find **"Facebook Login"** (has a login icon)
3. Click the **"Set up"** button next to it

### Step 3: Choose Platform

A screen asks "Which platform are you building for?"

**Click "Web"**

### Step 4: Enter Your Site URL

You'll see "Tell us about your website"

**Site URL:** Enter `https://stc-tau.vercel.app`
(Use your actual Vercel URL)

Click **"Save"**

Click **"Continue"**

You can skip the rest of the setup - click **"Next"** until you're back to the dashboard.

✅ Facebook Login is now added to your app!

---

## Part 3: Make App Live (5 minutes)

### Step 1: Change App Mode

Look at the top of your dashboard. You'll see:
- Your app name
- A toggle or text that says **"In development"** or **"App Mode"**

1. Click on the **toggle** or **dropdown** next to "In development"
2. Select **"Live"** or **"Public"**
3. A popup might appear asking you to confirm
4. Click **"Switch Mode"** or **"Confirm"**

**Note:** Some apps can't be switched to Live immediately. If you don't see this option, that's okay - the app will still work for your page in Development mode.

✅ App is now live (or staying in Development mode is fine too)!

---

## Part 4: Get Your Access Token (15 minutes)

### Step 1: Open Graph API Explorer

1. Open a new tab: https://developers.facebook.com/tools/explorer/
2. Make sure you're logged into Facebook

### Step 2: Select Your New App

1. At the top of Graph API Explorer, look for the **"Meta App"** dropdown
2. Click it
3. Select your new app: **"SCOUT Sta Cruz Reports"** (or whatever you named it)

### Step 3: Generate User Access Token

1. Look for a button that says **"Get User Access Token"** or **"Generate Access Token"**
2. **Click that button** (not a dropdown, the actual button)

### Step 4: Select Permissions (IMPORTANT!)

A **popup window** should appear with checkboxes.

**In the popup:**

1. You'll see a search box at the top
2. Type: `pages`
3. Find and check these **3 boxes**:
   - ☑️ `pages_show_list`
   - ☑️ `pages_read_engagement`
   - ☑️ `pages_manage_posts`

4. You might also see other permissions like:
   - `business_management` - you can check this too if you want
   - `public_profile` - this is usually already checked

5. After checking the 3 pages permissions, click **"Generate Access Token"** button in the popup

### Step 5: Confirm Permissions

1. Another popup appears asking you to authorize
2. It will show what data the app can access
3. Click **"Continue as [Your Name]"**
4. You might see another confirmation - click **"OK"** or **"Done"**

### Step 6: Copy the Token

1. The popup closes
2. You're back in Graph API Explorer
3. You'll see a long token in the **"Access Token"** field (starts with "EAA...")
4. **Copy this entire token**
5. Open Notepad and paste it - label it **"USER TOKEN"**

✅ You have a User Access Token!

---

## Part 5: Get App Credentials (3 minutes)

### Step 1: Go to App Settings

1. Go back to: https://developers.facebook.com/apps/
2. Click your app: **"SCOUT Sta Cruz Reports"**
3. In the left sidebar, click **"App settings"**
4. Click **"Basic"**

### Step 2: Copy App ID and App Secret

You'll see:

**App ID:**
- A number like: 123456789012345
- **Copy this number**
- Save in Notepad - label it **"APP ID"**

**App Secret:**
- Click the **"Show"** button
- You might need to enter your Facebook password
- A long string appears
- **Copy this string**
- Save in Notepad - label it **"APP SECRET"**

✅ You have your App credentials!

---

## Part 6: Get Long-Lived User Token (5 minutes)

### Step 1: Build the URL

Open Notepad and create this URL:

```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_USER_TOKEN
```

**Replace these parts with your actual values:**
- `YOUR_APP_ID` = The App ID from Part 5
- `YOUR_APP_SECRET` = The App Secret from Part 5
- `YOUR_USER_TOKEN` = The USER TOKEN from Part 4, Step 6

### Step 2: Visit the URL

1. Copy your complete URL
2. Paste it into your browser's address bar
3. Press Enter
4. You'll see a JSON response:

```json
{
  "access_token": "EAABwzLix...long_string_here",
  "token_type": "bearer",
  "expires_in": 5183999
}
```

5. **Copy the `access_token` value** (the long string after "access_token":")
6. Save in Notepad - label it **"LONG-LIVED USER TOKEN"**

✅ You have a Long-Lived User Token!

---

## Part 7: Get Page Access Token (5 minutes)

### Step 1: Go Back to Graph API Explorer

1. Go to: https://developers.facebook.com/tools/explorer/
2. Make sure your app is selected: **"SCOUT Sta Cruz Reports"**

### Step 2: Use Long-Lived Token

1. Find the **"Access Token"** field
2. Delete the current token
3. Paste your **LONG-LIVED USER TOKEN** (from Part 6, Step 2)

### Step 3: Query Your Pages

1. Find the query box (might show "/me" or be empty)
2. Clear it
3. Type: `me/accounts`
4. Click **"Submit"** button

### Step 4: Find Your Page Token

You'll see a response with your pages:

```json
{
  "data": [
    {
      "access_token": "EAABwzLix...THIS_IS_YOUR_PAGE_TOKEN",
      "category": "Government Organization", 
      "name": "SCOUT Sta. Cruz",
      "id": "123456789012345",
      "tasks": ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT"]
    }
  ]
}
```

**From this response:**

1. **Copy the `access_token`** - This is your **PAGE ACCESS TOKEN** ← THE MOST IMPORTANT ONE
2. **Copy the `id`** - This is your **PAGE ID**

**Save both in Notepad:**
- Label one: **"PAGE ACCESS TOKEN"** ← You'll use this
- Label one: **"PAGE ID"** ← You'll use this

✅ You have everything you need!

---

## Part 8: Add to Your Project (10 minutes)

### Step 1: Add to .env.local

1. Open your project folder: `C:\Users\ASUS\Documents\FOD`
2. Open the file **`.env.local`**
3. Find these lines:

```
# Facebook auto-posting (optional - for posting resolved reports to FB Page)
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
```

4. Fill them in with your values:

```
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_PAGE_ACCESS_TOKEN=EAABwzLix...your_page_token_here
```

5. **Save the file**

### Step 2: Test on Localhost

1. Open Command Prompt or Terminal
2. Navigate to project: `cd C:\Users\ASUS\Documents\FOD`
3. If dev server is running, stop it (press Ctrl+C)
4. Start dev server: `npm run dev`
5. Wait for it to start
6. Open browser: http://localhost:3000
7. Log in as **admin**
8. Go to **Settings** page
9. Scroll to "Facebook Page auto-posting"
10. Click **"Test connection"** button

**You should see:**
✅ **Connected: SCOUT Sta. Cruz** (or your page name)

**If you see that, it works!** 🎉

---

## Part 9: Add to Vercel (5 minutes)

### Step 1: Go to Vercel

1. Open: https://vercel.com
2. Log in
3. Click on your project name

### Step 2: Open Environment Variables

1. Click **"Settings"** (top menu)
2. Click **"Environment Variables"** (left sidebar)

### Step 3: Add the Variables

**Add Variable 1:**
1. Click **"Add New"**
2. Key: `FACEBOOK_PAGE_ID`
3. Value: Your Page ID (the number)
4. Click **"Save"**

**Add Variable 2:**
1. Click **"Add New"**
2. Key: `FACEBOOK_PAGE_ACCESS_TOKEN`
3. Value: Your Page Access Token (the long EAA... string)
4. Click **"Save"**

**Add Variable 3:**
1. Click **"Add New"**
2. Key: `NEXT_PUBLIC_APP_ORIGIN`
3. Value: `https://stc-tau.vercel.app` (your actual Vercel URL)
4. Click **"Save"**

### Step 4: Redeploy

1. Click **"Deployments"** (top menu)
2. Find the latest deployment (top of the list)
3. Click the **⋯** (three dots)
4. Click **"Redeploy"**
5. Wait 2-3 minutes

✅ Done!

---

## Part 10: Test on Live Site (5 minutes)

### Step 1: Test Connection

1. Go to your live website: https://stc-tau.vercel.app
2. Log in as **admin**
3. Go to **Settings**
4. Find "Facebook Page auto-posting"
5. Click **"Test connection"**

**Should show:** ✅ **Connected: [Your Page Name]**

### Step 2: Test Auto-Posting

1. Go to **Reports**
2. Find a report with both:
   - BEFORE photo (original report photo)
   - AFTER photo (resolution photo)
3. Mark it as **"Resolved"**
4. Wait 10-15 seconds
5. Open Facebook and go to your Page
6. **You should see a new post** with before/after photos!

✅ **Success! Facebook auto-posting is working!** 🎉

---

## Summary Checklist

- [ ] Created new Facebook app (Business type)
- [ ] Added Facebook Login product
- [ ] Made app Live (or kept in Development - both work)
- [ ] Got User Access Token with 3 pages permissions
- [ ] Got App ID and App Secret
- [ ] Converted User Token to Long-Lived User Token
- [ ] Got Page Access Token using me/accounts
- [ ] Added to .env.local
- [ ] Tested on localhost - connection successful
- [ ] Added to Vercel environment variables
- [ ] Redeployed Vercel
- [ ] Tested on live site - connection successful
- [ ] Tested auto-post - saw post on Facebook Page

---

## What You Need in the End

Just 2 things:

1. **FACEBOOK_PAGE_ID** = A number (example: 123456789012345)
2. **FACEBOOK_PAGE_ACCESS_TOKEN** = A long string starting with EAA...

Both must be in:
- `.env.local` file (for localhost testing)
- Vercel Environment Variables (for live site)

---

## Troubleshooting

### "Can't see pages permissions in popup"

- Make sure you clicked "Get User Access Token" **button**, not dropdown
- The popup should appear with checkboxes
- Type "pages" in the search box to find them

### "Popup doesn't appear"

- Try a different browser (Chrome works best)
- Disable ad blockers
- Make sure you're logged into Facebook

### "Test connection fails on localhost"

- Check .env.local has no extra spaces or quotes
- Check you copied the full token
- Restart dev server after editing .env.local

### "Test connection fails on Vercel"

- Check you added both variables to Vercel
- Check spelling (case-sensitive)
- Make sure you redeployed after adding variables
- Check deployment logs for errors

### "Post appears but no photos"

- Check NEXT_PUBLIC_APP_ORIGIN is set in Vercel
- Check report has both BEFORE and AFTER photos
- Check photos are uploaded correctly

---

That's it! You now have a brand new Facebook app with auto-posting working. Much simpler than fixing an old app! 🚀

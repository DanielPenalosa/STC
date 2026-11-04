# Visual Guide: Adding Facebook Permissions in Graph API Explorer

## What You're Seeing vs What You Need

### Current Screen (What I See in Your Screenshot):
- ✅ You're in Graph API Explorer
- ✅ Meta App: SCOUT is selected
- ✅ User or Page: "Get Token" is shown
- ✅ Permissions tab is visible on the right
- ❌ No permissions added yet

---

## Option 1: Add Permissions in Graph API Explorer (Recommended)

### Step 1: Find "Add a Permission" Dropdown

In your current screen:
1. Look at the right panel where it says "**Permissions**"
2. Below that, you see "**Add a Permission**"
3. Click on the **dropdown arrow** next to "Add a Permission"

### Step 2: Search and Add Each Permission

A dropdown list will appear. For each permission:

**Permission 1:**
1. Type or scroll to find: `pages_show_list`
2. Click on it to add
3. It should appear in your Permissions list

**Permission 2:**
1. Click "Add a Permission" again
2. Type or scroll to: `pages_read_engagement`
3. Click to add

**Permission 3:**
1. Click "Add a Permission" again
2. Type or scroll to: `pages_manage_posts`
3. Click to add

### Step 3: Generate Token

After adding all 3 permissions:
1. Click the blue **"Generate Access Token"** button at the top
2. A popup will ask you to authorize these permissions
3. Click **"Continue"**
4. Click **"OK"** or **"Done"**

---

## Option 2: Enable Pages API First (If Permissions Don't Show Up)

### If you can't find those permissions in the dropdown, you need to add the Pages API product first:

1. **Open a new tab** → Go to: https://developers.facebook.com/apps/
2. Click on your **SCOUT** app
3. In the left sidebar, look for **"App Dashboard"** or **"Products"**
4. Look for **"Add Products"** or **"+ Add Product"**
5. Find these products:
   - **Facebook Login for Business** → Click **"Set Up"**
   - **Pages API** (if available) → Click **"Set Up"**
6. Go through the setup (usually just click "Next" a few times)
7. **Go back to Graph API Explorer** and try again

---

## Option 3: Use Access Token Tool (Alternative Method)

If Graph API Explorer is giving you trouble:

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app: **SCOUT**
3. Click **"Get User Access Token"** button (not dropdown)
4. A popup appears with permission checkboxes
5. Check these boxes:
   - ☑️ `pages_show_list`
   - ☑️ `pages_read_engagement`
   - ☑️ `pages_manage_posts`
6. Click **"Generate Access Token"**

---

## Troubleshooting

### I can't see these permissions in the list

**Cause:** Your app doesn't have Pages API access.

**Solution:**
1. Add Facebook Login for Business product to your app (see Option 2 above)
2. Or create a new app and select **"Business"** type (not "Consumer")

### The dropdown is empty or only shows a few permissions

**Cause:** App type is wrong or Pages API not added.

**Solution:**
1. Check your app type: Apps → Your App → Settings → Basic
2. Should say "App Type: Business"
3. If it says "Consumer", you need to create a new Business app

### I added permissions but they disappeared after generating token

**Cause:** Facebook popup asking for permissions was closed or denied.

**Solution:**
1. Make sure you click "Continue" in the Facebook popup
2. Don't close the popup until you see "Success" or token appears

---

## Visual Checklist

After adding permissions correctly, you should see:

**In Graph API Explorer - Permissions Section:**
```
Permissions
  - pages_show_list         [Remove button]
  - pages_read_engagement   [Remove button]
  - pages_manage_posts      [Remove button]

Add a Permission [Dropdown]
```

**Access Token Field:**
- Should have a long token string starting with "EAA..."

---

## What to Do Right Now

Based on your screenshot:

1. ✅ You're in the right place
2. ⬇️ Click the **"Add a Permission"** dropdown in the Permissions section
3. 🔍 Search for: `pages_show_list`
4. ➕ Click to add it
5. 🔁 Repeat for `pages_read_engagement` and `pages_manage_posts`
6. 🔵 Click "Generate Access Token"

If the dropdown is empty or doesn't show these permissions → Follow **Option 2** to enable Pages API in your app first!

---

## Need More Help?

If you're still stuck:
1. Take a screenshot of what you see in the "Add a Permission" dropdown
2. Or check if your app is a "Business" type app
3. You might need to create a new app as "Business" type to get Pages API access

Good luck! 🚀

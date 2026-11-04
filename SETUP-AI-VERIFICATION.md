# Setup Guide: AI ID Verification with OpenAI

This guide walks you through setting up automatic ID verification so SCOUT can automatically approve or reject user registrations based on their government ID and address.

---

## 📋 What You'll Need

- An OpenAI account (free or paid)
- Access to your `.env.local` file (for local development)
- Access to your Vercel dashboard (for production deployment)

---

## Part 1: Get Your OpenAI API Key

### Step 1: Go to OpenAI Platform
Open your browser and visit: **https://platform.openai.com**

### Step 2: Sign In or Create Account
- If you already have an OpenAI account, click **Sign In**
- If not, click **Sign Up** and create a new account
- You may need to verify your email

### Step 3: Navigate to API Keys
- Once logged in, click on your profile picture (top right)
- Select **View API Keys** from the dropdown
- Or go directly to: **https://platform.openai.com/api-keys**

### Step 4: Create a New API Key
1. Click the **+ Create new secret key** button
2. Give it a name like "SCOUT ID Verification"
3. Click **Create secret key**

### Step 5: Copy Your API Key
- A popup will show your API key (starts with `sk-...`)
- **⚠️ IMPORTANT:** Copy this key immediately - you won't be able to see it again!
- It looks like: `sk-proj-abc123...` (very long string)

**Save this key somewhere safe temporarily** - you'll need it in the next steps.

---

## Part 2: Add API Key to Local Development

This makes the AI verification work on your `localhost`.

### Step 1: Open Your Project in VS Code (or your editor)

### Step 2: Open the `.env.local` File
- It's in the root of your project folder
- Look for this line at the bottom:
  ```
  OPENAI_API_KEY=sk-YOUR_OPENAI_API_KEY_HERE
  ```

### Step 3: Replace the Placeholder
Replace `sk-YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key:

**Before:**
```env
OPENAI_API_KEY=sk-YOUR_OPENAI_API_KEY_HERE
```

**After:**
```env
OPENAI_API_KEY=sk-proj-abc123xyz789...
```
(Use your actual key that you copied)

### Step 4: Save the File
Press `Ctrl+S` (Windows) or `Cmd+S` (Mac)

### Step 5: Restart Your Development Server

**If your server is running:**
1. Go to the terminal where you ran `npm run dev`
2. Press `Ctrl+C` to stop it
3. Run `npm run dev` again

**If it's not running:**
1. Open terminal in your project folder
2. Run:
   ```bash
   npm run dev
   ```

### Step 6: Test It
1. Open http://localhost:3000
2. Register a new test account
3. Upload a government ID photo
4. Wait a few seconds
5. You should see AI verification working (no more "OPENAI_API_KEY not configured" error)

---

## Part 3: Add API Key to Vercel (Production)

This makes the AI verification work on your live deployed website.

### Step 1: Open Vercel Dashboard
Go to: **https://vercel.com/dashboard**

### Step 2: Select Your Project
Click on your SCOUT project (the one you deployed)

### Step 3: Go to Settings
Click the **Settings** tab at the top

### Step 4: Open Environment Variables
- On the left sidebar, click **Environment Variables**

### Step 5: Add the OpenAI API Key
1. Find the form that says "Add New"
2. In the **Key** field, enter exactly:
   ```
   OPENAI_API_KEY
   ```
3. In the **Value** field, paste your OpenAI API key (the one starting with `sk-...`)
4. Make sure **Production**, **Preview**, and **Development** are all checked
5. Click **Save**

### Step 6: Redeploy Your Application
After adding the environment variable, you MUST redeploy:

1. Click the **Deployments** tab at the top
2. Find your latest deployment (the one at the top)
3. Click the **⋮** (three dots) button on the right
4. Click **Redeploy**
5. Confirm by clicking **Redeploy** again

### Step 7: Wait for Deployment
- Vercel will rebuild your application (takes 1-2 minutes)
- Wait for the status to change to "Ready"

### Step 8: Test on Production
1. Open your live website (e.g., `https://stc-tau.vercel.app`)
2. Register a new test account
3. Upload a government ID
4. Wait a few seconds
5. AI verification should now work!

---

## ✅ Verification Checklist

Use this to confirm everything is working:

### Local Development (localhost:3000)
- [ ] `.env.local` file has `OPENAI_API_KEY=sk-...`
- [ ] Development server restarted after adding key
- [ ] Can register new account
- [ ] Can upload ID photo
- [ ] No "OPENAI_API_KEY not configured" error
- [ ] AI verification shows result (passed/needs review/failed)

### Production (Vercel)
- [ ] Vercel has `OPENAI_API_KEY` environment variable
- [ ] Application redeployed after adding variable
- [ ] Live site shows no configuration errors
- [ ] AI verification works for new registrations

---

## 🎯 What Happens After Setup?

Once configured, the AI will:

### ✅ Auto-APPROVE users when:
- ID is clear and readable
- Name matches registration
- **Address shows Sta. Cruz, Laguna**
- **Barangay is one of the 26 official barangays**

### ⚠️ Flag for MANUAL REVIEW when:
- ID quality is poor but readable
- Address is unclear or ambiguous
- Name match is uncertain

### ❌ Auto-REJECT users when:
- No ID document detected
- **Address clearly belongs to another city/province**

---

## 💰 Cost Information

**OpenAI Pricing for GPT-4o-mini:**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Vision (images): $0.15 per 1M tokens

**Estimated cost per ID verification:** ~$0.01 - $0.03 USD

**Example:**
- 100 user registrations ≈ $1-3 USD
- 1,000 user registrations ≈ $10-30 USD

OpenAI gives you **$5 free credits** when you create a new account, which is enough for ~200-500 verifications.

---

## 🔒 Security Notes

### ✅ DO:
- Keep your API key secret
- Never commit `.env.local` to git (it's already in `.gitignore`)
- Use environment variables for both local and production

### ❌ DON'T:
- Share your API key publicly
- Paste your API key in code files
- Commit API keys to GitHub

---

## 🐛 Troubleshooting

### Problem: Still seeing "OPENAI_API_KEY not configured"

**Solution:**
1. Double-check the key is correct (starts with `sk-`)
2. Make sure there are no extra spaces before/after the key
3. Restart your development server
4. For Vercel: make sure you redeployed after adding the variable

### Problem: "Invalid API key"

**Solution:**
1. Go back to OpenAI platform
2. Check if your key is active
3. You may need to add billing information to OpenAI (even for free tier)
4. Create a new API key if the old one doesn't work

### Problem: "Rate limit exceeded"

**Solution:**
1. You've hit OpenAI's free tier limit
2. Wait a few minutes and try again
3. Or add a payment method to OpenAI for higher limits

### Problem: AI always says "needs review"

**Solution:**
1. Check if users are uploading clear, well-lit ID photos
2. Make sure the address on the ID clearly shows "Sta. Cruz, Laguna"
3. This is normal for IDs with unclear text or addresses

---

## 📚 Related Documentation

- [AI-ID-VERIFICATION.md](./AI-ID-VERIFICATION.md) - Full system documentation
- [VERCEL-ENV-SETUP.md](./VERCEL-ENV-SETUP.md) - All environment variables
- OpenAI API Docs: https://platform.openai.com/docs

---

## ✅ You're Done!

Your SCOUT system now has AI-powered automatic ID verification. Users with valid Sta. Cruz, Laguna addresses will be automatically approved, saving you time on manual reviews!

### Next Steps:
1. Test with a few sample IDs
2. Monitor the Admin → Users page to see AI results
3. Manually review any "needs review" cases
4. Adjust settings if needed

**Questions?** Check the troubleshooting section above or review the full documentation in `AI-ID-VERIFICATION.md`.

# Cloudinary Setup — All Photo Storage

Moves **every photo** (report photos + citizen ID photos) from Supabase Storage
to Cloudinary. Free tier: **25 GB storage + 25 GB bandwidth/month** (Supabase
free is 1 GB). The app already supports it — this is just account + env vars.

---

## 1. Create the account (2 min)

1. Go to **cloudinary.com** → **Sign up for free**
2. Sign up with email or Google
3. Skip the onboarding survey — it drops you on the **Dashboard**

## 2. Copy your three keys (1 min)

On the Dashboard **"Getting started"** / **"API Keys"** card you'll see:

| Env var | Where it is on the dashboard |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | **Cloud name** (top of the Product Environment card) |
| `CLOUDINARY_API_KEY` | **API key** |
| `CLOUDINARY_API_SECRET` | **API secret** (click the eye to reveal) |

Keep the secret private — it's server-side only in this app, never shipped to
the browser.

## 3. Local development (1 min)

Add to `.env.local` in the project root:

```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Restart `npm run dev`. Done — new uploads go to Cloudinary.

## 4. Production / Vercel (2 min)

1. **vercel.com** → your **STC** project → **Settings → Environment Variables**
2. Add the same three variables (all environments: Production, Preview, Development)
3. **Deployments tab → ⋯ on the latest deploy → Redeploy** (env vars only apply to new builds)

## 5. Verify it works (2 min)

1. Register a test citizen with an ID photo → **Cloudinary dashboard → Media Library → `stc/ids/…`** shows the ID (stored **private**)
2. Submit a report with a photo → **`stc/pending/…`** in the Media Library
3. Open the report as admin → photo renders (served through `/api/photo`, which reads from Cloudinary)
4. Users & Accounts → **View ID** → renders via a short-lived signed URL

## How it behaves after setup

- **Report photos** → public CDN assets, auto WebP/AVIF, thumbnails served at
  the size the UI needs (160/320/640px) — big bandwidth savings
- **ID photos** → **private "authenticated"** assets; never publicly reachable,
  only admin-viewable through expiring signed URLs. Delete (reject) destroys them
- **Database stays tiny** — each photo is one row with a `cld:<public-id>` marker
- **Old photos keep working** — anything already in Supabase Storage still
  renders; nothing migrates or breaks. Over time new photos simply live on Cloudinary
- **Rollback = remove the env vars** → uploads fall back to Supabase Storage again

## Optional hygiene (later, not required)

- Cloudinary → Settings → **Reserved storage/quota alerts** (email at 80%)
- A **backup folder rule** is unnecessary; the DB holds the public IDs which are
  the source of truth for display

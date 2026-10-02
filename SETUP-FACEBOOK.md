# Facebook Auto-Posting — Setup Guide

SCOUT publishes a **before/after photo post** to the Sta. Cruz Facebook Page
every time an admin approves a report as **Resolved**. This is built in — you
just need to connect the Page once (~15 minutes, free).

> The Page token **does not expire** once set up correctly (follow steps 5–7),
> so you do this exactly one time.

---

## What you need before starting

| Requirement | Notes |
|---|---|
| A Facebook Page | e.g. the official LGU Sta. Cruz page — you must be able to manage it |
| A personal Facebook account | must be an **admin** (or have "Create content" task) on that Page |
| The deployed site | Facebook's servers fetch the photos from `https://stc-tau.vercel.app` |

---

## Step 1 — Create a Meta app

1. Go to **https://developers.facebook.com** and log in with the account that
   manages the Page.
2. Top-right **Get Started → Create App** (or My Apps → Create App).
3. On the **"Add use cases"** screen, select:
   **"Manage everything on your Page"** (the Pages API).
   This one use case bundles exactly the permissions SCOUT needs
   (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`).
   - Do **not** pick "Other" — it is being retired.
   - Skip the ads / Instagram / Messenger / WhatsApp use cases.
4. App name: e.g. `SCOUT Transparency` — your email — **Create app**.
5. You land on the app Dashboard. Leave this tab open — you'll need the
   **App ID** and later the **App Secret** (Dashboard → App settings → Basic).

> No need to add products (like Facebook Login) for this setup — the Graph
> API Explorer tool handles token generation for you.

## Step 2 — Generate a short-lived user token (Graph API Explorer)

1. Open **https://developers.facebook.com/tools/explorer**.
2. Top-right **"Facebook App"** dropdown → select your new app
   (`SCOUT Transparency`).
3. Next to it, open the **permissions** dropdown (or click
   **"Add a Permission"**) and add **all three**:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
4. Click **Generate Access Token** → Facebook asks you to log in and approve.
   - The dialog warns the app is in **Development Mode** and asks to skip
     permission validation — click **OK / Continue**.
   - Important: when choosing which Pages to grant, tick the **Sta. Cruz page**.
5. You now have a **User Access Token** in the box (valid ~1 hour). Copy it —
   we only use it for a minute to mint the permanent Page token.

## Step 3 — Extend the user token to 60 days

You need your **App ID** and **App Secret**
(Dashboard → App settings → Basic → App Secret → copy).

Run this in any terminal (or paste the URL in a browser — replace the two
`<>` values and `<USER_TOKEN>`):

```
https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<USER_TOKEN>
```

The response is a JSON like:

```json
{"access_token":"EAA...long...","token_type":"bearer","expires_in":5183944}
```

Copy that new `access_token` — this is the **long-lived user token**.

> Windows tip: open the URL in a browser tab; the JSON shows as plain text.

## Step 4 — Mint the permanent PAGE token

Paste this URL in a browser (replace `<LONG_LIVED_USER_TOKEN>`):

```
https://graph.facebook.com/v21.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>
```

The response lists every Page you manage:

```json
{
  "data": [
    {
      "access_token": "EAA...this_one_never_expires...",
      "name": "Sta. Cruz, Laguna — Official",
      "id": "123456789012345",
      ...
    }
  ]
}
```

Copy **two values from the Sta. Cruz entry**:

1. `access_token` → this is your **Page Access Token** (never expires)
2. `id` → this is your **Page ID**

> A Page token obtained this way (from a long-lived user token) **never
> expires** as long as the app stays installed on the Page — no cron jobs,
> no renewals.

## Step 5 — Set the environment variables in Vercel

Go to **vercel.com → your project → Settings → Environment Variables** and
add these three (for *Production*, *Preview*, and *Development*):

| Name | Value |
|---|---|
| `FACEBOOK_PAGE_ID` | the `id` from Step 4 |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | the `access_token` from Step 4 |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://stc-tau.vercel.app` |

> `NEXT_PUBLIC_APP_ORIGIN` matters: Facebook's servers download the before /
> after photos from `{origin}/api/photo?...`. If it's wrong, photo posts fail
> (the report still resolves fine — posting is best-effort).

For local testing, add the same three to `.env.local` instead.

## Step 6 — Redeploy

- Vercel: **Deployments → Redeploy** (env vars only apply to new builds).
- Local: restart `npm run dev`.

## Step 7 — Verify the connection

1. Sign in as **admin** → **Settings**.
2. Scroll to **"Facebook Page auto-posting"** → click **Test connection**.
3. You should see: **Connected to "Sta. Cruz, Laguna — Official" — auto-posting is live.**

### Test end-to-end

1. Resolve any test report (Reports → open one → Approve & Resolve).
2. Within a few seconds, check the Page's feed — the post appears with the
   BEFORE and AFTER photos and the caption (ref code + barangay).
3. While the app is in Development Mode, the post is only visible to people
   with a role on the app (you). It **does** appear on the Page's timeline
   for you — that's normal.

## Step 8 — (Before go-live) App Review

While in Development mode, published posts are only visible to app admins.
To make them visible to everyone:

1. developers.facebook.com → your app → **App Review → Permissions and
   Features**.
2. Request **`pages_manage_posts`** and **`pages_read_engagement`**.
3. Meta asks for a short explanation + screencast. For this thesis use:
   *"SCOUT is a civic reporting system for the Municipality of Sta. Cruz,
   Laguna. The app automatically publishes before/after photos of completed
   public works to the municipality's Facebook Page for community
   transparency. The Page token belongs to the LGU's official page."*
4. Also fill **App settings → Basic**: privacy policy URL, app icon, category
   (Government & Politics works). App Review requires them.

The app stays fully functional during review; only *public* visibility of
the posts waits for approval.

---

## What gets posted

```
✅ RESOLVED — Broken streetlight along Rizal Ave
📍 Brgy. Gatid · Electricity & Utilities

The streetlight at the corner of Rizal Ave has been flickering and
completely dark at night for two weeks, making the sidewalk unsafe.

📅 Reported: Sep 28, 2026
🛠️ Resolved: Oct 2, 2026

Ref: RPT-0042 · SCOUT — Sta. Cruz Community Observation and Unified Triage
#SCOUT #StaCruzLaguna #Transparency
```

- The **image** is ONE side-by-side photo: BEFORE (left) and AFTER (right),
  each with a blue SCOUT label band — rendered by Facebook as a single card.
- The **caption** carries the report description (the situation), the dates
  reported and resolved, the barangay, category, and ref code.
- If composition fails, the older album-style post (both photos attached)
  is used; with one photo a plain photo posts; with none, a text status.
- Posting never blocks or fails the admin's approval action — errors are
  logged server-side only.

---

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| Test connection says "Not configured" | Env vars missing on THIS deployment → re-add and **redeploy** |
| `Error validating access token: Session has expired` | You used the short-lived user token, not the Page token → redo Steps 3–4 |
| `(#200) Permissions error` / `requires pages_manage_posts` | Token lacks the permission, or it's a user token — redo Step 2 (tick the Page!) and Step 4 |
| Post appears but photos missing | `NEXT_PUBLIC_APP_ORIGIN` wrong, or photos belong to a non-resolved report → check Step 5; only resolved reports' photos are public |
| `(#100) ... attached_media` | Older Graph quirk — make sure `v21.0` is being used (it is, hardcoded in `lib/facebook.ts`) |
| Nothing appears at all | Check Vercel → Deployments → Runtime Logs for `[facebook] auto-post failed:` |
| Posts visible only to you | App still in Development Mode → Step 8 |
| Token stopped working after months | The app was removed from the Page (Page settings → Apps), or the Page admin regenerated app roles → redo Steps 2–4 |

---

## Files involved

- [lib/facebook.ts](lib/facebook.ts) — Graph API client (token check, photo post)
- [app/actions/admin.ts](app/actions/admin.ts) — fires the post when status → `resolved`
- [app/dashboard/settings/facebook-card.tsx](app/dashboard/settings/facebook-card.tsx) — admin test UI
- [app/api/photo/route.ts](app/api/photo/route.ts) — public photo proxy Facebook fetches from

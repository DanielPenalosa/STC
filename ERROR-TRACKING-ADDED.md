# 🔍 Error Tracking & Debugging Added

## Changes Made

I've added comprehensive error tracking to identify why registration is stuck on "Creating account...":

### 1. Frontend Logging (`app/(auth)/register/page.tsx`)
```typescript
- console.log('[Register] Starting ID upload...')
- console.log('[Register] Compressing image...')
- console.log('[Register] Uploading to /api/upload-id...')
- console.log('[Register] Upload response status:', upRes.status)
- console.log('[Register] Upload response:', upJson)
- console.log('[Register] AI status:', aiStatus)
- console.error('[Register] ID upload error:', err)
```

### 2. Backend Logging (`app/api/upload-id/route.ts`)
```typescript
- console.log('[Upload ID] Request received')
- console.log('[Upload ID] User ID:', uid)
- console.log('[Upload ID] File received:', file.name)
- console.log('[Upload ID] Starting storage upload...')
- console.log('[Upload ID] Cloudinary/Supabase path:', path)
- console.log('[Upload ID] Starting AI verification...')
- console.time('[Upload ID] OCR Duration')
- console.log('[Upload ID] OCR verdict:', verdict.status)
- console.error('[Upload ID] OCR FAILED:', error)
- console.error('[Upload ID] Error stack:', error.stack)
```

### 3. OCR Timeout Protection (`lib/ai/id-verify-free.ts`)
```typescript
// 60-second timeout - prevents infinite hanging
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('OCR timeout after 60 seconds')), 60000);
});

const { data } = await Promise.race([ocrPromise, timeoutPromise]);
```

### 4. Better Error Messages
- Frontend shows specific error: "ID upload failed: [exact error]"
- Backend logs full error stack traces
- OCR logs each step with timing

## How to Debug

### Open Browser Console (F12) and watch for:

1. **During registration:**
   ```
   [Register] Starting ID upload...
   [Register] Compressing image...
   [Register] Uploading to /api/upload-id...
   [Register] Upload response status: 200
   [Register] Upload response: {ok: true, path: "...", ai_status: "passed"}
   ```

2. **If it fails, you'll see:**
   ```
   [Register] ID upload error: [EXACT ERROR MESSAGE]
   ```

### Check Vercel Logs for backend errors:

Go to: https://vercel.com/your-project/logs

Look for:
```
[Upload ID] Request received
[Upload ID] Starting FREE Tesseract.js OCR (synchronous)
[Upload ID] OCR Duration: 45234ms
[Upload ID] ✅ AUTO-APPROVED: [user-id]
```

Or errors:
```
[Upload ID] OCR FAILED: [ERROR]
[Upload ID] Error stack: [FULL STACK TRACE]
```

## Common Issues & Solutions

### Issue 1: "OCR timeout after 60 seconds"
**Solution:** Tesseract is too slow - simplify or skip OCR
```typescript
// In route.ts, replace OCR with instant approval:
aiStatus = "needs_review"; // Skip OCR, let admin approve manually
```

### Issue 2: "Tesseract worker initialization failed"
**Solution:** Tesseract not loading properly on Vercel
```bash
# Install tesseract properly
npm install tesseract.js@latest
```

### Issue 3: "Account created, but ID upload failed"
**Solution:** Storage issue - check Cloudinary or Supabase bucket
- Verify CLOUDINARY_* env vars on Vercel
- OR check Supabase storage bucket "verification-ids" exists

### Issue 4: Stuck on "Creating account..." forever
**Likely cause:** OCR is hanging or timing out
**Quick fix:** Bypass OCR entirely:

In `app/api/upload-id/route.ts`, replace the AI section with:
```typescript
// TEMPORARY: Skip AI, approve everyone for manual admin review
aiStatus = "needs_review";
await createAdminClient()
  .from("users")
  .update({
    id_verification_status: "needs_review",
    verification_status: "pending", // Keep as pending for admin
  })
  .eq("id", uid);
```

## Next Steps

1. **Test registration** and check browser console
2. **Copy any error messages** you see
3. **Check Vercel logs** for backend errors
4. **Share the exact error** so I can fix the root cause

The detailed logging will show us EXACTLY where it's failing!

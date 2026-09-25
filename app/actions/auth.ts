"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/app/actions/reports";

export type RegisterCitizenInput = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
};

export type RegisterCitizenResult = ActionResult & {
  /** True when Supabase email confirmation is ON — the user must confirm before signing in. */
  emailConfirmationRequired?: boolean;
};

/**
 * Citizen registration — every citizen uploads one valid government-issued or
 * locally recognized ID (photo only). The photo is uploaded CLIENT-SIDE to a
 * PRIVATE storage bucket (readable only by admins); the account starts
 * `verification_status=pending` and cannot submit reports until an admin
 * verifies it.
 *
 * Note: the photo itself never passes through a server action — Next.js caps
 * server-action request bodies at ~1 MB, so the file goes straight from the
 * browser to Supabase Storage.
 */
export async function registerCitizen(
  input: RegisterCitizenInput
): Promise<RegisterCitizenResult> {
  const supabase = await createClient();

  if (!input.fullName.trim()) return { ok: false, error: "Full name is required." };
  if (input.password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone,
      },
    },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit")) {
      return {
        ok: false,
        error:
          "Sign-up is temporarily rate-limited by Supabase because too many confirmation emails were sent. Wait about an hour and try again — or fix it permanently: Supabase Dashboard → Authentication → Sign In / Providers → Email → turn OFF \"Confirm email\" (recommended for this system).",
      };
    }
    if (msg.includes("already registered")) {
      return { ok: false, error: "An account with this email already exists — sign in instead." };
    }
    return { ok: false, error: error.message };
  }
  if (!data.user) return { ok: false, error: "Registration failed — try again." };

  // Write the profile fields DIRECTLY with the service role, so name, email
  // and phone are saved even when the live database's on-signup trigger is
  // missing or an older version (the trigger remains as a fast path when
  // correct). Upsert to survive a failed/absent trigger row.
  const admin = createAdminClient();
  const { error: profileErr } = await admin.from("users").upsert({
    id: data.user.id,
    email: input.email.trim().toLowerCase(),
    full_name: input.fullName.trim(),
    phone: input.phone.trim() || null,
    role: "citizen",
  });
  if (profileErr) {
    // the auth account exists — surface a precise, actionable error
    return {
      ok: false,
      error: `Account created but the profile could not be saved (${profileErr.message}). Contact the administrator.`,
    };
  }

  // mark the account as awaiting verification (service role — no session yet
  // when email confirmation is on; columns are admin-locked afterwards)
  await admin
    .from("users")
    .update({ verification_status: "pending" })
    .eq("id", data.user.id);

  // Email confirmation enabled: no session yet — the citizen must confirm
  // via the email Supabase sent, then sign in.
  if (!data.session) {
    return { ok: true, emailConfirmationRequired: true, reportId: data.user.id };
  }

  return { ok: true, reportId: data.user.id };
}

/**
 * Record the storage path of the citizen's uploaded ID photo.
 * The actual file upload happens in /api/upload-id (service-role write);
 * this small server action just saves the reference. Like the upload, the
 * write uses the service role AFTER validating the caller's session and
 * path ownership — so a missing/drifted RLS policy can never silently drop
 * the reference.
 */
export async function saveIdPhotoPath(path: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in." };

  // only accept paths that point at the caller's own ID, in either storage
  // layout: Cloudinary returns "cld:stc/ids/<uid>/...", Supabase Storage
  // returns "<uid>/..." (the upload route /api/upload-id enforces the same
  // ownership rule before any write, this is the second gate)
  const uid = auth.user.id;
  const ownsCloudinary = path.startsWith(`cld:stc/ids/${uid}/`);
  const ownsSupabase = path.startsWith(`${uid}/`);
  if (!ownsCloudinary && !ownsSupabase) {
    return { ok: false, error: "Invalid ID photo path." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ id_photo_path: path })
    .eq("id", auth.user.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

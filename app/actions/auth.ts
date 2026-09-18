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

  // mark the account as awaiting verification. Uses the service-role client so
  // this works even when email confirmation is ON and no session exists yet.
  // (verification columns are admin-locked afterwards by the DB trigger)
  const admin = createAdminClient();
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
 * The actual file upload happens in the browser (no size limits); this small
 * server action just saves the reference. Owners may set their own path while
 * verification is still pending or rejected — the DB trigger locks it once
 * verified.
 */
export async function saveIdPhotoPath(path: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in." };

  // only accept paths inside the caller's own folder
  if (!path.startsWith(`${auth.user.id}/`))
    return { ok: false, error: "Invalid ID photo path." };

  const { error } = await supabase
    .from("users")
    .update({ id_photo_path: path })
    .eq("id", auth.user.id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

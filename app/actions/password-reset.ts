"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPasswordResetCode } from "@/lib/email";

/**
 * Generate a 6-digit code, store it in password_reset_codes table,
 * and send it to the citizen's email via Gmail SMTP.
 */
export async function sendResetCode(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createAdminClient();

    // Check the email exists in auth.users — never reveal if it doesn't
    const { data: users } = await db.auth.admin.listUsers();
    const exists = users?.users?.some((u) => u.email === email);
    if (!exists) {
      // silent success — don't reveal whether account exists
      return { ok: true };
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Store in DB — upsert so resend replaces old code
    await db.from("password_reset_codes").upsert(
      { email, code, expires_at: expiresAt },
      { onConflict: "email" }
    );

    // Send via our own Gmail SMTP
    try {
      await sendPasswordResetCode({ to: email, code });
    } catch (emailErr) {
      console.error("[reset] sendPasswordResetCode failed:", emailErr);
      // If email config is missing, this will throw "Email not configured"
      const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      if (errMsg.includes("Email not configured")) {
        return { ok: false, error: "Email service is not configured. Contact support." };
      }
      return { ok: false, error: "Failed to send code. Try again." };
    }

    return { ok: true };
  } catch (e) {
    console.error("[reset] sendResetCode failed:", e);
    return { ok: false, error: "Failed to send code. Try again." };
  }
}

/**
 * Verify the 6-digit code only — does NOT change the password yet.
 */
export async function verifyResetCode(
  email: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createAdminClient();
    const { data: row } = await db
      .from("password_reset_codes")
      .select("code, expires_at")
      .eq("email", email)
      .maybeSingle();

    if (!row) return { ok: false, error: "Invalid or expired code." };
    if (new Date(row.expires_at) < new Date()) {
      return { ok: false, error: "Code has expired. Request a new one." };
    }
    if (row.code !== code.trim()) {
      return { ok: false, error: "Incorrect code. Try again." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[reset] verifyResetCode failed:", e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/**
 * Set a new password after the code has been verified.
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createAdminClient();

    // Re-verify code before applying password change
    const { data: row } = await db
      .from("password_reset_codes")
      .select("code, expires_at")
      .eq("email", email)
      .maybeSingle();

    if (!row || row.code !== code.trim() || new Date(row.expires_at) < new Date()) {
      return { ok: false, error: "Code is invalid or expired. Start over." };
    }

    const { data: users } = await db.auth.admin.listUsers();
    const user = users?.users?.find((u) => u.email === email);
    if (!user) return { ok: false, error: "Account not found." };

    const { error: updateErr } = await db.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateErr) return { ok: false, error: updateErr.message };

    // Delete the used code
    await db.from("password_reset_codes").delete().eq("email", email);
    return { ok: true };
  } catch (e) {
    console.error("[reset] resetPassword failed:", e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

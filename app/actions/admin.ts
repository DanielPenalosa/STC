"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanupReportPhotos } from "@/lib/storage/cleanup";
import { requireProfile } from "@/lib/data";
import type { ReportStatus } from "@/lib/constants";
import type {
  Barangay,
  Category,
  Department,
  Profile,
} from "@/lib/types";

export type ActionResult = { ok: boolean; error?: string; userId?: string };

async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw new Error("Admins only");
  return profile;
}

/* ------------------------------ staff account creation (admin only) ------------------------------ */

/**
 * Create a department or barangay staff account. Staff accounts can ONLY be
 * created here by an admin — public registration always yields citizens
 * (enforced again by the DB trigger `handle_new_user`).
 */
export async function createStaffAccount(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  role: "department" | "barangay" | "admin";
  departmentId?: string | null;
  barangayId?: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();

  if (input.role !== "admin" && !input.departmentId && !input.barangayId) {
    return { ok: false, error: "Select the department or barangay this account belongs to." };
  }

  // 1. create the auth user (service role bypasses email confirmation);
  //    the on_auth_user_created trigger reads role/department/barangay from metadata
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      phone: input.phone ?? "",
      role: input.role,
      department_id: input.departmentId ?? "",
      barangay_id: input.barangayId ?? "",
    },
  });
  if (error) return { ok: false, error: error.message };
  const userId = data.user.id;

  // 2. belt-and-braces: ensure the profile row matches the request
  const patch: Record<string, unknown> = {
    full_name: input.fullName,
    phone: input.phone ?? null,
    role: input.role,
  };
  if (input.role === "department") patch.department_id = input.departmentId ?? null;
  if (input.role === "barangay") patch.barangay_id = input.barangayId ?? null;

  const admin2 = createAdminClient();
  const { error: pError } = await admin2
    .from("users")
    .update(patch)
    .eq("id", userId);

  if (pError) {
    // roll the auth user back so a failed creation doesn't leave orphans
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: pError.message };
  }

  revalidatePath("/dashboard/users");
 return { ok: true, userId };
}

/* ------------------------------ reports ------------------------------ */

export async function setReportStatus(
  reportId: string,
  status: ReportStatus,
  note?: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/reports");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function setPriority(
  reportId: string,
  priority: 1 | 2 | 3 | 4 | 5
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ priority })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/reports");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function verifyReport(reportId: string): Promise<ActionResult> {
  return setReportStatus(reportId, "verified");
}

/**
 * Lifecycle v2 verification step — the department marked the report Done
 * with a completion photo; the admin either:
 *  - approves  → status Resolved (trigger notifies citizen + followers)
 *  - sends back → status In Progress (trigger notifies the department)
 */
export async function approveCompletion(
  reportId: string,
  note?: string
): Promise<ActionResult> {
  return setReportStatus(reportId, "resolved", note);
}

export async function requestRevision(
  reportId: string,
  note: string
): Promise<ActionResult> {
  if (!note.trim()) {
    return { ok: false, error: "Tell the department what needs fixing." };
  }
  return setReportStatus(reportId, "in_progress", `Revision requested: ${note.trim()}`);
}

export async function rejectReport(
  reportId: string,
  reason: string
): Promise<ActionResult> {
  if (!reason.trim()) {
    return { ok: false, error: "Give the citizen a reason." };
  }
  return setReportStatus(reportId, "rejected", `Rejected: ${reason.trim()}`);
}

export async function deleteReport(reportId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  await cleanupReportPhotos(reportId); // best-effort storage/CDN cleanup first
  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/reports");
  return { ok: true };
}

export async function assignReport(
  reportId: string,
  assignedType: "department" | "barangay",
  targetId: string,
  note?: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { error: aError } = await supabase.from("assignments").insert({
    report_id: reportId,
    assigned_type: assignedType,
    department_id: assignedType === "department" ? targetId : null,
    barangay_id: assignedType === "barangay" ? targetId : null,
    assigned_by: admin.id,
    note: note ?? null,
  });
  if (aError) return { ok: false, error: aError.message };

  const patch: Record<string, string> = { status: "assigned" };
  if (assignedType === "department") patch.department_id = targetId;
  else patch.barangay_id = targetId;

  const { error: rError } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId);
  if (rError) return { ok: false, error: rError.message };

  // notify the assignee side (department/barangay staff accounts)
  const col = assignedType === "department" ? "department_id" : "barangay_id";
  const { data: staff } = await supabase
    .from("users")
    .select("id")
    .eq("role", assignedType)
    .eq(col, targetId);
  if (staff?.length) {
    const { data: rep } = await supabase
      .from("reports")
      .select("ref_code, title")
      .eq("id", reportId)
      .maybeSingle();
    await supabase.from("notifications").insert(
      (staff as { id: string }[]).map((s) => ({
        user_id: s.id,
        report_id: reportId,
        title: `New report assigned — ${rep?.ref_code ?? ""}`,
        body: `You have a new assigned report: ${rep?.title ?? ""}`,
        type: "assignment",
      }))
    );
  }

  revalidatePath("/dashboard/reports");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function reassignReport(
  reportId: string,
  assignedType: "department" | "barangay",
  targetId: string,
  note?: string
): Promise<ActionResult> {
  return assignReport(reportId, assignedType, targetId, note ?? "Reassigned");
}

/* ------------------------------ AI ------------------------------ */

/**
 * Dismiss the possible-duplicate flag on a report — an admin has reviewed
 * the evidence and decided it's a distinct issue.
 */
export async function dismissDuplicateFlag(reportId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ is_possible_duplicate: false })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/reports");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

/**
 * Mark `reportId` as a duplicate of `originalId`: close it with a note
 * pointing at the original and remove the flag. The original keeps
 * receiving updates; reporters of the closed copy are pointed there.
 */
export async function markAsDuplicate(
  reportId: string,
  originalId: string
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  if (reportId === originalId)
    return { ok: false, error: "A report cannot be a duplicate of itself." };

  const { data: original } = await supabase
    .from("reports")
    .select("ref_code, title")
    .eq("id", originalId)
    .maybeSingle();
  if (!original) return { ok: false, error: "Original report not found." };

  // close the copy with an explanatory note (records status history + notifies)
  const { error: upErr } = await supabase
    .from("reports")
    .update({ status: "closed", is_possible_duplicate: false })
    .eq("id", reportId);
  if (upErr) return { ok: false, error: upErr.message };

  await supabase.from("status_history").insert({
    report_id: reportId,
    from_status: "submitted",
    to_status: "closed",
    note: `Marked as duplicate of ${original.ref_code} — "${original.title}".`,
  });

  revalidatePath("/dashboard/reports");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/reports/${originalId}`);
  return { ok: true };
}

export async function overrideAi(
  reportId: string,
  patch: {
    categoryId?: string | null;
    departmentId?: string | null;
    barangayId?: string | null;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({
      ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
      ...(patch.departmentId !== undefined ? { department_id: patch.departmentId } : {}),
      ...(patch.barangayId !== undefined ? { barangay_id: patch.barangayId } : {}),
    })
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  // record the admin's decision on the AI recommendation
  await supabase
    .from("ai_analysis")
    .update({
      status: "reviewed",
      admin_decision: "overridden",
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
    })
    .eq("report_id", reportId)
    .in("status", ["completed", "low_confidence", "pending"]);

  revalidatePath("/dashboard/ai");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function acceptAiSuggestion(reportId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: ai } = await supabase
    .from("ai_analysis")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ai) return { ok: false, error: "No AI analysis found for this report" };
  const a = ai as Record<string, string | null>;

  const patch: Record<string, string | null> = {};
  if (a.suggested_category_id) patch.category_id = a.suggested_category_id;
  if (a.suggested_department_id) patch.department_id = a.suggested_department_id;
  if (a.suggested_barangay_id) patch.barangay_id = a.suggested_barangay_id;

  // fallback: if the AI row predates the mapping flow, fill the department
  // from the category's configurable default when the report has none
  if (!patch.department_id && patch.category_id) {
    const { data: cat } = await supabase
      .from("categories")
      .select("default_department_id")
      .eq("id", patch.category_id)
      .maybeSingle();
    const { data: report } = await supabase
      .from("reports")
      .select("department_id")
      .eq("id", reportId)
      .maybeSingle();
    if (cat?.default_department_id && !report?.department_id) {
      patch.department_id = cat.default_department_id;
    }
  }

  const { error } = await supabase
    .from("reports")
    .update(patch)
    .eq("id", reportId);
  if (error) return { ok: false, error: error.message };

  // record the admin's decision on the AI recommendation
  await supabase
    .from("ai_analysis")
    .update({
      status: "reviewed",
      admin_decision: "accepted",
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
    })
    .eq("report_id", reportId);

  revalidatePath("/dashboard/ai");
  revalidatePath(`/reports/${reportId}`);
  return { ok: true };
}

export async function markAiReviewed(reportId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("ai_analysis")
    .update({
      status: "reviewed",
      admin_decision: "manual",
      decided_by: admin.id,
      decided_at: new Date().toISOString(),
    })
    .eq("report_id", reportId);
  revalidatePath("/dashboard/ai");
  return { ok: true };
}

/* ------------------------------ categories / barangays / departments ------------------------------ */

export async function saveCategory(input: {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  color?: string;
  icon?: string;
  is_active?: boolean;
  default_department_id?: string | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: input.name,
    slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    description: input.description || null,
    color: input.color || "#64748b",
    icon: input.icon || "📋",
    is_active: input.is_active ?? true,
    default_department_id: input.default_department_id ?? null,
  };
  const { error } = input.id
    ? await supabase.from("categories").update(row).eq("id", input.id)
    : await supabase.from("categories").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/categories");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/categories");
  return { ok: true };
}

export async function saveBarangay(input: {
  id?: string;
  name: string;
  description?: string;
  captain_name?: string;
  contact_number?: string;
  center_lat?: number | null;
  center_lng?: number | null;
  is_active?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: input.name,
    description: input.description || null,
    captain_name: input.captain_name || null,
    contact_number: input.contact_number || null,
    center_lat: input.center_lat ?? null,
    center_lng: input.center_lng ?? null,
    is_active: input.is_active ?? true,
  };
  const { error } = input.id
    ? await supabase.from("barangays").update(row).eq("id", input.id)
    : await supabase.from("barangays").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/barangays");
  return { ok: true };
}

export async function deleteBarangay(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("barangays").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/barangays");
  return { ok: true };
}

export async function saveDepartment(input: {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  head_name?: string;
  contact_number?: string;
  color?: string;
  is_active?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: input.name,
    slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    description: input.description || null,
    head_name: input.head_name || null,
    contact_number: input.contact_number || null,
    color: input.color || "#2333A0",
    is_active: input.is_active ?? true,
  };
  const { error } = input.id
    ? await supabase.from("departments").update(row).eq("id", input.id)
    : await supabase.from("departments").insert(row);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/departments");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/departments");
  return { ok: true };
}

/* ------------------------------ users ------------------------------ */

export async function verifyCitizen(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: admin.id,
      rejection_reason: null,
    })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("notifications").insert({
    user_id: userId,
    title: "Registration approved",
    body: "Welcome! Your account is approved — you can now sign in and submit reports.",
    type: "status_change",
  });
  revalidatePath("/dashboard/verification");
  revalidatePath("/dashboard/users");
  return { ok: true };
}

/**
 * Remove a citizen's registration completely: the auth account, the profile
 * row (FK cascade removes their notifications and other references), the
 * uploaded ID photo from storage, and the admins' "pending approval"
 * notifications about them. Used for REJECTED registrations — the applicant
 * can re-register cleanly with the same email if they fix their ID.
 */
async function purgeRegistration(userId: string): Promise<ActionResult> {
  const adminClient = createAdminClient();

  // 1. grab the ID path before the profile row disappears
  const { data: row } = await adminClient
    .from("users")
    .select("id_photo_path, verification_status")
    .eq("id", userId)
    .maybeSingle();
  const idPath = (row as { id_photo_path?: string | null } | null)?.id_photo_path ?? null;

  // 2. delete the auth user (cascades: users row, notifications, etc.)
  const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authErr) {
    // auth user may already be gone (legacy row) — fall back to profile delete
    const { error: profErr } = await adminClient.from("users").delete().eq("id", userId);
    if (profErr) return { ok: false, error: profErr.message };
  }

  // 3. best-effort: remove the ID photo from its storage backend
  if (idPath) {
    if (idPath.startsWith("cld:")) {
      const { cloudinaryDestroy } = await import("@/lib/storage/cloudinary");
      await cloudinaryDestroy(idPath);
    } else {
      await adminClient.storage.from("verification-ids").remove([idPath]).catch(() => {});
    }
  }

  // 4. clean up the admins' "new registration" notifications for this user
  //    (auth cascade removes the applicant's own notifications; these point
  //    AT them from admins and survive)
  await adminClient
    .from("notifications")
    .delete()
    .eq("type", "registration")
    .ilike("body", `%${userId}%`);

  return { ok: true };
}

export async function rejectCitizen(
  userId: string,
  reason: string
): Promise<ActionResult> {
  await requireAdmin();

  // rejected registrations are removed entirely — the applicant sees the
  // rejection reason at sign-in until the account is gone, then can simply
  // re-register with a valid ID
  return purgeRegistration(userId);
}

/** Signed URL for a citizen's ID photo — admins only, short-lived. */
export async function getIdPhotoUrl(
  path: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("verification-ids")
    .createSignedUrl(path, 300);
  if (error || !data) return { ok: false, error: error?.message ?? "No URL" };
  return { ok: true, url: data.signedUrl };
}

export async function saveUserRole(
  userId: string,
  role: "citizen" | "admin" | "department" | "barangay",
  departmentId?: string | null,
  barangayId?: string | null,
  isActive?: boolean
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { role };
  if (departmentId !== undefined) patch.department_id = departmentId;
  if (barangayId !== undefined) patch.barangay_id = barangayId;
  if (isActive !== undefined) patch.is_active = isActive;
  const { error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}

export type BulkUserAction =
  | "approve"
  | "reject"
  | "suspend"
  | "restore"
  | "delete";

/**
 * Apply a bulk action to many users at once (Users & Accounts checkboxes).
 *
 * Safety rails:
 *  - the acting admin is always skipped (can't suspend/delete themselves)
 *  - delete removes the auth user via service role (cascades the profile
 *    through the FK), plus the profile row for legacy data
 *  - every action notifies the affected citizen where it makes sense
 */
export async function bulkUserAction(
  userIds: string[],
  action: BulkUserAction,
  reason = ""
): Promise<ActionResult & { affected?: number }> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const ids = userIds.filter((id) => id !== admin.id); // never act on self
  if (ids.length === 0) return { ok: false, error: "No selectable users in that set." };

  if (action === "approve") {
    const { error } = await supabase
      .from("users")
      .update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: admin.id,
        rejection_reason: null,
      })
      .in("id", ids);
    if (error) return { ok: false, error: error.message };

    await supabase.from("notifications").insert(
      ids.map((id) => ({
        user_id: id,
        title: "Registration approved",
        body: "Welcome! Your account is approved — you can now sign in and submit reports.",
        type: "status_change",
      }))
    );
  } else if (action === "reject") {
    // bulk reject = full removal, same as the single reject action
    for (const id of ids) {
      const res = await purgeRegistration(id);
      if (!res.ok) return res;
    }
  } else if (action === "suspend" || action === "restore") {
    const { error } = await supabase
      .from("users")
      .update({ is_active: action === "restore" })
      .in("id", ids);
    if (error) return { ok: false, error: error.message };
  } else if (action === "delete") {
    // delete auth users first (cascades to profiles via FK) using service role
    const adminClient = createAdminClient();
    for (const id of ids) {
      const { error: authErr } = await adminClient.auth.admin.deleteUser(id);
      if (authErr) {
        // auth user may not exist (legacy row) — fall back to profile delete
        const { error: profErr } = await supabase.from("users").delete().eq("id", id);
        if (profErr) return { ok: false, error: profErr.message };
      }
    }
  }

  revalidatePath("/dashboard/users");
  return { ok: true, affected: ids.length };
}

/* ------------------------------ notifications ------------------------------ */

export async function notifyAdminsOfUrgent(
  reportId: string,
  refCode: string,
  title: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const profile = await requireProfile();
  if (profile.role !== "citizen") return { ok: false };

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin");

  if (admins?.length) {
    await supabase.from("notifications").insert(
      (admins as { id: string }[]).map((a) => ({
        user_id: a.id,
        report_id: reportId,
        title: `Urgent report — ${refCode}`,
        body: title,
        type: "urgent",
      }))
    );
  }
  return { ok: true };
}

/* ------------------------------ settings ------------------------------ */

export async function saveSettings(
  entries: { key: string; value: string }[]
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  for (const e of entries) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: e.key, value: e.value });
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

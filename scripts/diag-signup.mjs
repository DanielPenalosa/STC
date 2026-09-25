/**
 * One-off diagnostic for "Database error saving new user".
 * Checks the roles seed + recent profiles, then reproduces the citizen
 * signup through the same auth path (which fires handle_new_user).
 * Creates and immediately deletes a throwaway auth user.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// minimal .env.local loader (dotenv isn't a project dependency)
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) {
    process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. roles seed present?
const { data: roles, error: rolesErr } = await admin.from("roles").select("id");
console.log("roles:", rolesErr ? `ERROR ${rolesErr.message}` : (roles ?? []).map((r) => r.id).join(", ") || "(none!)");

// 2. do recent profiles exist (i.e. has signup ever worked)?
const { data: recent, error: recentErr } = await admin
  .from("users")
  .select("id, email, role, created_at")
  .order("created_at", { ascending: false })
  .limit(5);
console.log(
  "recent profiles:",
  recentErr ? `ERROR ${recentErr.message}` : (recent ?? []).map((r) => `${r.email}(${r.role})`).join(", ") || "(none)"
);

// 3. reproduce signup the same way the register form does (anon client)
const anon = createClient(url, anonKey);
const testEmail = `diag-${Date.now()}@example.com`;
const { data: signed, error: signErr } = await anon.auth.signUp({
  email: testEmail,
  password: "diagtest1234",
  options: { data: { full_name: "Diag Test", phone: "" } },
});
console.log("signup:", signErr ? `ERROR ${signErr.status} ${signErr.message}` : `ok (user ${signed.user?.id ?? "?"})`);

// 4. did the trigger create the profile?
if (signed.user?.id) {
  await new Promise((r) => setTimeout(r, 1500));
  const { data: prof, error: profErr } = await admin
    .from("users")
    .select("id, role, full_name")
    .eq("id", signed.user.id)
    .maybeSingle();
  console.log("trigger profile:", profErr ? `ERROR ${profErr.message}` : prof ? "created ✓" : "MISSING (trigger failed silently)");
  // cleanup the throwaway user
  await admin.auth.admin.deleteUser(signed.user.id);
  console.log("cleanup: test user deleted");
}

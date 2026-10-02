/**
 * One-off: list every account in the SCOUT system (auth user + profile role).
 * Reads keys from .env.local. Passwords are NOT retrievable (bcrypt-hashed).
 *
 * Usage: node scripts/list-accounts.mjs
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const auth = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers })
  .then((r) => r.json());

const profiles = await fetch(
  `${url}/rest/v1/users?select=id,email,full_name,role,verification_status,is_active`,
  { headers }
).then((r) => r.json());

const roleById = new Map((Array.isArray(profiles) ? profiles : []).map((p) => [p.id, p]));

console.log(`ACCOUNTS (${auth.users?.length ?? 0}):\n`);
for (const u of auth.users ?? []) {
  const p = roleById.get(u.id);
  console.log(
    [
      `email: ${u.email ?? "(none)"}`,
      `role: ${p?.role ?? "?"}`,
      p?.full_name ? `name: ${p.full_name}` : null,
      p?.verification_status ? `status: ${p.verification_status}` : null,
      `confirmed: ${u.email_confirmed_at ? "yes" : "NO"}`,
      `last-signin: ${u.last_sign_in_at ?? "never"}`,
      `id: ${u.id}`,
    ]
      .filter(Boolean)
      .join("  |  ")
  );
}

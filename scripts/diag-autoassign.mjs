/**
 * TEMPORARY diagnostic: why did (or didn't) the AI auto-assign recent reports?
 * Read-only. Reads keys from .env.local; prints only non-sensitive metadata.
 *
 * Usage: node scripts/diag-autoassign.mjs
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${JSON.stringify(j)}`);
  return j;
};

const departments = await get("departments?select=id,name,slug,is_active&order=name");
const categories = await get("categories?select=id,slug,name,default_department_id,handling_level&order=slug");
const pagsawitan = await get("barangays?select=id,name&name=ilike.*pagsawitan*");
const reports = await get(
  "reports?select=id,ref_code,title,status,barangay_id,department_id,created_at&order=created_at.desc&limit=12"
);

console.log("=== DEPARTMENTS ===");
for (const d of departments) console.log(` ${d.slug.padEnd(14)} active=${d.is_active}  ${d.name}  ${d.id}`);
console.log("\n=== CATEGORIES (routing config) ===");
for (const c of categories) {
  const def = departments.find((d) => d.id === c.default_department_id);
  console.log(` ${(c.slug ?? "?").padEnd(22)} handling=${c.handling_level ?? "NULL"}  default=${def ? def.slug : "NULL"}`);
}
console.log("\n=== BARANGAY pagsawitan ===", JSON.stringify(pagsawitan));

if (!reports.length) {
  console.log("\nNo reports found.");
  process.exit(0);
}

const ids = reports.map((r) => r.id).join(",");
const analyses = await get(
  `ai_analysis?report_id=in.(${ids})&select=report_id,suggested_department_id,suggested_barangay_id,handling_level,auto_assigned,status,model_used,confidence,created_at&order=created_at.desc`
);
const assignments = await get(
  `assignments?report_id=in.(${ids})&select=report_id,assigned_type,department_id,barangay_id,note,created_at&order=created_at.desc`
);
const barangays = await get("barangays?select=id,name");

const nameOfBrgy = (id) => barangays.find((b) => b.id === id)?.name ?? id?.slice(0, 8) ?? "—";
const nameOfDept = (id) => departments.find((d) => d.id === id)?.slug ?? id?.slice(0, 8) ?? "—";

console.log("\n=== RECENT REPORTS ===");
for (const r of reports) {
  const a = analyses.filter((x) => x.report_id === r.id);
  const asg = assignments.filter((x) => x.report_id === r.id);
  console.log(`\n${r.ref_code}  [${r.status}]  ${String(r.title).slice(0, 48)}`);
  console.log(`  created: ${r.created_at}`);
  console.log(`  report.barangay_id: ${r.barangay_id ? nameOfBrgy(r.barangay_id) : "NULL"}   report.department_id: ${r.department_id ? nameOfDept(r.department_id) : "NULL"}`);
  if (!a.length) {
    console.log("  ai_analysis: NONE  ← pipeline never wrote a row");
  } else {
    const x = a[0];
    console.log(`  ai_analysis: level=${x.handling_level ?? "NULL"} auto_assigned=${x.auto_assigned} status=${x.status} conf=${x.confidence} model=${x.model_used}`);
    console.log(`               suggested_dept=${x.suggested_department_id ? nameOfDept(x.suggested_department_id) : "NULL"} suggested_brgy=${x.suggested_barangay_id ? nameOfBrgy(x.suggested_barangay_id) : "NULL"}`);
    if (a.length > 1) console.log(`               (${a.length} analysis rows total)`);
  }
  if (!asg.length) {
    console.log("  assignments: NONE  ← no assignment row was created");
  } else {
    for (const s of asg) {
      const target = s.assigned_type === "barangay" ? `brgy:${nameOfBrgy(s.barangay_id)}` : `dept:${nameOfDept(s.department_id)}`;
      console.log(`  assignment: ${s.assigned_type} → ${target}  (${s.created_at})`);
    }
  }
}

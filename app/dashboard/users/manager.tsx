"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffAccount,
  saveUserRole,
  toggleUserActive,
  verifyCitizen,
  rejectCitizen,
  bulkUserAction,
  type BulkUserAction,
} from "@/app/actions/admin";
import { idPhotoUrl } from "@/lib/photo";
import { Card, btn, inputCls, labelCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/lib/constants";
import type { Profile } from "@/lib/types";

type Opt = { id: string; name: string };

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-primary-50 text-primary-700 ring-1 ring-primary-100",
  department: "bg-accent-50 text-accent-700 ring-1 ring-accent-100",
  barangay: "bg-success-50 text-success-700 ring-1 ring-success-100",
  citizen: "bg-slate-100 text-slate-600",
};

const ROLE_SECTION: { key: Role; blurb: string }[] = [
  { key: "citizen", blurb: "Residents who submit and track reports" },
  { key: "department", blurb: "Offices processing assigned reports" },
  { key: "barangay", blurb: "Barangay halls processing local reports" },
  { key: "admin", blurb: "Full system oversight" },
];

export default function UserManager({
  initial,
  counts,
  filterRole,
  openCreate,
  departments,
  barangays,
}: {
  initial: Profile[];
  counts: Record<string, number>;
  filterRole: string;
  openCreate: boolean;
  departments: Opt[];
  barangays: Opt[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(openCreate);
  const [createStep, setCreateStep] = useState<0 | 1>(0);
  const [createRole, setCreateRole] = useState<"department" | "barangay" | "admin" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Profile | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState<string | null>(null); // holds action pending a reason

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectMany(users: Profile[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = users.every((u) => next.has(u.id));
      for (const u of users) {
        if (allIn) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  }

  async function applyBulk(action: BulkUserAction, reason = "") {
    const ids = [...selected];
    if (ids.length === 0) return;
    const labels: Record<BulkUserAction, string> = {
      approve: `Approve ${ids.length} registration${ids.length > 1 ? "s" : ""}?`,
      reject: `Reject ${ids.length} registration${ids.length > 1 ? "s" : ""}? Each user will see the reason at sign-in.`,
      suspend: `Suspend ${ids.length} account${ids.length > 1 ? "s" : ""}? They will be signed out and blocked from signing in.`,
      restore: `Restore access for ${ids.length} account${ids.length > 1 ? "s" : ""}?`,
      delete: `PERMANENTLY delete ${ids.length} account${ids.length > 1 ? "s" : ""} and all their data? This cannot be undone.`,
    };
    if (!confirm(labels[action])) return;
    setBulkReason(null);
    await run(() => bulkUserAction(ids, action, reason));
    setSelected(new Set());
  }

  const pending = initial.filter(
    (u) => u.role === "citizen" && u.verification_status === "pending"
  );
  const rejected = initial.filter(
    (u) => u.role === "citizen" && u.verification_status === "rejected"
  );

  const active = initial.filter(
    (u) => !pending.includes(u) && !rejected.includes(u)
  );
  const searched = search.trim()
    ? active.filter((u) => {
        const q = search.toLowerCase();
        return (
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
        );
      })
    : active;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Action failed");
    else router.refresh();
  }

  async function openId(u: Profile) {
    if (!u.id_photo_path) return;
    // served by /api/photo (admin-checked server route) — no signed-URL/policy dependency
    setIdUrl(idPhotoUrl(u.id_photo_path));
  }

  async function onCreateStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createRole) return;
    setBusy(true);
    setError(null);
    setCreateSuccess(null);
    const fd = new FormData(e.currentTarget);
    const role = createRole;
    const res = await createStaffAccount({
      fullName: String(fd.get("full_name") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      role,
      departmentId: role === "department" ? String(fd.get("department_id") ?? "") || null : null,
      barangayId: role === "barangay" ? String(fd.get("barangay_id") ?? "") || null : null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to create account");
      return;
    }
    setCreateSuccess(`${String(fd.get("full_name"))} can now sign in with the email & password you set.`);
    setShowCreate(false);
    setCreateStep(0);
    setCreateRole(null);
    e.currentTarget.reset();
    router.refresh();
  }

  async function onEditRole(e: React.FormEvent<HTMLFormElement>, userId: string) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await saveUserRole(
      userId,
      String(fd.get("role") ?? "citizen") as Role,
      String(fd.get("department_id") ?? "") || null,
      String(fd.get("barangay_id") ?? "") || null
    );
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Save failed");
    else {
      setEditingId(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">
            <Icon name="search" size="md" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-300 focus:border-primary-400"
          />
        </div>
        <button
          onClick={() => {
            setShowCreate((s) => {
              if (s) {
                setCreateStep(0);
                setCreateRole(null);
              }
              return !s;
            });
          }}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-royal sm:px-4 sm:text-sm"
        >
          {showCreate ? (
            <>
              <Icon name="close" size="sm" /> Close
            </>
          ) : (
            <>
              <Icon name="plus" size="sm" /> Create staff account
            </>
          )}
        </button>
      </div>

      {createSuccess && (
        <p className="flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
          <Icon name="check-circle" size="md" className="shrink-0" /> {createSuccess}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          <Icon name="alert" size="md" className="shrink-0" /> {error}
        </p>
      )}

      {/* staff creation wizard — step 0: choose account type */}
      {showCreate && createStep === 0 && (
        <Card className="border-primary-200 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Step 1 of 2</p>
          <p className="mt-1 font-bold">What type of account do you want to create?</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {([
              { key: "department", icon: "building", title: "Department", desc: "An office that processes reports assigned to it — engineering, water, utilities…" },
              { key: "barangay", icon: "home", title: "Barangay", desc: "A barangay hall that handles reports within its jurisdiction." },
              { key: "admin", icon: "shield", title: "Administrator", desc: "Full system oversight — approvals, assignments, AI review, settings." },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setCreateRole(opt.key);
                  setCreateStep(1);
                }}
                className={`press rounded-xl border-2 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                  createRole === opt.key
                    ? "border-primary-500 bg-primary-50/60"
                    : "border-slate-200 bg-white hover:border-primary-300"
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Icon name={opt.icon} size="lg" />
                </span>
                <p className="mt-3 text-sm font-bold text-slate-800">{opt.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{opt.desc}</p>
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Citizen accounts can&apos;t be created here — the public registration
            form creates those, awaiting your approval in the section below.
          </p>
        </Card>
      )}

      {/* staff creation wizard — step 1: details for the chosen type */}
      {showCreate && createStep === 1 && createRole && (
        <Card className="border-primary-200 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Step 2 of 2</p>
          <p className="mt-1 flex items-center gap-2 font-bold">
            Create {createRole === "admin" ? "an Administrator" : `a ${createRole === "department" ? "Department" : "Barangay"}`} account
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {createRole === "department" &&
              "Pick the exact office this account belongs to — they'll only see reports assigned to it."}
            {createRole === "barangay" &&
              "Pick the barangay this account belongs to — they'll only see reports assigned to it."}
            {createRole === "admin" &&
              "Administrators see everything — grant this only to trusted staff."}
          </p>
          <form onSubmit={onCreateStaff} className="mt-4 grid gap-3 sm:grid-cols-2">
            {createRole === "department" && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Department *</label>
                <select name="department_id" required className={inputCls} defaultValue="">
                  <option value="" disabled>— Select the office —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {departments.length === 0 && (
                  <p className="mt-1 text-xs text-danger-500">
                    No departments yet — add one under Configuration → Departments first.
                  </p>
                )}
              </div>
            )}
            {createRole === "barangay" && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Barangay *</label>
                <select name="barangay_id" required className={inputCls} defaultValue="">
                  <option value="" disabled>— Select the barangay —</option>
                  {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {barangays.length === 0 && (
                  <p className="mt-1 text-xs text-danger-500">
                    No barangays yet — add them under Configuration → Barangays first.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className={labelCls}>Full name *</label>
              <input name="full_name" required className={inputCls}
                placeholder={createRole === "barangay" ? "e.g. Barangay San Isidro Hall" : "e.g. Maria Santos"} />
            </div>
            <div>
              <label className={labelCls}>Mobile number</label>
              <input name="phone" type="tel" className={inputCls} placeholder="+63 9XX XXX XXXX" />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input name="email" type="email" required className={inputCls} placeholder="staff@example.gov" />
            </div>
            <div>
              <label className={labelCls}>Temporary password *</label>
              <input name="password" required minLength={8} className={inputCls} placeholder="At least 8 characters" />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setCreateStep(0);
                  setCreateRole(null);
                }}
                className={btn.secondary}
              >
                <Icon name="arrow-left" size="sm" /> Back
              </button>
              <button type="submit" disabled={busy} className={`${btn.primary} ml-auto`}>
                {busy ? "Creating…" : `Create ${createRole} account`}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ============ Pending Approval ============ */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Icon name="shield" size="md" className="text-primary-600" />
            Pending approval
          </p>
          <div className="flex items-center gap-3">
            {pending.length > 0 && (
              <button
                onClick={() => toggleSelectMany(pending)}
                className="text-xs font-semibold text-slate-400 transition hover:text-primary-600"
              >
                {pending.every((u) => selected.has(u.id)) ? "Deselect all" : "Select all"}
              </button>
            )}
            <span className="text-xs text-slate-400">
              {pending.length} awaiting review
            </span>
          </div>
        </div>

        {pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            No registrations waiting — new citizen sign-ups appear here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <BulkCheck
                  checked={selected.has(u.id)}
                  onChange={() => toggleSelect(u.id)}
                  label={`Select ${u.full_name ?? u.email ?? "user"}`}
                />
                <Avatar name={u.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {u.full_name ?? "(no name)"}
                    {u.id_verification_status === "passed" && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700 ring-1 ring-success-200">
                        <Icon name="robot" size="sm" /> AI verified
                        {typeof u.id_verification?.verification_score === "number" &&
                          ` ${Math.round(u.id_verification.verification_score * 100)}%`}
                      </span>
                    )}
                    {u.id_verification_status === "needs_review" && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[10px] font-bold text-warn-700 ring-1 ring-warn-200">
                        <Icon name="robot" size="sm" /> AI needs review
                      </span>
                    )}
                    {u.id_verification_status === "failed" && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-bold text-danger-700 ring-1 ring-danger-200">
                        <Icon name="robot" size="sm" /> AI failed
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {u.email ?? "no email"} · {u.phone ?? "no phone"} · registered{" "}
                    {new Date(u.created_at).toLocaleDateString()}
                  </p>
                  {u.id_verification?.extracted && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      ID says: <span className="font-semibold text-slate-600">{u.id_verification.extracted.full_name ?? "?"}</span>
                      {u.id_verification.extracted.id_type ? ` · ${u.id_verification.extracted.id_type.replace(/_/g, " ")}` : ""}
                      {typeof u.id_verification.name_match?.score === "number" &&
                        ` · name match ${Math.round(u.id_verification.name_match.score * 100)}%`}
                    </p>
                  )}
                  {u.id_verification?.reasons && u.id_verification.reasons.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-warn-600">
                      {u.id_verification.reasons.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void openId(u)}
                    disabled={!u.id_photo_path || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-warn-200 bg-warn-50 px-3 py-1.5 text-xs font-semibold text-warn-800 hover:bg-warn-100 disabled:opacity-50"
                    title="View the uploaded ID photo"
                  >
                    <Icon name="eye" size="sm" />
                    View ID
                  </button>
                  <button
                    onClick={() => void run(() => verifyCitizen(u.id))}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-success-700 disabled:opacity-50"
                  >
                    <Icon name="check-circle" size="sm" /> Approve
                  </button>
                  <button
                    onClick={() => {
                      setRejecting(u);
                      setRejectReason("");
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-danger-600 disabled:opacity-50"
                  >
                    <Icon name="close" size="sm" /> Reject
                  </button>
                </div>
              </div>
            ))}
            {rejected.length > 0 && (
              <div className="bg-slate-50/60 px-4 py-2.5 text-xs text-slate-400">
                {rejected.length} rejected registration{rejected.length === 1 ? "" : "s"} — they
                see the rejection reason at sign-in and can contact you to resolve it.
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ============ Active users, grouped by role ============ */}
      <div className="space-y-4">
        {ROLE_SECTION.map(({ key, blurb }) => {
          const list = searched.filter((u) => u.role === key);
          if (filterRole !== "all" && filterRole !== key) return null;
          if (list.length === 0 && search.trim()) return null;
          return (
            <Card key={key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    {ROLE_LABELS[key]}s
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_BADGE[key]}`}>
                      {list.length}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">{blurb}</p>
                </div>
                {list.length > 0 && (
                  <button
                    onClick={() => toggleSelectMany(list)}
                    className="text-xs font-semibold text-slate-400 transition hover:text-primary-600"
                  >
                    {list.every((u) => selected.has(u.id)) ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">None yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {list.map((u) => (
                    <div key={u.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <BulkCheck
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          label={`Select ${u.full_name ?? u.email ?? "user"}`}
                        />
                        <Avatar name={u.full_name} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                            <span className="truncate">{u.full_name ?? "(no name)"}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_BADGE[u.role]}`}>
                              {ROLE_LABELS[u.role]}
                            </span>
                            {u.role === "citizen" && u.verification_status === "verified" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-700 ring-1 ring-success-100">
                                <Icon name="shield" size="sm" /> Verified
                              </span>
                            )}
                            {!u.is_active && (
                              <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-bold text-danger-600 ring-1 ring-danger-100">
                                Suspended
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {u.email ?? "no email"} · joined{" "}
                            {new Date(u.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {u.role === "citizen" && u.id_photo_path && (
                            <button
                              onClick={() => void openId(u)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <Icon name="eye" size="sm" />
                              ID
                            </button>
                          )}
                          <button
                            onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Icon name="edit" size="sm" />
                            {editingId === u.id ? "Close" : "Edit"}
                          </button>
                          <button
                            onClick={() => void run(() => toggleUserActive(u.id, !u.is_active))}
                            disabled={busy}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                              u.is_active ? "bg-warn-500 hover:bg-warn-600" : "bg-success-600 hover:bg-success-700"
                            }`}
                          >
                            {u.is_active ? "Suspend" : "Restore"}
                          </button>
                        </div>
                      </div>

                      {editingId === u.id && (
                        <form
                          onSubmit={(e) => void onEditRole(e, u.id)}
                          className="mt-3 grid gap-3 rounded-xl bg-slate-50/70 p-3 sm:grid-cols-3"
                        >
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
                            <select name="role" defaultValue={u.role} className={inputCls}>
                              {(["citizen", "admin", "department", "barangay"] as const).map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Department</label>
                            <select name="department_id" defaultValue={u.department_id ?? ""} className={inputCls}>
                              <option value="">— none —</option>
                              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Barangay</label>
                            <select name="barangay_id" defaultValue={u.barangay_id ?? ""} className={inputCls}>
                              <option value="">— none —</option>
                              {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          </div>
                          <div className="sm:col-span-3">
                            <button type="submit" disabled={busy} className={btn.primary}>
                              {busy ? "Saving…" : "Save changes"}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ============ bulk action bar ============ */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-600 px-2 text-xs font-extrabold text-white">
            {selected.size}
          </span>
          <p className="mr-2 text-sm font-semibold text-slate-700">selected</p>

          <button
            onClick={() => void applyBulk("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-success-700 disabled:opacity-50"
          >
            <Icon name="check-circle" size="sm" /> Approve
          </button>
          <button
            onClick={() => setBulkReason("reject")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-danger-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-danger-600 disabled:opacity-50"
          >
            <Icon name="close" size="sm" /> Reject
          </button>
          <button
            onClick={() => void applyBulk("suspend")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-warn-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-warn-600 disabled:opacity-50"
          >
            Suspend
          </button>
          <button
            onClick={() => void applyBulk("restore")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Restore
          </button>
          <button
            onClick={() => void applyBulk("delete")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-bold text-danger-600 hover:bg-danger-100 disabled:opacity-50"
          >
            <Icon name="trash" size="sm" /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ============ modals ============ */}
      {idUrl && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={() => setIdUrl(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Icon name="shield" size="md" className="text-primary-600" />
                Submitted ID (confidential)
              </p>
              <button
                onClick={() => setIdUrl(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <Icon name="close" size="md" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={idUrl} alt="Submitted ID" className="max-h-[70vh] w-full object-contain" />
            <p className="px-4 py-2.5 text-center text-[11px] text-slate-400">
              Link expires in 5 minutes · visible to administrators only
            </p>
          </div>
        </div>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={() => setRejecting(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <Icon name="alert" size="md" className="text-danger-500" />
              Reject registration
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {rejecting.full_name ?? "This user"} will see the reason at sign-in
              and cannot submit reports.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (sent to the citizen) — e.g. ID photo is blurred"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = rejecting.id;
                  setRejecting(null);
                  void run(() => rejectCitizen(id, rejectReason));
                }}
                disabled={busy}
                className={btn.danger}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* bulk reject — one reason for all selected */}
      {bulkReason === "reject" && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={() => setBulkReason(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="flex items-center gap-2 font-bold text-slate-900">
              <Icon name="alert" size="md" className="text-danger-500" />
              Reject {selected.size} registration{selected.size > 1 ? "s" : ""}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Each selected user will see the reason at sign-in and cannot submit
              reports.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason sent to everyone selected — e.g. ID photo is blurred"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setBulkReason(null)} className={btn.secondary}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const reason = rejectReason;
                  setRejectReason("");
                  void applyBulk("reject", reason);
                }}
                disabled={busy}
                className={btn.danger}
              >
                Reject {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BulkCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-primary-600"
    />
  );
}

function Avatar({ name }: { name: string | null }) {
  const letter = (name ?? "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-extrabold text-primary-600">
      {letter}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDepartment, deleteDepartment } from "@/app/actions/admin";
import { Card, btn, inputCls, labelCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Department } from "@/lib/types";

export default function DepartmentManager({ initial }: { initial: Department[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await saveDepartment({
      id: editing instanceof Object ? editing.id : undefined,
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      head_name: String(fd.get("head_name") ?? ""),
      contact_number: String(fd.get("contact_number") ?? ""),
      color: String(fd.get("color") ?? "#2333A0"),
      is_active: fd.get("is_active") === "on",
    });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Save failed");
    else {
      setEditing(null);
      router.refresh();
    }
  }

  async function onDelete(d: Department) {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    const res = await deleteDepartment(d.id);
    if (!res.ok) setError(res.error ?? "Delete failed");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!editing && (
        <button onClick={() => setEditing("new")} className={btn.primary}>+ New department</button>
      )}

      {editing && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input name="name" required defaultValue={editing !== "new" ? editing.name : ""} className={inputCls}
                  placeholder="e.g. City Engineering Office" />
              </div>
              <div>
                <label className={labelCls}>Department head</label>
                <input name="head_name" defaultValue={editing !== "new" ? editing.head_name ?? "" : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contact number</label>
                <input name="contact_number" defaultValue={editing !== "new" ? editing.contact_number ?? "" : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Color</label>
                <input name="color" type="color" defaultValue={editing !== "new" ? editing.color : "#2333A0"} className={`${inputCls} h-10`} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_active" defaultChecked={editing === "new" || editing.is_active} className="h-4 w-4" />
                  Active
                </label>
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input name="description" defaultValue={editing !== "new" ? editing.description ?? "" : ""} className={inputCls} />
            </div>
            {error && <p className="rounded bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={btn.primary}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setEditing(null)} className={btn.secondary}>Cancel</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {initial.map((d) => (
          <Card key={d.id} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${d.color}1a`, color: d.color }}>
              <Icon name="building" size="lg" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{d.name} {!d.is_active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}</p>
              <p className="truncate text-xs text-slate-500">
                {d.head_name ? `Head: ${d.head_name}` : "No head set"}{d.contact_number ? ` · ${d.contact_number}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => setEditing(d)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit" aria-label={`Edit ${d.name}`}>
                <Icon name="edit" size="md" />
              </button>
              <button onClick={() => void onDelete(d)} className="rounded-lg p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-500" title="Delete" aria-label={`Delete ${d.name}`}>
                <Icon name="trash" size="md" />
              </button>
            </div>
          </Card>
        ))}
        {initial.length === 0 && <p className="text-sm text-slate-400">No departments yet — add the real ones once finalized.</p>}
      </div>
    </div>
  );
}

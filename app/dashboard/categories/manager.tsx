"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, deleteCategory } from "@/app/actions/admin";
import { Card, btn, inputCls, labelCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Category } from "@/lib/types";

export default function CategoryManager({ initial }: { initial: Category[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await saveCategory({
      id: editing instanceof Object ? editing.id : undefined,
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      color: String(fd.get("color") ?? "#64748b"),
      icon: String(fd.get("icon") ?? "📋"),
      is_active: fd.get("is_active") === "on",
    });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Save failed");
    else {
      setEditing(null);
      router.refresh();
    }
  }

  async function onDelete(c: Category) {
    if (!confirm(`Delete category "${c.name}"? Reports using it will keep a dangling reference.`)) return;
    const res = await deleteCategory(c.id);
    if (!res.ok) setError(res.error ?? "Delete failed");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!editing && (
        <button onClick={() => setEditing("new")} className={btn.primary}>+ New category</button>
      )}

      {editing && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input name="name" required defaultValue={editing !== "new" ? editing.name : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Icon</label>
                <input name="icon" defaultValue={editing !== "new" ? editing.icon : "📋"} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Color</label>
                <input name="color" type="color" defaultValue={editing !== "new" ? editing.color : "#64748b"} className={`${inputCls} h-10`} />
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
        {initial.map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg text-xl" style={{ background: `${c.color}22` }}>
              {c.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.name} {!c.is_active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}</p>
              <p className="truncate text-xs text-slate-500">{c.description ?? c.slug}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => setEditing(c)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit" aria-label={`Edit ${c.name}`}>
                <Icon name="edit" size="md" />
              </button>
              <button onClick={() => void onDelete(c)} className="rounded-lg p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-500" title="Delete" aria-label={`Delete ${c.name}`}>
                <Icon name="trash" size="md" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

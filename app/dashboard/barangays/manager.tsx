"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBarangay, deleteBarangay } from "@/app/actions/admin";
import { Card, btn, inputCls, labelCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import MapPicker from "@/components/map-picker";
import type { Barangay } from "@/lib/types";

export default function BarangayManager({ initial }: { initial: Barangay[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Barangay | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });

  function startEdit(b: Barangay | "new") {
    setEditing(b);
    setPin(
      b === "new"
        ? { lat: null, lng: null }
        : { lat: b.center_lat, lng: b.center_lng }
    );
  }

  const missingCenters = initial.filter(
    (b) => b.center_lat == null || b.center_lng == null
  ).length;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await saveBarangay({
      id: editing instanceof Object ? editing.id : undefined,
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      captain_name: String(fd.get("captain_name") ?? ""),
      contact_number: String(fd.get("contact_number") ?? ""),
      center_lat: pin.lat,
      center_lng: pin.lng,
      is_active: fd.get("is_active") === "on",
    });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Save failed");
    else {
      setEditing(null);
      router.refresh();
    }
  }

  async function onDelete(b: Barangay) {
    if (!confirm(`Delete barangay "${b.name}"?`)) return;
    const res = await deleteBarangay(b.id);
    if (!res.ok) setError(res.error ?? "Delete failed");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!editing && (
        <button onClick={() => startEdit("new")} className={btn.primary}>+ New barangay</button>
      )}

      {editing && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input name="name" required defaultValue={editing !== "new" ? editing.name : ""} className={inputCls}
                  placeholder="e.g. Barangay San Isidro" />
              </div>
              <div>
                <label className={labelCls}>Captain</label>
                <input name="captain_name" defaultValue={editing !== "new" ? editing.captain_name ?? "" : ""} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Contact number</label>
                <input name="contact_number" defaultValue={editing !== "new" ? editing.contact_number ?? "" : ""} className={inputCls} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_active" defaultChecked={editing === "new" || editing.is_active} className="h-4 w-4" />
                  Active
                </label>
              </div>
            </div>
            <div>
              <label className={labelCls}>Map center (for GPS auto-detection)</label>
              <MapPicker
                lat={pin.lat}
                lng={pin.lng}
                onPick={(lat, lng) => setPin({ lat, lng })}
                height={260}
              />
              {pin.lat != null && pin.lng != null ? (
                <p className="mt-1.5 text-[11px] font-medium text-success-600">
                  Center: {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-warn-600">
                  No center set — tap the map or use your current location. Citizens reporting inside this barangay are auto-routed here.
                </p>
              )}
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

      {missingCenters > 0 && !editing && (
        <p className="flex items-start gap-2 rounded-xl bg-warn-50 px-3.5 py-2.5 text-xs leading-relaxed text-warn-700">
          <Icon name="alert" size="md" className="mt-0.5 shrink-0" />
          <span>
            <strong>{missingCenters}</strong> barangay{missingCenters > 1 ? "ies" : ""} have no map center — reports GPS-detected inside them will say “outside known barangays”. Open each one and tap its location on the map.
          </span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {initial.map((b) => (
          <Card key={b.id} className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50 text-success-500">
              <Icon name="home" size="lg" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{b.name} {!b.is_active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}</p>
              <p className="truncate text-xs text-slate-500">
                {b.captain_name ? `Captain: ${b.captain_name}` : "No captain set"}{b.contact_number ? ` · ${b.contact_number}` : ""}
              </p>
              <p className={`mt-0.5 truncate text-[11px] font-medium ${b.center_lat != null && b.center_lng != null ? "text-success-600" : "text-warn-600"}`}>
                {b.center_lat != null && b.center_lng != null
                  ? `Center set (${b.center_lat.toFixed(4)}, ${b.center_lng.toFixed(4)})`
                  : "No map center — GPS detection off"}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => startEdit(b)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit" aria-label={`Edit ${b.name}`}>
                <Icon name="edit" size="md" />
              </button>
              <button onClick={() => void onDelete(b)} className="rounded-lg p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-500" title="Delete" aria-label={`Delete ${b.name}`}>
                <Icon name="trash" size="md" />
              </button>
            </div>
          </Card>
        ))}
        {initial.length === 0 && <p className="text-sm text-slate-400">No barangays yet — add the real ones once finalized.</p>}
      </div>
    </div>
  );
}

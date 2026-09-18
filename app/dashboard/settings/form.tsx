"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/app/actions/admin";
import { Card, btn, inputCls, labelCls } from "@/components/ui";

const FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "Client name" },
  { key: "city_name", label: "City / Municipality" },
  { key: "tagline", label: "Tagline" },
];

export default function SettingsForm({
  initial,
}: {
  initial: { key: string; value: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialMap = new Map(initial.map((s) => [s.key, s.value ?? ""]));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const entries = FIELDS.map((f) => ({ key: f.key, value: String(fd.get(f.key) ?? "") }));
    const res = await saveSettings(entries);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Save failed");
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className={labelCls}>{f.label}</label>
            <input name={f.key} defaultValue={initialMap.get(f.key) ?? ""} className={inputCls} />
          </div>
        ))}
        {error && <p className="rounded bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</p>}
        <button type="submit" disabled={busy} className={btn.primary}>
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
        </button>
      </form>
    </Card>
  );
}

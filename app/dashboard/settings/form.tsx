"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/app/actions/admin";
import { Card, btn, inputCls, labelCls } from "@/components/ui";
import { Icon } from "@/components/icons";

const FIELDS: {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  wide?: boolean;
}[] = [
  { key: "client_name", label: "Client name", hint: "Browser tab, landing page and PWA title" },
  { key: "city_name", label: "City / Municipality", hint: "Dashboards, maps and public copy" },
  { key: "tagline", label: "Tagline", hint: "Login screen and page subtitles", wide: true },
  { key: "contact_email", label: "Support email", hint: "Profile → Help & support", placeholder: "help@example.gov" },
  { key: "contact_phone", label: "Contact number", hint: "Profile → Help & support", placeholder: "(000) 000-0000" },
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
    try {
      const res = await saveSettings(entries);
      if (!res.ok) setError(res.error ?? "Save failed");
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    } catch {
      setError("Save failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="tag" size="md" className="text-primary-600" />
          Branding &amp; contact
        </p>
        <span className="text-[11px] font-medium text-slate-400">
          Saved to the database
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <label className={labelCls}>{f.label}</label>
              <input
                name={f.key}
                defaultValue={initialMap.get(f.key) ?? ""}
                placeholder={f.placeholder}
                className={inputCls}
              />
              {f.hint && (
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {f.hint}
                </p>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {error}
          </p>
        )}

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          Logo: replace <code className="rounded bg-slate-100 px-1">public/logo.png</code>{" "}
          or set <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_LOGO_URL</code>{" "}
          in <code className="rounded bg-slate-100 px-1">.env.local</code> — every
          screen updates.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-400">
            Applies immediately — no redeploy needed.
          </p>
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
          </button>
        </div>
      </form>
    </Card>
  );
}

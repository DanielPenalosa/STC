"use client";

import { useState } from "react";
import { useNotifications } from "@/components/providers";
import { PageHeader, Card, btn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { CLIENT_NAME, CITY_NAME, CONTACT_EMAIL, CONTACT_PHONE } from "@/app/brand";
import { ROLE_LABELS } from "@/lib/constants";
import type { Profile } from "@/lib/types";

const inputShell =
  "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50";
const field =
  "w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-300";

export default function ProfilePage({ profile }: { profile: Profile }) {
  const { notifications } = useNotifications();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName, phone, address })
      .eq("id", profile.id);
    setBusy(false);
    setSaved(!error);
    setTimeout(() => setSaved(false), 2000);
  }

  async function signOut() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Profile" />

      {/* identity card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-lg font-extrabold text-primary-600">
            {(profile.full_name ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">
              {profile.full_name ?? "User"}
            </p>
            <p className="text-xs text-slate-400">
              {ROLE_LABELS[profile.role]} · {CITY_NAME}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
          <Field icon="user" label="Full name">
            <input className={field} value={fullName}
              onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field icon="smartphone" label="Mobile number">
            <input className={field} value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" />
          </Field>
          <Field icon="pin" label="Address">
            <input className={field} value={address}
              onChange={(e) => setAddress(e.target.value)} placeholder="Street, barangay" />
          </Field>
          <button onClick={() => void save()} disabled={busy} className={`${btn.primary} press w-full`}>
            {busy ? "Saving…" : saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </Card>

      {/* activity */}
      <Card className="divide-y divide-slate-100">
        <Row
          href="/dashboard/notifications"
          icon="bell"
          label="Notifications"
          hint={unread > 0 ? `${unread} unread` : "All caught up"}
        />
        <Row
          href="/dashboard/my-reports"
          icon="file"
          label="My reports"
          hint="Track status"
        />
      </Card>

      {/* about + support */}
      <Card className="divide-y divide-slate-100">
        <Row href="/install" icon="smartphone" label="Install the app" hint="Add to home screen" />
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
            <Icon name="shield" size="md" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-slate-700">Help &amp; support</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              {CLIENT_NAME} · {CITY_NAME}
              <br />
              {CONTACT_EMAIL} · {CONTACT_PHONE}
            </p>
          </div>
        </div>
      </Card>

      <button onClick={() => void signOut()} className={`${btn.danger} press w-full`}>
        Sign out
      </button>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <div className={inputShell}>
        <Icon name={icon} size="md" className="shrink-0 text-slate-300" />
        {children}
      </div>
    </div>
  );
}

function Row({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: IconName;
  label: string;
  hint?: string;
}) {
  return (
    <a href={href} className="press flex items-center gap-3 p-4 hover:bg-slate-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
        <Icon name={icon} size="md" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <Icon name="chevron-right" size="md" className="shrink-0 text-slate-300" />
    </a>
  );
}

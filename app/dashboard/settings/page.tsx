import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import SettingsForm from "./form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*");
  const settings = (data as { key: string; value: string | null }[]) ?? [];

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Settings" subtitle="System-wide configuration (rebrand once the client is finalized)" />
      <Card className="p-4 text-sm text-slate-600">
        The logo is served from <code className="rounded bg-slate-100 px-1">public/logo.png</code> — replace
        that file (or set <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_LOGO_URL</code> in{" "}
        <code className="rounded bg-slate-100 px-1">.env.local</code>) and every screen updates.
      </Card>
      <SettingsForm initial={settings} />
    </div>
  );
}

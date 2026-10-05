import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { cloudinaryConfigured } from "@/lib/storage/cloudinary";
import { facebookConfigured } from "@/lib/facebook";

/**
 * System status — a live read-only health check of the configuration the
 * system actually depends on. Shows WHETHER a value is set (never the value
 * itself), so an admin can tell at a glance what is connected, what is
 * optional, and what is missing before something breaks in production.
 */

type State = "ok" | "warn" | "info";

type Check = {
  icon: IconName;
  label: string;
  value: string;
  state: State;
  hint?: string;
};

const STATE_DOT: Record<State, string> = {
  ok: "bg-success-500",
  warn: "bg-warn-500",
  info: "bg-slate-400",
};

const STATE_TEXT: Record<State, string> = {
  ok: "text-success-700",
  warn: "text-warn-700",
  info: "text-slate-500",
};

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export default function SystemStatus({ autoPost }: { autoPost: boolean }) {
  const supabaseHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const fbEnv = facebookConfigured();
  const origin =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "");
  const logo = process.env.NEXT_PUBLIC_LOGO_URL?.trim();

  const checks: Check[] = [
    {
      icon: "layers",
      label: "Database",
      value: supabaseHost ? `Connected · ${supabaseHost}` : "Not configured",
      state: supabaseHost ? "ok" : "warn",
      hint: supabaseHost ? undefined : "NEXT_PUBLIC_SUPABASE_URL is missing",
    },
    {
      icon: "shield",
      label: "Public API key (anon)",
      value: anonKey ? "Configured" : "Missing",
      state: anonKey ? "ok" : "warn",
      hint: anonKey ? undefined : "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing",
    },
    {
      icon: "lock",
      label: "Server access key (service role)",
      value: serviceRole ? "Configured · server only" : "Missing",
      state: serviceRole ? "ok" : "warn",
      hint: serviceRole
        ? undefined
        : "Photo uploads, staff account creation and cleanups will fail",
    },
    {
      icon: "camera",
      label: "Photo storage",
      value: cloudinaryConfigured() ? "Cloudinary (CDN)" : "Supabase Storage",
      state: "info",
      hint: cloudinaryConfigured()
        ? undefined
        : "Optional — set CLOUDINARY_* to serve photos from the CDN",
    },
    {
      icon: "robot",
      label: "AI classification",
      value: "Local CLIP · no API key",
      state: "info",
      hint: "Model caches in .transformers-cache (~150 MB on first run)",
    },
    {
      icon: "globe",
      label: "Facebook auto-posting",
      value: fbEnv
        ? autoPost
          ? "Page connected · posting on"
          : "Page connected · posting paused"
        : "Not configured",
      state: fbEnv ? (autoPost ? "ok" : "warn") : "info",
      hint: fbEnv
        ? autoPost
          ? undefined
          : "Paused from Admin → Settings — resolved reports are NOT being posted"
        : "Optional — set FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN",
    },
    {
      icon: "link",
      label: "Public site origin",
      value: origin ? origin.replace(/^https?:\/\//, "") : "Not set",
      state: origin ? "ok" : fbEnv ? "warn" : "info",
      hint: origin
        ? undefined
        : fbEnv
          ? "NEXT_PUBLIC_APP_ORIGIN is required for Facebook to fetch the photos"
          : "Only needed for Facebook photo fetching",
    },
    {
      icon: "tag",
      label: "Logo",
      value: logo ? "Custom URL" : "public/logo.png",
      state: "info",
      hint: logo ? undefined : "Optional — set NEXT_PUBLIC_LOGO_URL to override",
    },
  ];

  const needsAttention = checks.filter((c) => c.state === "warn");

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Icon name="settings" size="md" className="text-primary-600" />
          System status
        </p>
        <span className="text-[11px] font-medium text-slate-400">
          {checks.length - needsAttention.length} of {checks.length} checks good
        </span>
      </div>

      {needsAttention.length > 0 && (
        <p className="flex items-start gap-2 border-b border-warn-100 bg-warn-50 px-4 py-2.5 text-xs font-semibold leading-relaxed text-warn-700">
          <Icon name="alert" size="sm" className="mt-0.5 shrink-0" />
          {needsAttention.length} setting
          {needsAttention.length === 1 ? "" : "s"} need
          {needsAttention.length === 1 ? "s" : ""} attention:{" "}
          {needsAttention.map((c) => c.label).join(", ")}
        </p>
      )}

      <ul className="divide-y divide-slate-50">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Icon name={c.icon} size="sm" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-xs font-semibold text-slate-700">
                  {c.label}
                </p>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[c.state]}`}
                    aria-hidden="true"
                  />
                  <span className={`text-xs font-semibold ${STATE_TEXT[c.state]}`}>
                    {c.value}
                  </span>
                </span>
              </div>
              {c.hint && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  {c.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">
        Only whether a value is set is shown — secrets stay in{" "}
        <code className="rounded bg-slate-100 px-1">.env.local</code> (or Vercel
        env vars) and are never displayed or stored in the database.
      </p>
    </Card>
  );
}

import { getBranding } from "@/lib/branding";
import { AuthLogo } from "@/components/auth-logo";

// branding comes from app_settings — never prerender it, or the login screen
// would show a stale client name/tagline until the next build
export const dynamic = "force-dynamic";
import { Icon, type IconName } from "@/components/icons";

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "camera",
    title: "Snap & submit",
    text: "Photo, description and GPS location in under a minute.",
  },
  {
    icon: "robot",
    title: "AI-assisted routing",
    text: "Computer vision suggests the right category and office.",
  },
  {
    icon: "bell",
    title: "Realtime updates",
    text: "Citizens are notified as reports move to resolution.",
  },
];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tagline } = await getBranding();
  return (
    <main className="flex min-h-screen bg-surface">
      {/* brand panel — desktop only, blue texture like the dashboard chrome */}
      <aside
        className="relative hidden w-[46%] flex-col justify-between self-start overflow-hidden bg-navy bg-cover bg-center p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-screen"
        style={{ backgroundImage: "url('/blue-bg.jpg')" }}
      >
        {/* soft glow */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #06ABEA, transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, #2E8254, transparent 65%)" }}
        />

        {/* centered municipal seal — plain logo, no effects */}
        <div className="relative flex flex-col items-center text-center">
          <AuthLogo size={112} />
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.22em] text-accent-300">
            {tagline}
          </p>
        </div>

        <div className="relative">
          <h1 className="text-3xl font-extrabold leading-tight">
            Report community issues.
            <br />
            <span className="text-accent-300">Track them to resolution.</span>
          </h1>
          <div className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent-300 ring-1 ring-white/10">
                  <Icon name={h.icon} size="lg" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{h.title}</p>
                  <p className="text-sm text-slate-400">{h.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-center text-xs text-slate-500">
          © {new Date().getFullYear()} · All rights reserved
        </p>
      </aside>

      {/* form panel — soft ambient gradient instead of a flat background */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-[-15%] h-96 w-96 rounded-full bg-primary-100/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-[-15%] h-96 w-96 rounded-full bg-accent-100/40 blur-3xl"
        />
        <div className="page-enter relative w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}

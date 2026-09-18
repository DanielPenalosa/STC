import Link from "next/link";
import { Logo, CLIENT_NAME, CITY_NAME, TAGLINE } from "@/app/brand";
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

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen bg-surface">
      {/* brand panel — desktop only, blue texture like the dashboard chrome */}
      <aside
        className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-navy bg-cover bg-center p-10 text-white lg:flex"
        style={{ backgroundImage: "url('/blue-bg.jpg')" }}
      >
        {/* soft glow */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #06ABEA, transparent 65%)" }}
        />

        <Link href="/" className="relative flex items-center gap-3">
          <Logo size={40} />
          <div>
            <p className="text-sm font-bold">{CLIENT_NAME}</p>
            <p className="text-xs text-primary-200">{CITY_NAME}</p>
          </div>
        </Link>

        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-300">
            {TAGLINE}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">
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

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} {CLIENT_NAME} · {CITY_NAME}
        </p>
      </aside>

      {/* form panel */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        {/* mobile brand */}
        <Link href="/" className="mb-8 flex items-center gap-3 lg:hidden">
          <Logo size={40} />
          <div>
            <p className="font-bold text-slate-900">{CLIENT_NAME}</p>
            <p className="text-xs text-slate-500">{CITY_NAME}</p>
          </div>
        </Link>
        <div className="page-enter w-full max-w-md">{children}</div>
        <p className="mt-8 text-xs text-slate-400 lg:hidden">
          {CLIENT_NAME} · {CITY_NAME}
        </p>
      </section>
    </main>
  );
}

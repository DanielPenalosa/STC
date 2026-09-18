import Link from "next/link";
import { Logo, CLIENT_NAME, CITY_NAME, TAGLINE } from "./brand";
import { Icon, type IconName } from "@/components/icons";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "camera",
    title: "Snap & submit",
    text: "Photo, description, category and GPS location in under a minute.",
  },
  {
    icon: "robot",
    title: "AI-assisted",
    text: "Computer vision suggests the category, department and barangay.",
  },
  {
    icon: "bell",
    title: "Stay updated",
    text: "Realtime notifications as your report moves to Resolved.",
  },
];

const STEPS: { n: string; title: string; text: string }[] = [
  { n: "01", title: "Report", text: "Snap a photo of the issue — AI classifies it instantly." },
  { n: "02", title: "Route", text: "Admins verify and assign it to the right office or barangay." },
  { n: "03", title: "Resolve", text: "Track live status until the issue is marked resolved." },
];

export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col bg-surface">
      {/* ---------- header — blue chrome like the dashboard ---------- */}
      <header
        className="sticky top-0 z-40 h-[65px] border-b border-white/10 bg-navy bg-cover bg-center px-4 sm:px-6"
        style={{ backgroundImage: "url('/blue-bg.jpg')" }}
      >
        <div className="flex h-full items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={34} className="sm:hidden" />
            <Logo size={38} className="hidden sm:block" />
            <div>
              <p className="text-xs font-bold leading-tight text-white sm:text-sm">{CLIENT_NAME}</p>
              <p className="hidden text-xs text-primary-200 sm:block">{CITY_NAME}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              className="press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-primary-100 transition hover:bg-white/10 hover:text-white sm:px-4 sm:text-sm"
            >
              <Icon name="logout" size="md" className="hidden sm:block" />
              Sign in
            </Link>
            <Link
              href="/register"
              className="press inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-semibold text-navy transition hover:bg-primary-50 sm:gap-1.5 sm:px-4 sm:text-sm"
            >
              <span>Get started</span>
              <Icon name="chevron-right" size="md" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- hero — photo background only here ---------- */}
      <section
        className="relative w-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/landing-bg.webp')" }}
      >
        {/* white veil for text readability */}
        <div className="absolute inset-0 bg-white/75" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-12 text-center sm:px-5 sm:pb-20 sm:pt-24">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3.5 py-1.5 text-center text-xs font-semibold text-primary-700">
          <Icon name="pin" size="sm" className="shrink-0" />
          <span className="truncate">{TAGLINE}</span>
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
          Report community issues.
          <br />
          <span className="text-primary-600">Track them to resolution.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base font-medium leading-relaxed text-slate-700">
          Snap a photo, and AI helps classify the issue — potholes, leaks, broken
          streetlights and more — routing it to the right department or barangay in{" "}
          {CITY_NAME}.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="press inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/25 hover:bg-primary-700"
          >
            Submit a report
            <Icon name="chevron-right" size="md" />
          </Link>
          <Link
            href="/login"
            className="press inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Staff sign in
          </Link>
        </div>
      </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="border-y border-slate-200/70 bg-white px-5 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            How it works
          </p>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative text-center">
                {i < STEPS.length - 1 && (
                  <span className="absolute right-[-20%] top-6 hidden h-px w-[40%] bg-gradient-to-r from-slate-200 to-transparent sm:block" />
                )}
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-sm font-extrabold text-primary-600">
                  {s.n}
                </span>
                <p className="mt-4 font-bold text-slate-900">{s.title}</p>
                <p className="mx-auto mt-1.5 max-w-[26ch] text-sm leading-relaxed text-slate-500">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="mx-auto w-full max-w-5xl px-5 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="hover-lift rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon name={f.icon} size="lg" />
              </span>
              <p className="mt-4 font-bold text-slate-900">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA band — same blue texture ---------- */}
      <section className="px-5 pb-20">
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-navy bg-cover bg-center px-8 py-14 text-center text-white"
          style={{ backgroundImage: "url('/blue-bg.jpg')" }}
        >
          <div
            className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, #06ABEA, transparent 65%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #2E8254, transparent 65%)" }}
          />
          <h2 className="relative text-2xl font-extrabold sm:text-3xl">
            Ready to improve your community?
          </h2>
          <p className="relative mx-auto mt-2 max-w-md text-sm text-slate-400">
            Join your neighbors in {CITY_NAME} — every report makes a difference.
          </p>
          <Link
            href="/register"
            className="press relative mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-900 hover:bg-slate-100"
          >
            Create your free account
            <Icon name="chevron-right" size="md" />
          </Link>
        </div>
      </section>

      {/* ---------- footer — blue chrome ---------- */}
      <footer
        className="mt-auto border-t border-white/10 bg-navy bg-cover bg-center px-5 py-6"
        style={{ backgroundImage: "url('/blue-bg.jpg')" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-primary-200">
          <p>
            © {new Date().getFullYear()} {CLIENT_NAME} · {CITY_NAME}
          </p>
          <div className="flex items-center gap-4">
            <Link href="/install" className="transition hover:text-white">Install the app</Link>
            <Link href="/login" className="transition hover:text-white">Staff portal</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

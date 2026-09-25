import Link from "next/link";
import { Logo, CLIENT_NAME, CITY_NAME, TAGLINE } from "./brand";
import { Icon, type IconName } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import HeroShowcase from "./hero-showcase";
import { getResolvedReports } from "@/lib/transparency";
import { publicPhotoUrl } from "@/lib/photo";

// The transparency feed must reflect the database live — never prerender a
// static snapshot of resolved reports.
export const dynamic = "force-dynamic";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "camera",
    title: "Snap & submit",
    text: "One photo, one description — filed in under a minute from any phone.",
  },
  {
    icon: "robot",
    title: "AI-assisted",
    text: "Computer vision classifies your photo and routes the report to the right department or barangay automatically.",
  },
  {
    icon: "pin",
    title: "GPS-located",
    text: "Every report is pinned on the map so crews know exactly where to go.",
  },
  {
    icon: "bell",
    title: "Realtime updates",
    text: "Get notified the moment your report is verified, assigned or resolved.",
  },
  {
    icon: "check-circle",
    title: "Accountability",
    text: "Public status trail — nothing gets lost, everyone sees the progress.",
  },
  {
    icon: "shield",
    title: "Verified accounts",
    text: "ID-verified residents keep the feed clean and reports trustworthy.",
  },
];

const STEPS: { n: string; title: string; text: string }[] = [
  { n: "01", title: "Report", text: "Snap a photo of the issue — AI classifies it instantly." },
  { n: "02", title: "Route", text: `AI auto-assigns it to the right ${"office or barangay"} — no waiting on manual triage.` },
  { n: "03", title: "Resolve", text: "Track live status until the issue is marked resolved." },
];

const STATS: { value: string; label: string; icon: IconName }[] = [
  { value: "24/7", label: "Report anytime, anywhere", icon: "clock" },
  { value: "<1 min", label: "Average time to file", icon: "camera" },
  { value: "100%", label: "Reports tracked to resolution", icon: "check-circle" },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is it free to use?",
    a: `Yes — creating an account and submitting reports is completely free for residents of ${CITY_NAME}.`,
  },
  {
    q: "What kinds of issues can I report?",
    a: "Anything that affects public spaces: potholes, water leaks, broken streetlights, flooding, garbage and more.",
  },
  {
    q: "How do I know my report was received?",
    a: "You'll get a realtime notification at every stage — verified, assigned, in progress, and resolved.",
  },
  {
    q: "Do I need to install an app?",
    a: "No install needed — it works in any mobile browser. You can also add it to your home screen as a PWA.",
  },
];

export default async function Landing() {
  // Resolved reports for the public transparency feed — empty-safe: the
  // section renders nothing when there's nothing resolved yet.
  const { items: resolved } = await getResolvedReports(6);
  return (
    <main className="landing-fade flex min-h-screen flex-col bg-surface">
      {/* ================= header — navy like the admin shell ================= */}
      <header className="safe-top sticky top-0 z-40 border-b border-white/10 bg-navy bg-cover bg-center backdrop-blur-md" style={{ backgroundImage: "url('/blue-bg.jpg')" }}>
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={34} />
            <div>
              <p className="text-sm font-bold leading-tight text-white">{CLIENT_NAME}</p>
              <p className="text-xs text-primary-200">{CITY_NAME}</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-primary-100 md:flex">
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#resolved" className="transition hover:text-white">Resolved</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="press hidden rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="press inline-flex items-center gap-1 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-primary-50"
            >
              Get started
              <Icon name="chevron-right" size="sm" />
            </Link>
          </div>
        </div>
      </header>

      {/* ================= hero ================= */}
      <section className="relative overflow-hidden">
        {/* ambient background: soft brand-color orbs */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="float-slow absolute -top-32 right-[-10%] h-[26rem] w-[26rem] rounded-full bg-primary-100/60 blur-3xl" />
          <div className="float-slow absolute top-40 left-[-12%] h-[22rem] w-[22rem] rounded-full bg-accent-100/50 blur-3xl [animation-delay:2s]" />
          <div className="float-slow absolute bottom-[-8rem] right-1/3 h-[18rem] w-[18rem] rounded-full bg-success-100/40 blur-3xl [animation-delay:4s]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-5 lg:grid-cols-2 lg:pb-28 lg:pt-20">
          {/* ---------- copy ---------- */}
          <div className="text-center lg:text-left">
            <span
              className="hero-rise inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-700"
              style={{ animationDelay: "0.05s" }}
            >
              <Icon name="robot" size="sm" className="shrink-0" />
              <span className="truncate">AI-powered · Location-aware · Auto-routed</span>
            </span>

            <h1
              className="hero-rise mx-auto mt-6 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 lg:mx-0 lg:text-[3.4rem]"
              style={{ animationDelay: "0.15s" }}
            >
              Report community issues.
              <br />
              <span className="bg-gradient-to-r from-primary-600 to-accent-500 bg-clip-text text-transparent">
                Track them to resolution.
              </span>
            </h1>

            <p
              className="hero-rise mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-600 lg:mx-0"
              style={{ animationDelay: "0.25s" }}
            >
              <span className="font-semibold text-slate-800">{CLIENT_NAME}</span> — {TAGLINE} —
              classifies your photo with computer vision and routes it to the
              right department or barangay in {CITY_NAME}, automatically.
            </p>

            <div
              className="hero-rise mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              style={{ animationDelay: "0.35s" }}
            >
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

            {/* stats row */}
            <div
              className="hero-rise mt-12 grid grid-cols-3 gap-4 border-t border-slate-200/80 pt-6 lg:mt-14"
              style={{ animationDelay: "0.45s" }}
            >
              {STATS.map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="text-xl font-extrabold text-slate-900 sm:text-2xl">{s.value}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ---------- visual: auto-advancing feature showcase ---------- */}
          <div className="hero-rise relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: "0.4s" }}>
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* ================= how it works ================= */}
      <Reveal>
        <section id="how" className="border-y border-slate-200/70 bg-white px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <p className="reveal text-center text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">
              How it works
            </p>
            <h2 className="reveal mx-auto mt-2 max-w-md text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">
              From photo to fix in three steps
            </h2>

            <div className="reveal-group mt-12 grid gap-10 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.n} className="reveal relative text-center">
                  {i < STEPS.length - 1 && (
                    <span className="absolute right-[-20%] top-6 hidden h-px w-[40%] bg-gradient-to-r from-slate-200 to-transparent sm:block" />
                  )}
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-sm font-extrabold text-primary-600 ring-1 ring-primary-100">
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
      </Reveal>

      {/* ================= features ================= */}
      <Reveal>
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-5 sm:py-20">
          <p className="reveal text-center text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">
            Features
          </p>
          <h2 className="reveal mx-auto mt-2 max-w-lg text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Everything residents and staff need
          </h2>

          <div className="reveal-group mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="reveal hover-lift rounded-2xl border border-slate-200 bg-white p-6"
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
      </Reveal>

      {/* ================= resolved feed (public transparency) ================= */}
      {resolved.length > 0 && (
        <Reveal>
          <section id="resolved" className="border-y border-slate-200/70 bg-white px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <p className="reveal text-center text-[11px] font-bold uppercase tracking-[0.2em] text-success-600">
                Transparency feed
              </p>
              <h2 className="reveal mx-auto mt-2 max-w-lg text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">
                Recent resolved reports
              </h2>
              <p className="reveal mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-500">
                Real issues reported by your neighbors — fixed and verified. Photos are
                shown for resolved reports only; no citizen information is ever shown.
              </p>

              <div className="reveal-group mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resolved.map((r) => (
                  <article
                    key={r.id}
                    className="reveal hover-lift flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    {r.photo_path ? (
                      <img
                        src={publicPhotoUrl(r.photo_path, 320)}
                        alt={r.title}
                        loading="lazy"
                        className="h-44 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-success-50 to-primary-50">
                        <Icon name="check-circle" size="xl" className="text-success-500" />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700 ring-1 ring-success-100">
                          <Icon name="check-circle" size="sm" strokeWidth={2.4} />
                          Resolved
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">{r.ref_code}</span>
                      </div>

                      <h3 className="mt-3 font-bold text-slate-900">{r.title}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Icon name="pin" size="sm" className="shrink-0 text-slate-400" />
                        {r.barangay_name ?? r.department_name ?? CITY_NAME}
                      </p>

                      {r.resolved_at && (
                        <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
                          <Icon name="calendar" size="sm" className="shrink-0" />
                          Resolved {new Date(r.resolved_at).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ================= FAQ ================= */}
      <Reveal>
        <section id="faq" className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-5 sm:pb-20">
          <p className="reveal text-center text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">
            FAQ
          </p>
          <h2 className="reveal mt-2 text-center text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Common questions
          </h2>

          <div className="reveal-group mt-8 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="reveal group rounded-2xl border border-slate-200 bg-white px-5 py-4 transition hover:border-primary-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Icon
                    name="chevron-down"
                    size="md"
                    className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ================= CTA band ================= */}
      <Reveal>
        <section className="px-4 pb-20 sm:px-5">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-navy bg-cover bg-center px-8 py-14 text-center text-white sm:py-16" style={{ backgroundImage: "url('/blue-bg.jpg')" }}>
            <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #06ABEA, transparent 65%)" }} />
            <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #2E8254, transparent 65%)" }} />
            <h2 className="relative text-2xl font-extrabold sm:text-3xl">
              Ready to improve your community?
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm text-primary-200">
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
      </Reveal>

      {/* ================= footer — navy like the header ================= */}
      <footer className="mt-auto border-t border-white/10 bg-navy bg-cover bg-center px-4 py-10 text-white sm:px-5" style={{ backgroundImage: "url('/blue-bg.jpg')" }}>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <Logo size={30} />
                <p className="text-sm font-bold text-white">{CLIENT_NAME}</p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-primary-200">
                {TAGLINE} — helping residents and staff of {CITY_NAME} keep the
                community safe, clean and moving.
              </p>
            </div>

            <div className="flex gap-14">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary-300">Product</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-primary-100">
                  <a href="#how" className="transition hover:text-white">How it works</a>
                  <a href="#features" className="transition hover:text-white">Features</a>
                  <a href="#resolved" className="transition hover:text-white">Resolved reports</a>
                  <a href="#faq" className="transition hover:text-white">FAQ</a>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary-300">Access</p>
                <div className="mt-3 flex flex-col gap-2 text-sm text-primary-100">
                  <Link href="/register" className="transition hover:text-white">Create account</Link>
                  <Link href="/login" className="transition hover:text-white">Staff sign in</Link>
                  <Link href="/install" className="transition hover:text-white">Install the app</Link>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-5 text-xs text-primary-300 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} {CLIENT_NAME} · {CITY_NAME}</p>
            <p>Report an issue · Track it · See it fixed</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

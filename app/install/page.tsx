import Link from "next/link";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Logo, CLIENT_NAME, TAGLINE } from "@/app/brand";

function Steps({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="font-bold">{title}</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">{children}</ol>
    </Card>
  );
}

export default function InstallPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Logo size={44} />
        <div>
          <p className="font-bold">{CLIENT_NAME}</p>
          <p className="text-xs text-slate-500">{TAGLINE}</p>
        </div>
      </div>

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        Install on your phone
        <Icon name="smartphone" size="lg" className="text-primary-500" />
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Add {CLIENT_NAME} to your home screen for a full-screen, app-like
        experience — no app store needed.
      </p>

      <div className="mt-6 space-y-4">
        <Steps title="Android — Chrome">
          <li>Tap the <strong>⋮ menu</strong> (top-right corner)</li>
          <li>Tap <strong>“Add to Home screen”</strong> or <strong>“Install app”</strong></li>
          <li>Confirm — the icon appears on your home screen</li>
        </Steps>

        <Steps title="iPhone / iPad — Safari">
          <li>Tap the <strong>Share</strong> button (the square with an arrow, at the bottom)</li>
          <li>Scroll down and tap <strong>“Add to Home Screen”</strong></li>
          <li>Tap <strong>Add</strong> — done</li>
        </Steps>
        <p className="-mt-2 px-1 text-xs text-slate-400">
          iPhone note: this must be done in Safari — the option doesn&apos;t appear in
          Chrome/Facebook in-app browsers.
        </p>

        <Steps title="Desktop — Chrome / Edge">
          <li>Look for the install icon in the address bar, or</li>
          <li>Open the <strong>⋮ menu → “Install {CLIENT_NAME}…”</strong></li>
        </Steps>
      </div>

      <div className="mt-6 flex gap-2">
        <Link
          href="/dashboard"
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Go to the app
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Home
        </Link>
      </div>
    </main>
  );
}

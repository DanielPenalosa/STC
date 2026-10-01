"use client";

import { useState } from "react";
import { testFacebookConnection } from "@/app/actions/admin";
import { Card, btn } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Admin card: Facebook Page auto-posting. The token + page id live in
 * server env vars (never in the DB — app_settings is readable by every
 * authenticated user). This card reports whether they're set and lets the
 * admin test the connection against the Graph API.
 */
export default function FacebookCard() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    configured: boolean;
    name?: string;
    link?: string;
    error?: string;
  } | null>(null);

  async function onTest() {
    setTesting(true);
    setResult(null);
    const res = await testFacebookConnection();
    setResult(res);
    setTesting(false);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Icon name="globe" size="md" className="text-primary-600" />
            Facebook Page auto-posting
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            When a report is approved as <strong>Resolved</strong>, its before/after
            photos are published to the municipality&apos;s Facebook Page
            automatically.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            result?.configured ?? false
              ? "bg-success-50 text-success-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              result?.configured ?? false ? "bg-success-500" : "bg-slate-400"
            }`}
          />
          {result?.configured ?? false ? "Env vars set" : "Not configured"}
        </span>
      </div>

      <button
        onClick={onTest}
        disabled={testing}
        className={`${btn.secondary} mt-3`}
      >
        {testing ? "Testing…" : "Test connection"}
      </button>

      {result && !result.ok && (
        <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-xs leading-relaxed text-danger-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p className="mt-2 rounded-lg bg-success-50 px-3 py-2 text-xs leading-relaxed text-success-700">
          Connected to <strong>{result.name}</strong> — auto-posting is live.
          {result.link && (
            <>
              {" "}
              <a
                href={result.link}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                View Page
              </a>
            </>
          )}
        </p>
      )}

      <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
          How to connect the Page
        </summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-500">
          <li>
            Create a free app at <code className="rounded bg-slate-200/60 px-1">developers.facebook.com</code>{" "}
            (type <em>Business</em>).
          </li>
          <li>
            Generate a user token with <code className="rounded bg-slate-200/60 px-1">pages_manage_posts</code>{" "}
            + <code className="rounded bg-slate-200/60 px-1">pages_read_engagement</code>, then exchange it for a{" "}
            <strong>Page token</strong> (Graph API Explorer → your Page). Long-lived page tokens don&apos;t expire.
          </li>
          <li>
            Copy your Page ID from the Page&apos;s &ldquo;About&rdquo; section.
          </li>
          <li>
            In Vercel (or <code className="rounded bg-slate-200/60 px-1">.env.local</code>) set{" "}
            <code className="rounded bg-slate-200/60 px-1">FACEBOOK_PAGE_ID</code> and{" "}
            <code className="rounded bg-slate-200/60 px-1">FACEBOOK_PAGE_ACCESS_TOKEN</code>, plus{" "}
            <code className="rounded bg-slate-200/60 px-1">NEXT_PUBLIC_APP_ORIGIN</code> = your site URL (Vercel
            sets <code className="rounded bg-slate-200/60 px-1">VERCEL_URL</code> automatically) — Facebook&apos;s
            servers fetch the photos through the public photo proxy.
          </li>
          <li>Redeploy, then come back and press “Test connection”.</li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-400">
          Note: full Page posting requires App Review for the two permissions once the
          app goes public — while in Development mode the posts are visible only to
          Page admins with a role on the app.
        </p>
      </details>
    </Card>
  );
}

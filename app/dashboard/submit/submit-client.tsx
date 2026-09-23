"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress";
import {
  classifyPhotoInBrowser,
  preloadBrowserModel,
} from "@/lib/ai/local/browser-clip";
import { createReport } from "@/app/actions/reports";
import { btn, inputCls, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CONFIDENCE_THRESHOLD } from "@/lib/constants";

type Opt = { id: string; name: string; slug?: string };

/** "Water leak / pipe break" + "Malanday" → "Water leak / pipe break — Malanday". */
function makeTitle(issue: string, place: string | null): string {
  const base = issue.charAt(0).toUpperCase() + issue.slice(1);
  const seg = (place ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return seg ? `${base} — ${seg}` : base;
}

/** First two comma segments of an OSM display name — compact address. */
function shortAddress(name: string): string {
  return name
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

/** Stages shown in the "Analyzing report…" card (reference-style checklist). */
const ANALYZE_STEPS: { label: string }[] = [
  { label: "Upload image securely" },
  { label: "Analyzing image" },
  { label: "Identifying infrastructure" },
  { label: "Checking location" },
  { label: "Determining responsible office" },
  { label: "Preparing report" },
];

/** Office display names for the "Assigned to" row, by department slug hint. */
const OFFICE_NAMES: Record<string, string> = {
  environment: "MENRO",
  disaster: "MDRRMO",
  engineering: "Engineering Office",
  utilities: "Utilities Office",
  "public-safety": "Public Safety Office",
};

const URGENCY_CHIP: Record<string, string> = {
  critical: "bg-danger-600 text-white",
  high: "bg-danger-100 text-danger-700",
  medium: "bg-warn-100 text-warn-700",
  low: "bg-slate-100 text-slate-600",
};

/** Human severity wording for the Severity row (medium → "Moderate"). */
const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Moderate",
  low: "Low",
};

/** Friendly message for a failed photo quality check. */
function photoQualityMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "too_blurry":
      return "The photo is blurry — the AI couldn't read it clearly.";
    case "too_dark":
      return "The photo is too dark to analyze.";
    case "too_bright":
      return "The photo is overexposed — too much glare to analyze.";
    default:
      return "The photo couldn't be analyzed.";
  }
}

/** Label/value row used in the AI result card. */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs font-medium text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] font-semibold text-slate-800">
        {children}
      </dd>
    </div>
  );
}

/** SHA-256 of file bytes, hex — used for duplicate-photo detection. */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type DetectionState =
  | { phase: "idle" }
  | { phase: "locating" }
  | { phase: "detected"; barangayId: string; label: string; accuracyNote?: string }
  | { phase: "outside"; coords: { lat: number; lng: number }; placeName?: string | null }
  | { phase: "denied" }
  | { phase: "timeout" }
  | { phase: "unsupported" };

/** Shape of the pre-submission AI result shown in the card. */
type AiPrecheck = {
  detected_issue: string;
  urgency: "low" | "medium" | "high" | "critical" | null;
  confidence: number;
  reason: string | null;
  needs_review: boolean;
  needs_review_reason: string | null;
  secondary_issues: string[];
  /** routing suggestion for the "Assigned to" row (advisory) */
  level: "barangay" | "municipal" | null;
  office: string | null;
  /** short problem text for the "Problem" row, e.g. "Sanitation/health concern" */
  problem: string | null;
  /** photo quality gate from the analyzer — ok:false means blurry/dark/unreadable */
  photoQuality: { ok: boolean; reason: string | null } | null;
  /** analyzer judged the photo as unrelated to any civic/infrastructure issue */
  unrelated: boolean;
  /** the analysis itself failed (model unavailable etc.) — never blame the photo */
  analysisFailed: boolean;
};

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-xs font-extrabold text-primary-600">
          {n}
        </span>
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </Card>
  );
}

export default function SubmitReportClient({
  categories,
  profile,
}: {
  categories: Opt[];
  profile: { full_name: string | null };
}) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [addressText, setAddressText] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detection, setDetectionState] = useState<DetectionState>({ phase: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ai, setAi] = useState<AiPrecheck | null>(null);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  /** bumped when the first photo is removed — invalidates in-flight analysis */
  const analyzeToken = useRef(0);
  /** one silent auto-location attempt per page load (retry stays manual) */
  const autoLocated = useRef(false);
  /** mirror of detection state — readable inside async callbacks without staleness */
  const detectionRef = useRef<DetectionState>({ phase: "idle" });
  /** detected issue from the latest AI run — feeds the title auto-fill */
  const aiIssueRef = useRef<string | null>(null);
  /** hidden file input — focused programmatically by "Replace photo" */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** keep detectionRef in sync so async flows can read the latest phase */
  function setDetection(d: DetectionState) {
    detectionRef.current = d;
    setDetectionState(d);
  }

  /**
   * Auto-fill the title once BOTH the AI issue and the location are in —
   * the citizen only writes the description. Never overwrites typed text.
   */
  function autoFillTitle() {
    const issue = aiIssueRef.current;
    if (!issue) return; // AI result not in yet — GPS path calls this again
    const d = detectionRef.current;
    const place =
      d.phase === "detected"
        ? d.label
        : d.phase === "outside"
          ? (d.placeName ?? null)
          : null;
    setTitle((t) => (t.trim() ? t : makeTitle(issue, place)));
  }
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // server-side storage ids for photos already uploaded this session —
  // keyed by index so each thumbnail can be cancelled individually
  const [uploadedPaths, setUploadedPaths] = useState<(string | null)[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  // keeps auto-retry from re-arming when the photo was removed mid-flight
  const filesRef = useRef<File[]>([]);
  filesRef.current = files;
  const analyzeRetry = useRef(0);

  // start downloading the browser AI model on mount — it overlaps with the
  // citizen picking a photo instead of delaying the first analysis
  useEffect(() => {
    preloadBrowserModel();
  }, []);

  /**
   * Photo picked (camera or gallery): kick off the server upload immediately
   * so it can be cancelled individually, then run the AI analysis on the
   * compressed copy (raw camera files made mobile analysis slow/flaky).
   */
  async function onPhotoSelected(fileList: FileList | null) {
    const arr = Array.from(fileList ?? []);
    setFiles(arr);
    filesRef.current = arr;
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
    setUploadedPaths(arr.map(() => null));
    analyzeRetry.current = 0;

    // upload each photo NOW (not on submit) so it can be cancelled
    // individually before the report goes in
    for (let i = 0; i < arr.length; i++) {
      setUploadingCount((c) => c + 1);
      void (async () => {
        try {
          const compressed = await compressImage(arr[i]);
          const path = `pending/${Date.now()}-${compressed.name}`;
          const fd = new FormData();
          fd.append("file", compressed);
          fd.append("path", path);
          const upRes = await fetch("/api/upload-photo", { method: "POST", body: fd });
          const upJson = await upRes.json().catch(() => ({}));
          if (!upRes.ok || !upJson.ok) throw new Error(upJson.error ?? "upload failed");
          const serverPath = String(upJson.path ?? path);
          setUploadedPaths((prev) => prev.map((v, j) => (j === i ? serverPath : v)));
        } catch {
          // keep the local file — submit will retry the upload
        } finally {
          setUploadingCount((c) => Math.max(0, c - 1));
        }
      })();
    }

    if (!arr[0]) {
      setAi(null);
      return;
    }
    // kick off GPS detection in parallel with the photo analysis — the
    // citizen never taps "Detect my barangay" (manual retry still exists)
    if (detectionRef.current.phase === "idle" && !autoLocated.current) {
      startGpsDetection({ auto: true });
    }
    await runAnalysis();
  }

  /**
   * Analyze the first photo with the local CLIP pipeline. Runs once per
   * photo selection, on manual retry, and once automatically after a
   * failure — cold starts and flaky mobile signal are transient.
   */
  async function runAnalysis() {
    const first = filesRef.current[0];
    if (!first) return;
    setAiBusy(true);
    setAnalyzeStep(0);
    const token = ++analyzeToken.current;
    const started = Date.now();
    let response: Record<string, unknown> | null = null;
    const stepTimer = setInterval(() => {
      setAnalyzeStep((s) => Math.min(s + 1, ANALYZE_STEPS.length - 1));
    }, 1300);
    try {
      // BROWSER model first — the photo is analyzed on-device with the same
      // CLIP model + decision rules, so the verdict no longer depends on the
      // server being able to hold a 150 MB model (serverless deploys can't,
      // which is why the deployed link always showed "AI check unavailable")
      const verdict = await classifyPhotoInBrowser(first, {
        description,
      });
      if (!verdict.failed) {
        response = {
          detected_issue: verdict.issue?.title ?? "Unrecognized",
          urgency: verdict.urgency?.level ?? null,
          confidence: verdict.confidence,
          reason: verdict.urgency?.reason ?? verdict.needs_review_reason ?? null,
          needs_review: verdict.needs_review,
          needs_review_reason: verdict.needs_review_reason,
          secondary_issues: verdict.secondary.map((s) => s.title),
          suggested_level: verdict.routing?.level ?? null,
          suggested_department: verdict.routing?.departmentHint ?? null,
          quality: verdict.quality,
          unrelated: verdict.unrelated,
          analysis_failed: verdict.analysis_failed,
          suggested_category_slug: verdict.suggestedCategorySlug,
        };
        return; // done — the finally block handles the UI handoff
      }
      // browser path unavailable → server fallback (local dev, warm VPS)
      const fd = new FormData();
      fd.append("photo", await compressImage(first));
      fd.append("description", description);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok || json.detected_issue) {
        response = json;
      }
    } catch {
      // AI is advisory — the failure branch below handles the retry/UI
    } finally {
      // let the checklist run its full animation before the result swaps in
      const elapsed = Date.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 2600 - elapsed)));
      clearInterval(stepTimer);
      if (token !== analyzeToken.current) return; // photo removed mid-analysis
      if (response) {
        // flash every step green for a beat, then show the result
        setAnalyzeStep(ANALYZE_STEPS.length);
        await new Promise((r) => setTimeout(r, 650));
        const hint =
          typeof response.suggested_department === "string"
            ? response.suggested_department
            : null;
        const rawReason = (response.reason as string | null) ?? null;
        // "Flagged medium — sanitation/health concern." → "Sanitation/health concern"
        const problem = rawReason?.startsWith("Flagged")
          ? (rawReason.split("—")[1] ?? "").trim().replace(/\.$/, "")
          : null;
        setAi({
          detected_issue: String(response.detected_issue),
          urgency:
            response.urgency === "low" ||
            response.urgency === "medium" ||
            response.urgency === "high" ||
            response.urgency === "critical"
              ? response.urgency
              : null,
          confidence: Number(response.confidence ?? 0),
          reason: rawReason,
          needs_review: Boolean(response.needs_review),
          needs_review_reason: (response.needs_review_reason as string | null) ?? null,
          secondary_issues: Array.isArray(response.secondary_issues)
            ? (response.secondary_issues as string[])
            : [],
          level:
            response.suggested_level === "barangay" || response.suggested_level === "municipal"
              ? (response.suggested_level as "barangay" | "municipal")
              : null,
          office: hint ? (OFFICE_NAMES[hint] ?? hint) : null,
          problem: problem ? problem.charAt(0).toUpperCase() + problem.slice(1) : null,
          photoQuality:
            response.quality && typeof response.quality === "object"
              ? {
                  ok: Boolean((response.quality as { ok?: boolean }).ok),
                  reason:
                    ((response.quality as { reason?: string | null }).reason ??
                      null) ?? null,
                }
              : null,
          unrelated: Boolean(response.unrelated),
          analysisFailed: Boolean(response.analysis_failed),
        });

        // auto-fill — title from issue + location, category from the issue map
        // (skipped when the photo is unrelated — nothing worth pre-filling)
        const unrelated = Boolean(response.unrelated);
        aiIssueRef.current = unrelated ? null : String(response.detected_issue);
        const slug =
          !unrelated && typeof response.suggested_category_slug === "string"
            ? response.suggested_category_slug
            : null;
        if (slug) {
          const hit =
            categories.find((c) => c.slug === slug) ??
            categories.find(
              (c) => c.slug && (slug.includes(c.slug) || c.slug.includes(slug))
            );
          if (hit) setCategoryId((cur) => cur ?? hit.id);
        }
        autoFillTitle();
      } else {
        // request failed entirely (network, server cold-start, non-JSON) —
        // same honest neutral state: never blame the photo, never block submit
        setAi({
          detected_issue: "Unrecognized",
          urgency: null,
          confidence: 0,
          reason: null,
          needs_review: true,
          needs_review_reason: "AI analysis could not be reached — a staff member will review the photo manually.",
          secondary_issues: [],
          level: null,
          office: null,
          problem: null,
          photoQuality: { ok: true, reason: null },
          unrelated: false,
          analysisFailed: true,
        });
        // mobile friendliness: cold starts and flaky signal are the usual
        // culprit — retry once automatically after a short backoff
        const attempt = analyzeRetry.current + 1;
        analyzeRetry.current = attempt;
        if (attempt <= 1) {
          setTimeout(() => {
            if (token === analyzeToken.current && filesRef.current.length > 0) {
              void runAnalysis();
            }
          }, 2500);
        }
      }
      setAiBusy(false);
    }
  }

  /** Remove one photo before submitting: cancel button on each thumbnail. */
  async function removePhoto(idx: number) {
    const serverPath = uploadedPaths[idx];
    if (serverPath) {
      // already on the server — delete it there (own pending folder only)
      void fetch(`/api/delete-photo?path=${encodeURIComponent(serverPath)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
    setUploadedPaths((prev) => prev.filter((_, i) => i !== idx));
    if (idx === 0) {
      // AI pre-check was based on the first photo — kill it everywhere
      analyzeToken.current++;
      analyzeRetry.current = 0;
      setAiBusy(false);
      setAnalyzeStep(0);
      setAi(null);
    }
  }

  /**
   * Capture GPS and auto-detect the barangay. The citizen never picks a
   * barangay — the system resolves it from the coordinates.
   */
  /**
   * Capture GPS and auto-detect the barangay. The citizen never picks a
   * barangay — the system resolves it from the coordinates.
   *
   * Accuracy matters: the FIRST fix a phone reports is often a coarse
   * cell-tower/wi-fi fix that can land hundreds of meters away — in a town
   * of compact barangays that means the WRONG barangay. So we watch the GPS
   * for a few seconds and keep the most accurate fix (stopping early once
   * it's good), then send THAT one to detection.
   */
  function startGpsDetection(opts?: { auto?: boolean }) {
    // auto mode: silent one-shot attempt fired when the first photo lands —
    // the citizen sees the permission prompt but never has to tap anything
    if (opts?.auto) autoLocated.current = true;
    if (!navigator.geolocation) {
      setDetection({ phase: "unsupported" });
      return;
    }
    setDetection({ phase: "locating" });

    let best: GeolocationPosition | null = null;
    let denied = false;
    let settled = false;
    let watchId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (timer !== undefined) clearTimeout(timer);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      stop();
      if (!best) {
        setDetection({ phase: denied ? "denied" : "timeout" });
        return;
      }
      void detectFrom(best);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        if (!best || acc < best.coords.accuracy) best = pos;
        if (acc <= 30) finish(); // accurate enough — no need to keep waiting
      },
      () => {
        denied = true;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    // hard cap — never keep the citizen waiting longer than this
    timer = setTimeout(finish, 10000);
  }

  async function detectFrom(pos: GeolocationPosition) {
    const { latitude, longitude } = pos.coords;
    const accuracy = pos.coords.accuracy;
    setCoords({ lat: latitude, lng: longitude });
    try {
      const res = await fetch("/api/detect-barangay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latitude, lng: longitude }),
      });
      const json = await res.json();
      const accNote =
        Number.isFinite(accuracy) && accuracy > 0
          ? `GPS accuracy ±${Math.round(accuracy)} m`
          : null;
      if (json.ok && json.barangay_id) {
        const street =
          typeof json.display_name === "string" ? json.display_name : null;
        if (street) setAddressText((a) => (a.trim() ? a : shortAddress(street)));
        setDetection({
          phase: "detected",
          barangayId: json.barangay_id,
          label: json.barangay_name,
          accuracyNote:
            [street, accNote].filter((s): s is string => Boolean(s)).join(" · ") ||
            undefined,
        });
      } else if (json.ok && json.reason === "outside") {
        if (json.place_name)
          setAddressText((a) =>
            a.trim() ? a : shortAddress(String(json.place_name))
          );
        setDetection({
          phase: "outside",
          coords: { lat: latitude, lng: longitude },
          placeName: json.place_name ?? null,
        });
      } else {
        setDetection({
          phase: "outside",
          coords: { lat: latitude, lng: longitude },
          placeName: null,
        });
      }
    } catch {
      setDetection({ phase: "outside", coords: { lat: latitude, lng: longitude } });
    }
    // location just resolved — title auto-fill may now complete
    autoFillTitle();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const photoPaths: string[] = [];
      const photoHashes: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // reuse the upload made on selection; only upload if missing
        // (cancelled or failed earlier uploads are retried here)
        const existing = uploadedPaths[i];
        if (existing) {
          photoPaths.push(existing);
        } else {
          const compressed = await compressImage(f);
          const path = `pending/${Date.now()}-${compressed.name}`;
          const fd = new FormData();
          fd.append("file", compressed);
          fd.append("path", path);
          const upRes = await fetch("/api/upload-photo", { method: "POST", body: fd });
          const upJson = await upRes.json().catch(() => ({}));
          if (!upRes.ok || !upJson.ok) {
            throw new Error(upJson.error ?? "Photo upload failed");
          }
          photoPaths.push(String(upJson.path ?? path));
        }
        photoHashes.push(await sha256Hex(await f.arrayBuffer()));
      }

      const res = await createReport({
        // title is auto-filled from the AI result + GPS; fall back to the
        // description / detected address if the analysis never ran
        title:
          title.trim() ||
          description.trim().slice(0, 60) ||
          addressText?.split(",")[0]?.trim() ||
          "Community report",
        description,
        categoryId,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        addressText: addressText || null,
        photoPaths,
        photoHashes,
      });
      if (!res.ok) throw new Error(res.error ?? "Failed to submit report");

      router.push("/dashboard/my-reports");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
          Report an issue
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Filed by{" "}
          <span className="font-semibold text-slate-700">
            {profile.full_name ?? "you"}
          </span>{" "}
          — verified resident reports only.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* step 1 — photo */}
        <Section n="1" title="Photos" hint="First photo gets an AI pre-check">
          <label className="press flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center transition hover:border-primary-300 hover:bg-primary-50/40">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary-500 shadow-sm">
              <Icon name="camera" size="lg" />
            </span>
            <span className="mt-2.5 text-sm font-semibold text-slate-600">
              Take or choose a photo
            </span>
            <span className="mt-0.5 text-xs text-slate-400">
              Clear, well-lit photos get better AI results
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => void onPhotoSelected(e.target.files)}
            />
          </label>

          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {previews.map((src, i) => (
                <div key={i} className="group relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="preview"
                    className={`h-20 w-20 rounded-xl border object-cover ${
                      uploadedPaths[i] ? "border-slate-200" : "border-dashed border-warn-300"
                    }`}
                  />
                  {/* still uploading indicator */}
                  {!uploadedPaths[i] && !submitting && (
                    <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/60 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                      uploading…
                    </span>
                  )}
                  {/* cancel — removes the photo (and the uploaded copy) */}
                  <button
                    type="button"
                    onClick={() => void removePhoto(i)}
                    aria-label="Remove photo"
                    title="Remove photo"
                    className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-white shadow-md transition hover:bg-danger-500"
                  >
                    <Icon name="close" size="sm" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* relevance gate — photo shows nothing related to civic issues */}
          {ai?.unrelated && (
            <div className="flex items-start gap-3 rounded-2xl border border-warn-300 bg-warn-50/80 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn-100 text-warn-600">
                <Icon name="alert" size="md" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-warn-800">
                  This photo doesn&apos;t look related to a community issue
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-warn-700/90">
                  Upload a photo of the actual problem — damaged roads,
                  garbage, leaks, broken streetlights, and similar. Reports
                  need clear evidence of the issue itself, so you can&apos;t
                  submit until this photo is replaced.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`${btn.primary} press mt-2.5 px-3.5 py-2 text-xs`}
                >
                  <Icon name="camera" size="sm" /> Upload a related photo
                </button>
              </div>
            </div>
          )}

          {/* analysis failure — the AI couldn't run. This is NOT the photo's
              fault, so no retake demand: submission stays open (AI is
              advisory) and a staff member reviews the photo manually. */}
          {ai && !aiBusy && ai.analysisFailed && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="alert" size="md" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800">
                  AI check unavailable right now
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  We couldn&apos;t analyze your photo — this is a temporary
                  problem on our side, not with your photo. You can still
                  submit the report below; a staff member will review the photo
                  manually.
                </p>
                <button
                  type="button"
                  onClick={() => void runAnalysis()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 active:bg-slate-100"
                >
                  <Icon name="link" size="sm" />
                  Try analyzing again
                </button>
              </div>
            </div>
          )}

          {/* quality gate — analyzer flagged the photo itself as unusable */}
          {ai?.photoQuality && !ai.photoQuality.ok && !ai.analysisFailed && (
            <div className="flex items-start gap-3 rounded-2xl border border-warn-300 bg-warn-50/80 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn-100 text-warn-600">
                <Icon name="alert" size="md" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-warn-800">
                  Please upload a new, clear photo
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-warn-700/90">
                  {photoQualityMessage(ai.photoQuality.reason)} Hold the phone
                  steady, get closer, and make sure the area is well lit.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`${btn.primary} press mt-2.5 px-3.5 py-2 text-xs`}
                >
                  <Icon name="camera" size="sm" /> Replace with a clear photo
                </button>
              </div>
            </div>
          )}

          {aiBusy && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 pt-4 pb-3 text-center">
                <p className="text-base font-extrabold tracking-tight text-slate-900">
                  Analyzing report…
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  AI is identifying the problem. Hang tight — this takes a few
                  seconds.
                </p>
              </div>
              <div className="relative h-56 w-full overflow-hidden bg-slate-100">
                {previews[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[0]}
                    alt="Photo being analyzed"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white">
                  ✦ AI
                </span>
                <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-slate-200/50">
                  <span className="block h-full w-1/3 animate-[analyze-sweep_1.4s_ease-in-out_infinite] bg-primary-500" />
                </span>
              </div>
              <ul className="space-y-2.5 px-4 py-4">
                {ANALYZE_STEPS.map((s, i) => {
                  const done = i < analyzeStep;
                  const active = i === analyzeStep;
                  return (
                    <li key={s.label} className="flex items-center gap-2.5">
                      {done ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-500 text-white">
                          <Icon name="check" size="sm" strokeWidth={3} />
                        </span>
                      ) : active ? (
                        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                      ) : (
                        <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-200" />
                      )}
                      <span
                        className={`text-[13px] ${
                          done
                            ? "font-medium text-slate-500"
                            : active
                              ? "font-semibold text-slate-800"
                              : "text-slate-300"
                        }`}
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {ai && !aiBusy && !ai.unrelated && !ai.analysisFailed && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 pt-4 text-center">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    ai.needs_review || ai.confidence < CONFIDENCE_THRESHOLD
                      ? "bg-warn-100 text-warn-700"
                      : "bg-success-50 text-success-700"
                  }`}
                >
                  {ai.needs_review || ai.confidence < CONFIDENCE_THRESHOLD ? (
                    <>
                      <Icon name="alert" size="sm" /> {Math.round(ai.confidence * 100)}% confidence
                    </>
                  ) : (
                    <>
                      <Icon name="check-circle" size="sm" /> {Math.round(ai.confidence * 100)}% confidence
                    </>
                  )}
                </span>
                <p className="mt-1.5 text-lg font-extrabold tracking-tight text-slate-900">
                  {ai.detected_issue}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Report detected — please confirm before submission.
                </p>
              </div>
              <div className="relative mt-3 h-56 w-full overflow-hidden bg-slate-100">
                {previews[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[0]}
                    alt="Analyzed photo"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-bold text-white">
                  ✦ AI
                </span>
              </div>
              <dl className="divide-y divide-slate-100 px-4 py-1">
                <DetailRow label="Object">{ai.detected_issue}</DetailRow>
                <DetailRow label="Problem">
                  {ai.problem ?? "See description below"}
                </DetailRow>
                <DetailRow label="Location">
                  {detection.phase === "detected" ? (
                    <>
                      {detection.label} <Icon name="check" size="sm" className="inline text-success-500" strokeWidth={3} />
                    </>
                  ) : detection.phase === "locating" || detection.phase === "idle" ? (
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
                      Auto-detecting…
                    </span>
                  ) : (
                    // the only visible control left — retry detection inline
                    <button
                      type="button"
                      onClick={() => startGpsDetection()}
                      className="text-warn-600 underline decoration-dotted underline-offset-2"
                    >
                      Not detected — tap to retry
                    </button>
                  )}
                </DetailRow>
                <DetailRow label="GPS">
                  {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "—"}
                </DetailRow>
                <DetailRow label="Assigned to">
                  {ai.office
                    ? `${ai.office} (suggested)`
                    : ai.level === "municipal"
                      ? "Municipal office (suggested)"
                      : "Barangay office (suggested)"}
                </DetailRow>
                <DetailRow label="Severity">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${URGENCY_CHIP[ai.urgency ?? "low"]}`}
                  >
                    {SEVERITY_LABELS[ai.urgency ?? ""] ?? "Moderate"}
                  </span>
                </DetailRow>
              </dl>
              {ai.reason && (
                <p className="border-t border-slate-100 px-4 py-2.5 text-xs leading-relaxed text-slate-500">
                  <span className="font-semibold text-slate-600">Why:</span> {ai.reason}
                </p>
              )}
              {ai.secondary_issues.length > 0 && (
                <p className="px-4 pb-1 text-[11px] text-slate-400">
                  Also spotted: {ai.secondary_issues.join(", ")}
                </p>
              )}
              {(ai.needs_review || ai.confidence < CONFIDENCE_THRESHOLD) && (
                <p className="flex items-start gap-1.5 bg-warn-50/60 px-4 py-2.5 text-[11px] leading-relaxed text-warn-700">
                  <Icon name="alert" size="sm" className="mt-0.5 shrink-0" />
                  {ai.needs_review_reason ?? "Low confidence"} — an admin will double-check the classification.
                </p>
              )}
              <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-snug text-slate-400">
                Everything above was detected from your photo — just add a
                description below and submit.
              </p>
            </div>
          )}
        </Section>

        {/* step 2 — description. Title, category, barangay and GPS are
            all detected automatically; this is the only field left. */}
        <Section n="2" title="Description" hint="The only thing we need from you">
          <textarea id="description" required rows={4} className={inputCls}
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue — what's happening, when you noticed it, and anything helpful for responders." />
        </Section>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            <Icon name="alert" size="md" className="shrink-0" />
            {error}
          </p>
        )}

        {/* hard requirement — a report cannot go in without a photo */}
        {files.length === 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700">
            <Icon name="alert" size="md" className="shrink-0" />
            A photo is required — take or choose one above to enable submit.
          </p>
        )}
        {ai?.unrelated && (
          <p className="flex items-center gap-2 rounded-xl bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700">
            <Icon name="alert" size="md" className="shrink-0" />
            Submission is locked — replace the photo with a related one first.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || files.length === 0 || Boolean(ai?.unrelated)}
          className={`${btn.primary} press w-full py-3`}
        >
          {submitting
            ? "Submitting…"
            : files.length === 0
              ? "Add a photo to submit"
              : ai?.unrelated
                ? "Upload a related photo to submit"
                : "Submit report"}
          {!submitting && files.length > 0 && !ai?.unrelated && (
            <Icon name="send" size="md" />
          )}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          Reports are filed under your verified account. False or abusive reports
          may result in account suspension.
        </p>
      </form>
    </div>
  );
}

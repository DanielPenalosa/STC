"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createReport } from "@/app/actions/reports";
import { btn, inputCls, labelCls, Card } from "@/components/ui";
import { Icon } from "@/components/icons";

type Opt = { id: string; name: string };

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
  const [detection, setDetection] = useState<DetectionState>({ phase: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ai, setAi] = useState<{
    detected_issue: string;
    description: string | null;
    suggested_category_id: string | null;
    confidence: number;
    needs_review: boolean;
    needs_review_reason: string | null;
    secondary_issues: string[];
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhotoSelected(fileList: FileList | null) {
    const arr = Array.from(fileList ?? []);
    setFiles(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));

    const first = arr[0];
    if (!first) {
      setAi(null);
      return;
    }
    setAiBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", first);
      fd.append("description", description);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setAi({
          detected_issue: json.detected_issue,
          description: json.description ?? null,
          suggested_category_id: json.suggested_category_id ?? null,
          confidence: json.confidence ?? 0,
          needs_review: Boolean(json.needs_review),
          needs_review_reason: json.needs_review_reason ?? null,
          secondary_issues: Array.isArray(json.secondary_issues) ? json.secondary_issues : [],
        });
        if (json.suggested_category_id && !categoryId) {
          setCategoryId(json.suggested_category_id);
        }
      }
    } catch {
      // AI is advisory — ignore failures
    } finally {
      setAiBusy(false);
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
  function useGps() {
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
        setDetection({
          phase: "detected",
          barangayId: json.barangay_id,
          label: json.barangay_name,
          accuracyNote:
            [street, accNote].filter((s): s is string => Boolean(s)).join(" · ") ||
            undefined,
        });
      } else if (json.ok && json.reason === "outside") {
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
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const photoPaths: string[] = [];
      const photoHashes: string[] = [];
      for (const f of files) {
        // service-role upload via server route — policy drift on the live DB
        // can no longer make photos vanish between upload and admin view
        const path = `pending/${Date.now()}-${f.name}`;
        const fd = new FormData();
        fd.append("file", f);
        fd.append("path", path);
        const upRes = await fetch("/api/upload-photo", { method: "POST", body: fd });
        const upJson = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upJson.ok) {
          throw new Error(upJson.error ?? "Photo upload failed");
        }
        photoPaths.push(path);
        photoHashes.push(await sha256Hex(await f.arrayBuffer()));
      }

      const res = await createReport({
        title,
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

  const inputShell =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-50";
  const field =
    "w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-300";

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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt="preview"
                  className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover"
                />
              ))}
            </div>
          )}

          {aiBusy && (
            <p className="flex items-center gap-2 text-sm text-primary-600">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              AI is analyzing your photo…
            </p>
          )}

          {ai && !aiBusy && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-primary-800">
                  <Icon name="robot" size="md" />
                  {ai.detected_issue}
                </p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-primary-700">
                  {Math.round(ai.confidence * 100)}%
                </span>
              </div>
              {ai.description && (
                <p className="mt-1 text-xs italic leading-relaxed text-primary-700/80">
                  “{ai.description}”
                </p>
              )}
              <p className="mt-1 text-xs text-primary-700/80">
                Suggested:{" "}
                {categories.find((c) => c.id === ai.suggested_category_id)?.name ?? "—"}
              </p>
              {ai.secondary_issues.length > 0 && (
                <p className="mt-1 text-[11px] text-primary-600/80">
                  Also spotted: {ai.secondary_issues.join(", ")}
                </p>
              )}
              {(ai.needs_review || ai.confidence < 0.6) && (
                <p className="mt-1 text-[11px] text-warn-600">
                  {ai.needs_review_reason ?? "Low confidence"} — an admin will double-check the classification.
                </p>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-primary-500/80">
                Suggestion only — you can change the category below.
              </p>
            </div>
          )}
        </Section>

        {/* step 2 — details */}
        <Section n="2" title="Details" hint="What's happening?">
          <div>
            <label className={labelCls} htmlFor="title">Title</label>
            <div className={inputShell}>
              <input id="title" required maxLength={120} className={field}
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leaking water pipe on Mabini St." />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="description">Description</label>
            <textarea id="description" required rows={4} className={inputCls}
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue, when you noticed it, and anything helpful for responders." />
          </div>
          <div>
            <label className={labelCls} htmlFor="category">Category</label>
            <select id="category" className={inputCls} value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}>
              <option value="">— Select (AI may suggest one) —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* step 3 — location */}
        <Section n="3" title="Location" hint="Your barangay is detected automatically">
          <button type="button" onClick={useGps}
            className={`press flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition ${
              detection.phase === "detected"
                ? "border-success-200 bg-success-50/60"
                : detection.phase === "outside" || detection.phase === "denied" || detection.phase === "timeout" || detection.phase === "unsupported"
                ? "border-warn-200 bg-warn-50/50"
                : "border-slate-200 bg-white hover:bg-slate-50"
            }`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              detection.phase === "detected"
                ? "bg-success-100 text-success-600"
                : detection.phase === "locating"
                ? "bg-primary-50 text-primary-600"
                : "bg-slate-50 text-slate-400"
            }`}>
              <Icon name={detection.phase === "locating" ? "crosshair" : detection.phase === "detected" ? "check-circle" : "pin"} size="md" />
            </span>
            <span className="min-w-0 flex-1">
              {detection.phase === "idle" && (
                <>
                  <span className="block text-sm font-semibold text-slate-700">
                    Detect my barangay
                  </span>
                  <span className="block text-xs text-slate-400">
                    Uses your GPS — no manual selection needed
                  </span>
                </>
              )}
              {detection.phase === "locating" && (
                <>
                  <span className="block text-sm font-semibold text-slate-700">
                    Finding your location…
                  </span>
                  <span className="block text-xs text-slate-400">
                    Allow location access when prompted
                  </span>
                </>
              )}
              {detection.phase === "detected" && (
                <>
                  <span className="block text-sm font-semibold text-success-700">
                    {detection.label}
                  </span>
                  <span className="block text-xs text-success-600/80">
                    {detection.accuracyNote ?? "Detected from your GPS coordinates"}
                  </span>
                </>
              )}
              {detection.phase === "outside" && (
                <>
                  <span className="block text-sm font-semibold text-warn-700">
                    {detection.placeName
                      ? `Location captured — ${detection.placeName}`
                      : "Location captured — area not yet mapped"}
                  </span>
                  <span className="block text-xs text-warn-600/90">
                    {detection.coords.lat.toFixed(5)}, {detection.coords.lng.toFixed(5)} · submit anyway and staff will assign the right barangay
                  </span>
                </>
              )}
              {detection.phase === "denied" && (
                <>
                  <span className="block text-sm font-semibold text-warn-700">
                    Location access denied
                  </span>
                  <span className="block text-xs text-warn-600/90">
                    Enable GPS or describe the location below — the admin will route it
                  </span>
                </>
              )}
              {detection.phase === "timeout" && (
                <>
                  <span className="block text-sm font-semibold text-warn-700">
                    Couldn&apos;t get an accurate location
                  </span>
                  <span className="block text-xs text-warn-600/90">
                    Move to an open area and tap again, or describe the location below
                  </span>
                </>
              )}
              {detection.phase === "unsupported" && (
                <>
                  <span className="block text-sm font-semibold text-warn-700">
                    GPS not available on this device
                  </span>
                  <span className="block text-xs text-warn-600/90">
                    Describe the location below — the admin will route it
                  </span>
                </>
              )}
            </span>
            {detection.phase === "detected" && (
              <Icon name="check-circle" size="md" className="shrink-0 text-success-500" />
            )}
          </button>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Tip: GPS works best outdoors. We wait a few seconds for an accurate
            fix before detecting your barangay — if it&apos;s still wrong, tap to
            retry.
          </p>

          <div>
            <label className={labelCls} htmlFor="address">Address / landmark</label>
            <div className={inputShell}>
              <Icon name="pin" size="md" className="shrink-0 text-slate-300" />
              <input id="address" className={field} value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                placeholder="e.g. Near the corner of Rizal Ave." />
            </div>
          </div>
        </Section>

        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
            <Icon name="alert" size="md" className="shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${btn.primary} press w-full py-3`}>
          {submitting ? "Submitting…" : "Submit report"}
          {!submitting && <Icon name="send" size="md" />}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          Reports are filed under your verified account. False or abusive reports
          may result in account suspension.
        </p>
      </form>
    </div>
  );
}

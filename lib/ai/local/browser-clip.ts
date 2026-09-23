/**
 * lib/ai/local/browser-clip.ts — the SAME CLIP model, running IN the
 * citizen's browser (Transformers.js WASM build).
 *
 * Why this exists: on serverless hosts (Vercel & co.) the filesystem is
 * read-only/ephemeral, so the server can't keep the ~150 MB model and
 * /api/analyze dies — that was the "AI check unavailable" on every deploy.
 * Running the model in the browser removes the server from the equation:
 *   - works on ANY host (static, serverless, VPS — it's all the same)
 *   - no upload wait before the verdict: the photo never leaves the phone
 *   - the browser caches the model after the first visit (subsequent
 *     sessions are offline-capable)
 *
 * The FIRST ever visit downloads the model over the network straight from
 * Hugging Face's CDN — the UI shows a "preparing AI" progress state while
 * that happens, and /api/analyze stays available as a fallback.
 *
 * Decision rules come from ./decision — identical to the server pipeline.
 */
"use client";

import type { ImageQuality } from "@/lib/ai/vision";
import { decideFromClipScores, type VerdictResult } from "./decision";
import { ISSUE_LABELS } from "./labels";

const MODEL_ID = "Xenova/clip-vit-base-patch32";
export const BROWSER_MODEL_ID = "browser:clip-vit-base-patch32 (Transformers.js WASM)";

/** Progress callback: 0–1 while the model files download. */
export type LoadProgress = (fraction: number) => void;

/* --------------------------- singleton --------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
let browserPipelinePromise: Promise<any> | null = null;

async function getBrowserClassifier(
  onProgress?: LoadProgress
): Promise<any> {
  if (!browserPipelinePromise) {
    browserPipelinePromise = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.allowLocalModels = false;
      return tf.pipeline("zero-shot-image-classification", MODEL_ID, {
        dtype: "q8", // quantized — ~50 MB over the wire, WASM-friendly
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress?.(p.progress / 100);
          }
        },
      });
    })();
    browserPipelinePromise.catch(() => {
      browserPipelinePromise = null; // allow a retry on the next call
    });
  }
  return browserPipelinePromise;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** True once the model is downloaded and ready in this browser. */
export function isBrowserModelReady(): boolean {
  return browserPipelinePromise !== null;
}

/**
 * Kick off the model download without needing a photo yet. The submit page
 * calls this on mount so the download overlaps with the citizen finding
 * their camera instead of starting when they pick a photo.
 */
export function preloadBrowserModel(onProgress?: LoadProgress): void {
  void getBrowserClassifier(onProgress).catch(() => {
    // silent — the analysis path falls back to /api/analyze on failure
  });
}

/* ------------------------- image decoding ------------------------- */

/**
 * Decode + normalize to CLIP's 224×224 input using canvas, and compute the
 * same quality metrics as the server's sharp-based decoder (brightness from
 * channel means, blur proxy from grayscale variance) so both sides apply
 * the same gates.
 */
async function decodeImageBrowser(file: Blob): Promise<{
  image: unknown; // RawImage once transformers is loaded
  quality: ImageQuality;
}> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    1024 / Math.max(bitmap.width, bitmap.height)
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close?.();
    throw new Error("canvas 2d context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);

  // quality metrics from the full downscaled frame
  const frame = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let sumSq = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const px = frame.data;
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum;
    sumSq += lum * lum;
  }
  const brightness = (rSum + gSum + bSum) / (3 * n * 255);
  const variance = sumSq / n - (sum / n) ** 2;
  const blur = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / 40));

  const reason: ImageQuality["reason"] =
    brightness < 0.09
      ? "too_dark"
      : brightness > 0.985
        ? "too_bright"
        : blur > 0.98
          ? "too_blurry"
          : undefined;

  const quality: ImageQuality = {
    brightness: Number(brightness.toFixed(3)),
    blur: Number(blur.toFixed(3)),
    ok: !reason,
    reason,
  };

  // CLIP input: 224×224 RGB via a second canvas draw
  const clipCanvas = document.createElement("canvas");
  clipCanvas.width = 224;
  clipCanvas.height = 224;
  const clipCtx = clipCanvas.getContext("2d");
  if (!clipCtx) {
    bitmap.close?.();
    throw new Error("canvas 2d context unavailable");
  }
  clipCtx.drawImage(bitmap, 0, 0, 224, 224);
  bitmap.close?.();

  const { RawImage } = await import("@huggingface/transformers");
  // RawImage.fromCanvas consumes the canvas directly (WASM build)
  const image = RawImage.fromCanvas(clipCanvas);
  return { image, quality };
}

/* --------------------------- classify --------------------------- */

/**
 * Analyze one image blob entirely in the browser. Mirrors the server's
 * three-way outcome contract (ok / quality / failed) but applies the shared
 * decision core itself, returning the final verdict directly.
 */
export async function classifyPhotoInBrowser(
  file: Blob,
  opts: {
    title?: string;
    description?: string;
    onProgress?: LoadProgress;
  } = {}
): Promise<VerdictResult & { failed?: string }> {
  const empty: VerdictResult = {
    ok: false,
    issue: null,
    issueKey: null,
    secondary: [],
    confidence: 0,
    urgency: null,
    routing: null,
    suggestedCategorySlug: null,
    quality: { ok: true },
    unrelated: false,
    analysis_failed: true,
    needs_review: true,
    needs_review_reason: "AI analysis is temporarily unavailable.",
    model_used: BROWSER_MODEL_ID,
  };

  try {
    const classifier = await getBrowserClassifier(opts.onProgress);
    const { image, quality } = await decodeImageBrowser(file);
    if (!quality.ok) {
      return {
        ...decideFromClipScores({ results: [], confidence: 0, quality }),
        model_used: BROWSER_MODEL_ID,
      };
    }

    const prompts = ISSUE_LABELS.map((l) => l.prompt);
    let out: { label: string; score: number }[];
    try {
      out = (await classifier(image, prompts, {
        multi_label: true,
      })) as { label: string; score: number }[];
    } catch (firstError) {
      // one retry with a fresh session — same policy as the server
      console.warn("[browser-clip] inference failed once, retrying:", firstError);
      browserPipelinePromise = null;
      const retry = await getBrowserClassifier();
      out = (await retry(image, prompts, {
        multi_label: true,
      })) as { label: string; score: number }[];
    }

    const byPrompt = new Map(ISSUE_LABELS.map((l) => [l.prompt, l.key]));
    const scored = out
      .map((r) => ({ key: byPrompt.get(r.label), score: r.score }))
      .filter((r): r is { key: string; score: number } => Boolean(r.key));

    const top = scored[0]?.score ?? 0;
    const second = scored[1]?.score ?? 0;
    const confidence = Math.max(
      top,
      Math.min(1, top / (top + second + 0.05))
    );

    return {
      ...decideFromClipScores({
        results: scored,
        confidence,
        quality,
        title: opts.title,
        description: opts.description,
      }),
      model_used: BROWSER_MODEL_ID,
    };
  } catch (e) {
    console.error("[browser-clip] analysis failed:", e);
    return { ...empty, failed: e instanceof Error ? e.message : String(e) };
  }
}

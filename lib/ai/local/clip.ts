/**
 * lib/ai/local/clip.ts — 100% free, fully local zero-shot image classifier.
 *
 * Uses OpenAI's CLIP (ViT-B/32, ONNX build) through Transformers.js
 * (@huggingface/transformers — Apache-2.0 weights, MIT runtime):
 *   - no API key, no credits, no per-image fee
 *   - runs on CPU inside the existing Next.js Node server
 *   - zero-shot: it classifies against plain-English category names, so
 *     admin-managed categories work with NO training data
 *
 * The model (~150 MB quantized) downloads once from Hugging Face's free CDN
 * on first use and is cached on disk (.transformers-cache in the project
 * root, or env TRANSFORMERS_CACHE). Subsequent runs are fully offline.
 */
import type { ImageQuality } from "@/lib/ai/vision";

/* ----------------------------- types ----------------------------- */

export type ClipLabel = {
  /** plain-English label shown to the model, e.g. "a photo of a large pothole on a road" */
  prompt: string;
  /** canonical key returned to callers, e.g. "pothole" */
  key: string;
};

export type ClipScored = ClipLabel & { score: number };

export type ClipClassification = {
  ok: boolean;
  /** sorted best-first */
  results: ClipScored[];
  /** how "sure" the winning distribution is, 0–1 */
  confidence: number;
  quality: ImageQuality;
  model: string;
};

/* --------------------------- singleton --------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
let pipelinePromise: Promise<any> | null = null;
const MODEL_ID = "Xenova/clip-vit-base-patch32";
export const CLIP_MODEL_ID = "local:clip-vit-base-patch32 (Transformers.js)";

async function getClassifier(): Promise<any> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const tf = await import("@huggingface/transformers");
      // Keep the cache inside the project; the model downloads once then
      // works offline.TRANSFORMERS_CACHE env var overrides.
      try {
        tf.env.cacheDir = process.env.TRANSFORMERS_CACHE || "./.transformers-cache";
        tf.env.allowLocalModels = false;
      } catch {
        // env is read-only in some bundler contexts — defaults are fine
      }
      return tf.pipeline("zero-shot-image-classification", MODEL_ID, {
        dtype: "q8", // quantized — 4x smaller, CPU-friendly
      });
    })();
    pipelinePromise.catch(() => {
      pipelinePromise = null; // allow a retry on the next request
    });
  }
  return pipelinePromise;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------- image decoding ------------------------- */

type Decoded = { pixels: Uint8ClampedArray; quality: ImageQuality };

/**
 * Decode + normalize to CLIP's 224×224 input with sharp (already a
 * Transformers.js dependency — no new packages). Also computes real quality
 * metrics: brightness from channel means, blur proxy from pixel variance.
 * Returns null when the image can't be decoded at all.
 */
async function decodeImage(bytes: Uint8Array): Promise<Decoded | null> {
  try {
    const sharp = (await import("sharp")).default;
    const buffer = Buffer.from(bytes);

    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100) {
      return null; // too small to analyze reliably
    }

    // brightness from a tiny thumbnail — cheap and robust
    const stats = await sharp(buffer)
      .resize(32, 32, { fit: "inside" })
      .removeAlpha()
      .stats();
    const brightness =
      stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / (3 * 255);

    // blur proxy: low pixel variance on a 64px grayscale strip ⇒ featureless
    const strip = await sharp(buffer)
      .resize(64, 64, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    let sumSq = 0;
    for (const v of strip.data) {
      sum += v;
      sumSq += v * v;
    }
    const n = strip.data.length || 1;
    const variance = sumSq / n - (sum / n) ** 2;
    const blur = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / 40));

    const reason: ImageQuality["reason"] =
      brightness < 0.09
        ? "too_dark"
        : brightness > 0.97
          ? "too_bright"
          : blur > 0.98
            ? "too_blurry"
            : undefined;

    // CLIP input: 224×224 RGB
    const { data } = await sharp(buffer)
      .removeAlpha()
      .resize(224, 224, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      pixels: new Uint8ClampedArray(data),
      quality: {
        brightness: Number(brightness.toFixed(3)),
        blur: Number(blur.toFixed(3)),
        ok: !reason,
        reason,
      },
    };
  } catch {
    return null;
  }
}

/* --------------------------- inference --------------------------- */

/**
 * Zero-shot classify one image against arbitrary prompts. Never throws —
 * failures come back as null so callers degrade gracefully.
 */
export async function clipClassify(
  bytes: Uint8Array,
  labels: ClipLabel[]
): Promise<ClipClassification | null> {
  if (!labels.length) return null;

  const decoded = await decodeImage(bytes);
  if (!decoded) return null;

  try {
    const [{ pipeline }, { RawImage }] = await Promise.all([
      import("@huggingface/transformers"),
      import("@huggingface/transformers"),
    ]);
    const classifier = await getClassifier();

    const image = new RawImage(decoded.pixels, 224, 224, 3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await classifier(image, labels.map((l) => l.prompt), {
      multi_label: true, // a photo can show several issues at once
    })) as { label: string; score: number }[];

    const byPrompt = new Map(labels.map((l) => [l.prompt, l]));
    const results: ClipScored[] = out
      .map((r) => {
        const meta = byPrompt.get(r.label);
        return meta ? { ...meta, score: Math.max(0, Math.min(1, r.score)) } : null;
      })
      .filter((r): r is ClipScored => r !== null)
      .sort((a, b) => b.score - a.score);

    if (!results.length) return null;

    const top = results[0];
    const second = results[1]?.score ?? 0;
    const confidence = Math.max(
      top.score,
      Math.min(1, top.score / (top.score + second + 0.05))
    );

    return {
      ok: true,
      results,
      confidence: Number(confidence.toFixed(3)),
      quality: decoded.quality,
      model: CLIP_MODEL_ID,
    };
  } catch {
    return null;
  }
}

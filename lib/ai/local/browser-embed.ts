/**
 * lib/ai/local/browser-embed.ts — CLIP image embeddings IN the browser,
 * used for pre-submission duplicate detection.
 *
 * The citizen's phone already holds the CLIP model (downloaded for the
 * photo pre-check). The same model can embed any image into a 512-dim
 * vector; two photos of the same problem end up close together in that
 * space (high cosine similarity), so we can compare the new photo against
 * the first photo of each nearby active report — a real ML image-similarity
 * signal, computed on-device with zero extra infrastructure.
 *
 * The embedding pipeline ("clip-vit-base-patch32" without the zero-shot
 * head) shares the model weights cache with the classifier, so the first
 * duplicate check costs a small download; afterwards it's milliseconds.
 */
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EMBED_MODEL_ID = "Xenova/clip-vit-base-patch32";

let embedPipelinePromise: Promise<any> | null = null;

async function getEmbedder(): Promise<any> {
  if (!embedPipelinePromise) {
    embedPipelinePromise = (async () => {
      const tf = await import("@huggingface/transformers");
      tf.env.allowLocalModels = false;
      return tf.pipeline("image-feature-extraction", EMBED_MODEL_ID, {
        dtype: "q8",
      });
    })();
    embedPipelinePromise.catch(() => {
      embedPipelinePromise = null; // allow a retry on the next call
    });
  }
  return embedPipelinePromise;
}

/** True once the embedding pipeline is loaded in this browser. */
export function isEmbedderReady(): boolean {
  return embedPipelinePromise !== null;
}

/** Kick off the embedding-pipeline download in the background. */
export function preloadEmbedder(): void {
  void getEmbedder().catch(() => {
    // silent — duplicate checks just skip the image signal on failure
  });
}

/**
 * Decode a blob to a 224×224 canvas exactly like the classifier does
 * (same preprocessing → comparable vectors across calls).
 */
async function toRawImage(file: Blob): Promise<unknown> {
  const bitmap = await createImageBitmap(file);
  const clipCanvas = document.createElement("canvas");
  clipCanvas.width = 224;
  clipCanvas.height = 224;
  const ctx = clipCanvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("canvas 2d context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, 224, 224);
  bitmap.close?.();
  const { RawImage } = await import("@huggingface/transformers");
  return RawImage.fromCanvas(clipCanvas);
}

/** Embed one image blob into a normalized float vector. */
export async function embedImage(file: Blob): Promise<number[] | null> {
  try {
    const embedder = await getEmbedder();
    const image = await toRawImage(file);
    const out = (await embedder(image, { pooling: "mean", normalize: true })) as any;
    const data = out?.data ?? out?.tolist?.()?.[0];
    if (!data) return null;
    return Array.from(data as ArrayLike<number>);
  } catch (e) {
    console.warn("[browser-embed] failed:", e);
    return null;
  }
}

/** Cosine similarity of two vectors (both expected normalized). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Embed several candidate photos, best-effort — null for any that fail. */
export async function embedMany(
  blobs: (Blob | null)[]
): Promise<(number[] | null)[]> {
  return Promise.all(blobs.map((b) => (b ? embedImage(b) : Promise.resolve(null))));
}

/**
 * Next.js instrumentation — runs ONCE when the server process boots
 * (next dev and next start both call it).
 *
 * The local CLIP model is lazy-loaded on first use by default, which meant
 * the FIRST photo analyzed after every server restart paid the full cost:
 * route compile + ~150 MB model load. On phones that request easily outlives
 * the browser's patience and the citizen saw "AI check unavailable" every
 * single time. Kicking the load off at boot makes that first analyze as fast
 * as every later one.
 *
 * Fire-and-forget: a failed warm-up is logged and simply retried lazily by
 * the first real request — boot never blocks on it.
 */
export async function register() {
  // Guard: Next may evaluate this module in the edge runtime too — the CLIP
  // pipeline is Node-only (sharp / onnxruntime-node).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  import("@/lib/ai/local/clip")
    .then(async ({ warmUpClip }) => {
      const started = Date.now();
      const res = await warmUpClip();
      if (res.ok) {
        console.log(
          `[clip] model ready in ${((Date.now() - started) / 1000).toFixed(1)}s`
        );
      } else {
        console.warn(`[clip] warm-up failed (will retry on first use): ${res.error}`);
      }
    })
    .catch((e: unknown) => {
      console.warn(
        `[clip] warm-up could not start (will retry on first use): ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    });
}

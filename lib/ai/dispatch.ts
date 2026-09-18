/**
 * lib/ai/dispatch.ts — Server-side glue between the Next.js app and the AI
 * Edge Functions. Keeps call sites small and centralizes auth/env handling.
 */

const functionsUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function invoke<T>(name: string, body: unknown): Promise<T | null> {
  const url = functionsUrl();
  const key = anonKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(body),
      // AI can be slow; don't hang a request forever though
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Fire-and-forget photo analysis for a submitted report (existing flow). */
export async function runAiAnalysis(reportId: string): Promise<void> {
  await invoke("analyze-report", { reportId });
}

/**
 * Run AI ID verification for a user's uploaded ID photo.
 * Returns the Edge Function's result or null when the service is
 * unavailable — callers must treat null as "needs manual review".
 */
export async function verifyUserIdPhoto(input: {
  userId: string;
  idPath: string;
  registeredFullName: string;
}): Promise<{
  status: "passed" | "needs_review" | "failed";
  verification_score: number;
  ocr_confidence: number;
  extracted: Record<string, unknown> | null;
  reasons: string[];
  id_type: string | null;
} | null> {
  const res = await invoke<{
    ok: boolean;
    status: "passed" | "needs_review" | "failed";
    verification_score: number;
    ocr_confidence: number;
    extracted: Record<string, unknown> | null;
    reasons: string[];
    id_type: string | null;
  }>("verify-id", input);
  return res;
}

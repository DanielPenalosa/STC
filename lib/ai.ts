/**
 * Trigger AI analysis for a report by invoking the Supabase Edge Function
 * (`analyze-report`). Fire-and-forget: failures never block submission —
 * AI recommendations are advisory only.
 */
export async function runAiAnalysis(reportId: string): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return;

    await fetch(`${url}/functions/v1/analyze-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ reportId }),
    });
  } catch {
    // no-op — analysis can be re-run from the admin AI page
  }
}

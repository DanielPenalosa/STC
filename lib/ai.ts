/**
 * Trigger AI analysis for a report — fully LOCAL and FREE.
 *
 * The heavy lifting lives in lib/ai/local/service.ts:
 *   client verdict (browser CLIP, preferred) or server CLIP → urgency →
 *   routing → ai_analysis row → auto-assignment + notifications.
 *
 * `clientVerdict` is the analysis the citizen's browser already computed —
 * serverless hosts can't run server-side CLIP, so this is what makes the
 * admin side show the same 85% the citizen saw instead of "0% Unrecognized".
 *
 * Fire-and-forget: failures never block submission — AI recommendations
 * are advisory only and can be re-run from the admin AI page.
 */
export async function runAiAnalysis(
  reportId: string,
  clientVerdict?: import("@/lib/ai/local/decision").ClientAiVerdict | null
): Promise<void> {
  try {
    const { runLocalAnalysisForReport } = await import("@/lib/ai/local/service");
    await runLocalAnalysisForReport(reportId, clientVerdict);
  } catch {
    // no-op — analysis can be re-run from the admin AI page
  }
}

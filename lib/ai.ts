/**
 * Trigger AI analysis for a report — fully LOCAL and FREE.
 *
 * The heavy lifting lives in lib/ai/local/service.ts:
 *   CLIP zero-shot (Transformers.js, CPU) → urgency → routing →
 *   ai_analysis row → auto-assignment + notifications.
 *
 * Fire-and-forget: failures never block submission — AI recommendations
 * are advisory only and can be re-run from the admin AI page.
 */
export async function runAiAnalysis(reportId: string): Promise<void> {
  try {
    const { runLocalAnalysisForReport } = await import("@/lib/ai/local/service");
    await runLocalAnalysisForReport(reportId);
  } catch {
    // no-op — analysis can be re-run from the admin AI page
  }
}

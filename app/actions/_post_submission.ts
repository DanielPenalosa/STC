/**
 * app/actions/_post_submission.ts — the REAL post-submission pipeline,
 * moved into next/server's `after()`.
 *
 * Why: these steps used to run as floating `void` promises inside the
 * createReport server action. On Vercel, the serverless function is frozen
 * the instant the action responds, killing the promise mid-flight — so the
 * AI analysis never ran, no assignment was created, and reports stayed
 * "Submitted" forever (admins had to assign manually, exactly the thing the
 * pipeline was built to remove). `after()` runs AFTER the response is
 * streamed but INSIDE the request lifetime, which is the supported pattern
 * for this on both Vercel and self-hosted Node.
 */
import { after } from "next/server";
import { runAiAnalysis } from "@/lib/ai";
import { detectDuplicates } from "@/lib/ai/duplicate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewReportFacts } from "@/lib/ai/duplicate";
import type { ClientAiVerdict } from "@/lib/ai/local/decision";

export function schedulePostSubmissionTasks(args: {
  /** the regular authenticated client — duplicate detection reads with it */
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  reportId: string;
  clientVerdict: ClientAiVerdict | null;
  duplicateFacts: NewReportFacts;
}): void {
  const { supabase, reportId, clientVerdict, duplicateFacts } = args;

  // AI analysis + auto-assignment: the citizen's browser verdict rides along
  // so serverless hosts never need server-side CLIP for this step.
  after(async () => {
    await runAiAnalysis(reportId, clientVerdict);
  });

  // duplicate detection: flags look-alike reports + notifies admins
  after(() => detectDuplicates(supabase, reportId, duplicateFacts));
}

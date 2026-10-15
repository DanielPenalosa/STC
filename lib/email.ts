import { createTransport, type Transporter, type SendMailOptions } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/facebook";
import { STATUS_LABELS, type ReportStatus } from "@/lib/constants";

/**
 * Status-update emails to citizens — sent through the city's Gmail account
 * with a Gmail App Password (see SETUP.md → "Status-update emails").
 *
 *   SMTP_USER  = the Gmail address that sends (and appears as the From)
 *   SMTP_PASS  = the 16-char Gmail App Password (NOT the account password)
 *
 * Unconfigured (either var missing) → everything is a silent no-op, so the
 * app works identically before the env vars are added. Failures never break
 * the calling action: they're logged and dropped.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS, // Gmail App Password
      },
    });
  }
  return transporter;
}

export type StatusEmailInput = {
  reportId: string;
  refCode: string;
  title: string;
  status: ReportStatus;
  /** extra context: completion note, revision request, duplicate note… */
  note?: string | null;
  /** overrides the "Your report" default for duplicate closures etc. */
  subjectPrefix?: string;
};

/**
 * Email the report's citizen that its status changed. Called from the two
 * status-changing server actions (staff updateReportStatus, admin
 * setReportStatus/markAsDuplicate). Best-effort: throws never — logs only.
 */
export async function sendStatusUpdateEmail(
  input: StatusEmailInput,
  opts: { to: string; name: string | null }
): Promise<void> {
  if (!emailConfigured()) return;
  if (!opts.to) return;

  try {
    const db = createAdminClient();
    // admin kill switch — Admin → Settings (default: on)
    const { data: flag } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "email_updates")
      .maybeSingle();
    if ((flag?.value ?? "on") === "off") return;

    const label = STATUS_LABELS[input.status] ?? input.status;
    const link = `${appOrigin()}/dashboard/reports/${input.reportId}`;
    const who = opts.name?.trim() || "Resident";

    const subject = `${input.subjectPrefix ?? "Your report"} ${input.refCode} — ${label}`;
    const text = [
      `Hello ${who},`,
      "",
      `The status of your report "${input.title}" (${input.refCode}) is now: ${label}.`,
      ...(input.note ? ["", `Details: ${input.note}`] : [""]),
      "",
      `View your report: ${link}`,
      "",
      "— Smart Community Reporting System",
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
        <p style="font-size:15px">Hello <strong>${escapeHtml(who)}</strong>,</p>
        <p style="font-size:15px">
          The status of your report
          <strong>“${escapeHtml(input.title)}”</strong> (${escapeHtml(input.refCode)})
          is now:
          <span style="display:inline-block;background:#eef0fc;color:#1d2a83;border-radius:9999px;padding:2px 12px;font-weight:700;font-size:13px">${escapeHtml(label)}</span>
        </p>
        ${input.note ? `<p style="font-size:14px;color:#475569;background:#f8fafc;border-radius:12px;padding:12px 16px">${escapeHtml(input.note)}</p>` : ""}
        <p style="margin-top:20px">
          <a href="${link}" style="display:inline-block;background:#2333A0;color:#fff;border-radius:12px;padding:10px 20px;font-weight:700;font-size:14px;text-decoration:none">View your report</a>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px">Smart Community Reporting System — you receive this because this report changed status.</p>
      </div>`;

    const mail: SendMailOptions = {
      from: `"Smart Community Reporting" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject,
      text,
      html,
    };
    await getTransporter().sendMail(mail);
  } catch (e) {
    console.warn(
      "[email] status update email failed:",
      e instanceof Error ? e.message : e
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

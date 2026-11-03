import { createTransport, type Transporter, type SendMailOptions } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/facebook";
import { STATUS_LABELS, type ReportStatus } from "@/lib/constants";

/**
 * Status-update emails to citizens — sent through Gmail using OAuth2.
 *
 *   SMTP_USER          = Gmail address that sends (scoutgov13@gmail.com)
 *   GMAIL_CLIENT_ID    = OAuth2 client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET= OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN= OAuth2 refresh token
 *
 * All four vars must be set; missing any → silent no-op so the app works
 * identically before email is configured. Failures never break the caller.
 */
export function emailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_USER &&
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.SMTP_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
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
  note?: string | null;
  subjectPrefix?: string;
};

/**
 * Email the report's citizen that its status changed. Best-effort: never
 * throws — logs only.
 */
export async function sendStatusUpdateEmail(
  input: StatusEmailInput,
  opts: { to: string; name: string | null }
): Promise<void> {
  if (!emailConfigured()) return;
  if (!opts.to) return;

  try {
    const db = createAdminClient();
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

    const statusColor: Record<string, string> = {
      submitted:    "#475569",
      under_review: "#d97706",
      verified:     "#2563eb",
      assigned:     "#7c3aed",
      in_progress:  "#0891b2",
      done:         "#16a34a",
      resolved:     "#15803d",
      closed:       "#64748b",
      rejected:     "#dc2626",
    };
    const dot = statusColor[input.status] ?? "#2333A0";

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#030B65,#2333A0);padding:28px 36px;text-align:center">
          <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px">SCOUT</p>
          <p style="margin:4px 0 0;font-size:11px;color:#93c5fd;letter-spacing:0.15em;text-transform:uppercase">Sta. Cruz Community Reporting</p>
        </div>

        <!-- Body -->
        <div style="padding:32px 36px">
          <p style="margin:0 0 4px;font-size:15px;color:#1e293b">Hello <strong>${escapeHtml(who)}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
            There&apos;s an update on your report.
          </p>

          <!-- Report card -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px 24px;margin-bottom:24px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8">${escapeHtml(input.refCode)}</p>
            <p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#0f172a">${escapeHtml(input.title)}</p>
            <div style="display:inline-flex;align-items:center;gap:6px;background:#ffffff;border:1px solid #e2e8f0;border-radius:9999px;padding:5px 14px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot}"></span>
              <span style="font-size:13px;font-weight:700;color:${dot}">${escapeHtml(label)}</span>
            </div>
          </div>

          ${input.note ? `
          <!-- Note -->
          <div style="background:#f1f5f9;border-left:3px solid #2333A0;border-radius:0 12px 12px 0;padding:14px 18px;margin-bottom:24px">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8">Note from staff</p>
            <p style="margin:0;font-size:14px;color:#334155;line-height:1.6">${escapeHtml(input.note)}</p>
          </div>` : ""}

          <!-- CTA -->
          <div style="text-align:center">
            <a href="${link}" style="display:inline-block;background:#2333A0;color:#ffffff;border-radius:14px;padding:13px 28px;font-size:14px;font-weight:700;text-decoration:none">
              View your report
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center">
          <p style="margin:0;font-size:11px;color:#cbd5e1">© SCOUT · Sta. Cruz, Laguna · You received this because your report status changed.</p>
        </div>

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

/**
 * Send a 6-digit password reset code to a citizen.
 * Uses the same Gmail OAuth2 transporter as status update emails.
 */
export async function sendPasswordResetCode(opts: {
  to: string;
  code: string;
}): Promise<void> {
  if (!emailConfigured()) throw new Error("Email not configured.");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:linear-gradient(135deg,#030B65,#2333A0);padding:32px 40px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">SCOUT</p>
        <p style="margin:4px 0 0;font-size:12px;color:#93c5fd;letter-spacing:0.15em;text-transform:uppercase">Sta. Cruz Community Reporting</p>
      </div>
      <div style="padding:36px 40px">
        <p style="margin:0 0 6px;font-size:15px;color:#1e293b">Hello,</p>
        <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6">
          We received a request to reset your password. Enter the code below in the app — it expires in <strong>10 minutes</strong>.
        </p>
        <div style="background:#f1f5f9;border-radius:16px;padding:24px;text-align:center;margin-bottom:28px;border:1px solid #e2e8f0">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8">Your reset code</p>
          <p style="margin:0;font-size:48px;font-weight:800;letter-spacing:0.25em;color:#030B65;font-variant-numeric:tabular-nums">${opts.code}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center">If you didn't request this, you can safely ignore this email.</p>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
        <p style="margin:0;font-size:11px;color:#cbd5e1">© SCOUT · Sta. Cruz, Laguna</p>
      </div>
    </div>`;

  const mail: SendMailOptions = {
    from: `"SCOUT Sta. Cruz" <${process.env.SMTP_USER}>`,
    to: opts.to,
    subject: "Your SCOUT password reset code",
    text: `Your SCOUT password reset code is: ${opts.code}\n\nIt expires in 10 minutes. Do not share it with anyone.`,
    html,
  };
  await getTransporter().sendMail(mail);
}

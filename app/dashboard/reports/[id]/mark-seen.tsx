"use client";

import { useEffect } from "react";
import { markReportNotificationsRead } from "@/app/actions/notifications";
import { rememberSeenUpdate } from "@/lib/report-seen";
import { useNotifications } from "@/components/providers";

/**
 * Renders nothing. Fires once when a report's detail page opens: remembers
 * this version as "seen" (so the Reports-list UPDATED highlight clears, in
 * this browser) and marks the viewer's notifications for this report read,
 * dropping the bell badge and the per-page nav badges.
 */
export default function MarkReportSeen({
  reportId,
  updatedAt,
}: {
  reportId: string;
  updatedAt: string;
}) {
  const { refresh } = useNotifications();
  useEffect(() => {
    rememberSeenUpdate(reportId, updatedAt);
    // best-effort: the highlight is already dismissed locally; a failed
    // mark-read just leaves the badge until the notifications page is opened
    void markReportNotificationsRead(reportId)
      .then(() => refresh())
      .catch((err) =>
        console.warn("markReportNotificationsRead failed", err)
      );
    // fire once per opened report version; refresh identity is not needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, updatedAt]);
  return null;
}

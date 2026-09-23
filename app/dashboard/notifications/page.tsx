"use client";

import Link from "next/link";
import { useState } from "react";
import { useNotifications } from "@/components/providers";
import {
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  deleteAllMyNotifications,
} from "@/app/actions/notifications";
import { PageHeader, EmptyState, btn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Notification } from "@/lib/types";

function typeIcon(n: Notification) {
  if (n.type === "urgent") return "alert" as const;
  if (n.type === "assignment") return "inbox" as const;
  if (n.type === "ai_review") return "robot" as const;
  return "bell" as const;
}

export default function NotificationsPage() {
  const { notifications, refresh } = useNotifications();
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter((n) => !n.is_read).length;

  async function open(n: Notification) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      await refresh();
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You're all caught up"}
        action={
          notifications.length > 0 ? (
            <div className="flex gap-2">
              {unread > 0 && (
                <button
                  onClick={async () => {
                    await markAllNotificationsRead();
                    await refresh();
                  }}
                  className={btn.secondary}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={async () => {
                  setBusy(true);
                  await deleteAllMyNotifications();
                  await refresh();
                  setBusy(false);
                }}
                disabled={busy}
                className={btn.danger}
              >
                Clear
              </button>
            </div>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon="bell" title="No notifications" hint="Status updates will appear here." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const icon = typeIcon(n);
            const urgent = n.type === "urgent";
            return (
              <div
                key={n.id}
                className={`group flex items-start gap-3 rounded-2xl border p-4 transition ${
                  n.is_read
                    ? "border-slate-200 bg-white"
                    : "border-accent-200 bg-accent-50/40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    urgent
                      ? "bg-danger-50 text-danger-500"
                      : n.is_read
                      ? "bg-slate-50 text-slate-400"
                      : "bg-accent-50 text-accent-600"
                  }`}
                >
                  <Icon name={icon} size="md" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-slate-800">
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug text-slate-500">{n.body}</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  {n.report_id && (
                    <Link
                      href={`/dashboard/reports/${n.report_id}`}
                      onClick={() => void open(n)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                    >
                      Open report
                      <Icon name="chevron-right" size="sm" />
                    </Link>
                  )}
                </div>

                <button
                  onClick={async () => {
                    await deleteNotification(n.id);
                    await refresh();
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-danger-50 hover:text-danger-500"
                  aria-label="Delete notification"
                >
                  <Icon name="trash" size="md" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
